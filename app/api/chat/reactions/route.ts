import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishReaction } from "@/lib/chat-bus";

// POST — toggle a reaction on a message.
// Body: { messageId, emoji }
// If the user has already reacted with this emoji on this message, removes it.
// Otherwise adds it. Multi-emoji reactions per user/message are allowed.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId, emoji } = (await req.json().catch(() => ({}))) as {
    messageId?: string;
    emoji?: string;
  };
  if (typeof messageId !== "string" || !messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }
  const cleanEmoji = typeof emoji === "string" ? emoji.trim() : "";
  if (!cleanEmoji || cleanEmoji.length > 8) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  // Verify the message exists (and isn't deleted).
  const msg = await prisma.message.findFirst({
    where: { id: messageId, deletedAt: null },
    select: { id: true },
  });
  if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  // Toggle: try delete first, if it didn't exist insert.
  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId,
        userId: session.user.id,
        emoji: cleanEmoji,
      },
    },
  });

  let action: "add" | "remove";
  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    action = "remove";
  } else {
    await prisma.messageReaction.create({
      data: { messageId, userId: session.user.id, emoji: cleanEmoji },
    });
    action = "add";
  }

  publishReaction({
    messageId,
    userId: session.user.id,
    userName: session.user.name ?? "",
    emoji: cleanEmoji,
    action,
  });

  return NextResponse.json({ ok: true, action });
}
