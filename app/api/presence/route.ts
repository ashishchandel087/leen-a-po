import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPresence } from "@/lib/chat-bus";

// GET — return all users with their lastSeenAt + lastReadAt for the chat client.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    select: { id: true, name: true, lastSeenAt: true, lastReadAt: true },
  });
  return NextResponse.json(users);
}

// POST — heartbeat. Client calls this every ~25s while chat is open.
// Updates lastSeenAt and broadcasts the change so partners see "Online".
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenAt: now },
  });
  publishPresence({
    userId: session.user.id,
    userName: session.user.name ?? "",
    lastSeenAt: now.toISOString(),
  });
  return NextResponse.json({ ok: true, lastSeenAt: now.toISOString() });
}
