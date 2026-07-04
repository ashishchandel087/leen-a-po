import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { subscribe } from "@/lib/chat-bus";

// Long-lived response — must be Node runtime, never cached/pre-rendered.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";
// Serverless platforms kill the SSE stream at the function timeout — stretch it (the client reconnects).
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const enqueue = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true;
        }
      };

      // Greeting comment so the client immediately sees the connection open.
      enqueue(`: connected\n\n`);

      // Subscribe to the bus — forward each event type to the SSE stream.
      const unsubscribe = subscribe({
        message: (e) => enqueue(`event: message\ndata: ${JSON.stringify(e.payload)}\n\n`),
        delete: (e) => enqueue(`event: delete\ndata: ${JSON.stringify({ id: e.id })}\n\n`),
        reaction: (e) =>
          enqueue(
            `event: reaction\ndata: ${JSON.stringify({
              messageId: e.messageId,
              userId: e.userId,
              userName: e.userName,
              emoji: e.emoji,
              action: e.action,
            })}\n\n`
          ),
        read: (e) =>
          enqueue(`event: read\ndata: ${JSON.stringify({ userId: e.userId, lastReadAt: e.lastReadAt })}\n\n`),
        typing: (e) =>
          enqueue(
            `event: typing\ndata: ${JSON.stringify({
              userId: e.userId,
              userName: e.userName,
              isTyping: e.isTyping,
            })}\n\n`
          ),
        presence: (e) =>
          enqueue(
            `event: presence\ndata: ${JSON.stringify({
              userId: e.userId,
              userName: e.userName,
              lastSeenAt: e.lastSeenAt,
            })}\n\n`
          ),
        wallpaper: (e) =>
          enqueue(
            `event: wallpaper\ndata: ${JSON.stringify({
              preset: e.preset,
              imageUrl: e.imageUrl,
            })}\n\n`
          ),
      });

      // Heartbeat — keeps proxies (ngrok, Vercel, nginx) from killing the
      // idle connection. Comment lines are ignored by EventSource.
      const heartbeat = setInterval(() => enqueue(`: ping ${Date.now()}\n\n`), 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Client disconnect (tab closed / navigated away)
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx-style hint)
      "X-Accel-Buffering": "no",
    },
  });
}
