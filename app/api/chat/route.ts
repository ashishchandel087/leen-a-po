import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToOthers } from "@/lib/push";
import { publishMessage, publishDelete } from "@/lib/chat-bus";
import { isValidAttachmentKey, signKeys } from "@/lib/r2";

const MAX_TEXT_LENGTH = 2000;
const MAX_ATTACHMENTS = 6;

type ApiMessage = {
  id: string;
  text: string;
  createdAt: Date;
  sender: { id: string; name: string };
  attachments: string[];
  reactions: { userId: string; userName: string; emoji: string }[];
  replyTo: {
    id: string;
    text: string;
    sender: { id: string; name: string };
    attachments: string[];
  } | null;
};

type RawMessage = {
  id: string;
  text: string;
  createdAt: Date;
  attachments: string[];
  sender: { id: string; name: string };
  replyTo: {
    id: string;
    text: string;
    deletedAt: Date | null;
    attachments: string[];
    sender: { id: string; name: string };
  } | null;
  reactions: { userId: string; emoji: string; user: { name: string } }[];
};

async function toApiMessage(m: RawMessage): Promise<ApiMessage> {
  const replyTo =
    m.replyTo && !m.replyTo.deletedAt
      ? {
          id: m.replyTo.id,
          text: m.replyTo.text,
          sender: m.replyTo.sender,
          attachments: await signKeys(m.replyTo.attachments ?? []),
        }
      : null;
  return {
    id: m.id,
    text: m.text,
    createdAt: m.createdAt,
    sender: m.sender,
    attachments: await signKeys(m.attachments ?? []),
    reactions: (m.reactions ?? []).map((r) => ({
      userId: r.userId,
      userName: r.user.name,
      emoji: r.emoji,
    })),
    replyTo,
  };
}

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true } },
  reactions: { include: { user: { select: { name: true } } } },
  replyTo: {
    select: {
      id: true,
      text: true,
      deletedAt: true,
      attachments: true,
      sender: { select: { id: true, name: true } },
    },
  },
} as const;

// GET — fetch messages, ordered oldest→newest for natural chat flow.
//   no params      : last 100 messages
//   ?before=<ISO>  : 100 older than the given timestamp (infinite scroll)
//   ?since=<ISO>   : up to 200 newer than the given timestamp
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = req.nextUrl.searchParams.get("since");
  const before = req.nextUrl.searchParams.get("before");

  const where: { deletedAt: null; createdAt?: { gt?: Date; lt?: Date } } = { deletedAt: null };
  if (since) {
    const d = new Date(since);
    if (!isNaN(d.getTime())) where.createdAt = { gt: d };
  } else if (before) {
    const d = new Date(before);
    if (!isNaN(d.getTime())) where.createdAt = { lt: d };
  }

  // Fetch one extra row so we can tell the client whether more exist beyond
  // this page — surfaced via the X-Has-More header (body stays a bare array).
  const limit = since ? 200 : 100;
  const messages = await prisma.message.findMany({
    where,
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: since ? "asc" : "desc" },
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const ordered = since ? page : page.reverse();
  const out = await Promise.all(ordered.map((m) => toApiMessage(m as RawMessage)));
  return NextResponse.json(out, { headers: { "X-Has-More": hasMore ? "true" : "false" } });
}

// POST — send a message
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { text, attachments, replyToId, clientId } = body as {
    text?: unknown;
    attachments?: unknown;
    replyToId?: unknown;
    clientId?: unknown;
  };

  // Optional client-generated id — echoed back (response + bus) so the sender
  // can match its optimistic bubble. Never persisted; silently ignored if bad.
  const cleanClientId =
    typeof clientId === "string" && clientId.length > 0 && clientId.length <= 64
      ? clientId
      : null;

  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `Max ${MAX_TEXT_LENGTH} characters` }, { status: 400 });
  }

  const rawAttachments: unknown[] = Array.isArray(attachments) ? attachments : [];
  const cleanAttachments: string[] = rawAttachments
    .filter((k) => isValidAttachmentKey(k, session.user.id))
    .slice(0, MAX_ATTACHMENTS);

  if (!trimmed && cleanAttachments.length === 0) {
    return NextResponse.json({ error: "Message or attachment required" }, { status: 400 });
  }

  // Validate replyToId if present — must reference a real (non-deleted) message
  let validReplyToId: string | null = null;
  if (typeof replyToId === "string" && replyToId) {
    const replyTarget = await prisma.message.findFirst({
      where: { id: replyToId, deletedAt: null },
      select: { id: true },
    });
    if (replyTarget) validReplyToId = replyTarget.id;
  }

  const message = await prisma.message.create({
    data: {
      text: trimmed,
      attachments: cleanAttachments,
      senderId: session.user.id,
      replyToId: validReplyToId,
    },
    include: MESSAGE_INCLUDE,
  });

  const apiMessage = cleanClientId
    ? { ...(await toApiMessage(message as RawMessage)), clientId: cleanClientId }
    : await toApiMessage(message as RawMessage);
  publishMessage(apiMessage);

  // Push notification — describe the message accurately.
  const previewText = trimmed
    ? trimmed.length > 80 ? trimmed.slice(0, 79) + "…" : trimmed
    : cleanAttachments.length === 1
    ? "📷 sent a photo"
    : `📷 sent ${cleanAttachments.length} photos`;
  sendPushToOthers(session.user.id, {
    title: `💬 ${session.user.name}`,
    body: previewText,
    url: "/chat",
  }).catch(() => {});

  return NextResponse.json(apiMessage);
}

// DELETE — sender can delete their own message (soft delete)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const msg = await prisma.message.findUnique({ where: { id } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg.senderId !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.message.update({ where: { id }, data: { deletedAt: new Date() } });
  publishDelete(id);
  return NextResponse.json({ ok: true });
}
