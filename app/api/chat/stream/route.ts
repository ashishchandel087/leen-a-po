import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { subscribe } from "@/lib/chat-bus";

// Long-lived response — must be Node runtime, never cached/pre-rendered.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

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

      // Subscribe to the bus
      const unsubscribe = subscribe({
        message: (payload) => enqueue(`event: message\ndata: ${JSON.stringify(payload)}\n\n`),
        delete: (id) => enqueue(`event: delete\ndata: ${JSON.stringify({ id })}\n\n`),
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
