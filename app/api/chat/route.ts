import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToOthers } from "@/lib/push";
import { publishMessage, publishDelete } from "@/lib/chat-bus";

const MAX_TEXT_LENGTH = 2000;

// GET — fetch messages, ordered oldest→newest for natural chat flow.
//   no params      : last 100 messages
//   ?before=<ISO>  : 100 messages older than the given timestamp (for infinite scroll)
//   ?since=<ISO>   : up to 200 messages newer than the given timestamp (legacy polling)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = req.nextUrl.searchParams.get("since");
  const before = req.nextUrl.searchParams.get("before");

  const where: {
    deletedAt: null;
    createdAt?: { gt?: Date; lt?: Date };
  } = { deletedAt: null };

  if (since) {
    const d = new Date(since);
    if (!isNaN(d.getTime())) where.createdAt = { gt: d };
  } else if (before) {
    const d = new Date(before);
    if (!isNaN(d.getTime())) where.createdAt = { lt: d };
  }

  const messages = await prisma.message.findMany({
    where,
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { createdAt: since ? "asc" : "desc" },
    take: since ? 200 : 100,
  });

  // For initial load and `?before` paging we fetch desc so we get the latest
  // page; reverse to oldest→newest before returning so the client can prepend
  // / append in chronological order without re-sorting.
  return NextResponse.json(since ? messages : messages.reverse());
}

// POST — send a message
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = await req.json();
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return NextResponse.json({ error: "Message required" }, { status: 400 });
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `Max ${MAX_TEXT_LENGTH} characters` }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { text: trimmed, senderId: session.user.id },
    include: { sender: { select: { id: true, name: true } } },
  });

  // Fan out to all live SSE listeners (both partners' open chat tabs).
  publishMessage(message);

  // Native push to anyone whose tab is closed.
  sendPushToOthers(session.user.id, {
    title: `💬 ${session.user.name}`,
    body: trimmed.length > 80 ? trimmed.slice(0, 79) + "…" : trimmed,
    url: "/chat",
  }).catch(() => {});

  return NextResponse.json(message);
}

// DELETE — sender can delete their own message (soft delete)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const msg = await prisma.message.findUnique({ where: { id } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg.senderId !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.message.update({ where: { id }, data: { deletedAt: new Date() } });
  publishDelete(id);
  return NextResponse.json({ ok: true });
}
