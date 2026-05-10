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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { lastReadAt: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.lastReadAt && user.lastReadAt >= ts) {
    // No-op — never go backwards.
    return NextResponse.json({ ok: true, lastReadAt: user.lastReadAt.toISOString() });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastReadAt: ts },
  });
  publishRead({ userId: session.user.id, lastReadAt: ts.toISOString() });

  return NextResponse.json({ ok: true, lastReadAt: ts.toISOString() });
}
