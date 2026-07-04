import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishRead } from "@/lib/chat-bus";

// POST — mark messages as read up to a given timestamp.
// Body: { upToCreatedAt: ISO string }
// We only ever advance lastReadAt forward, never backward.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { upToCreatedAt } = (await req.json().catch(() => ({}))) as { upToCreatedAt?: string };
  if (typeof upToCreatedAt !== "string") {
    return NextResponse.json({ error: "upToCreatedAt required" }, { status: 400 });
  }
  const ts = new Date(upToCreatedAt);
  if (isNaN(ts.getTime())) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }

  // Single atomic update — the "never go backwards" guard lives in the WHERE
  // clause, so concurrent requests can't interleave a stale read-then-write.
  const { count } = await prisma.user.updateMany({
    where: {
      id: session.user.id,
      OR: [{ lastReadAt: null }, { lastReadAt: { lt: ts } }],
    },
    data: { lastReadAt: ts },
  });
  if (count > 0) {
    publishRead({ userId: session.user.id, lastReadAt: ts.toISOString() });
  }

  return NextResponse.json({ ok: true, lastReadAt: ts.toISOString() });
}
