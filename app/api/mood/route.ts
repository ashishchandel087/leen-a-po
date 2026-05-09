import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToOthers } from "@/lib/push";

// GET — fetch all mood logs
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const moods = await prisma.moodLog.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json(moods);
}

// POST — log a mood
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { mood, note } = await req.json();
  if (!mood) return NextResponse.json({ error: "Mood required" }, { status: 400 });

  const log = await prisma.moodLog.create({
    data: { mood, note, userId: session.user.id },
    include: { user: { select: { name: true } } },
  });

  // Notify the partner — fire-and-forget, never block the response.
  const moodPreview = String(mood).trim();
  const notePreview = note ? ` — ${String(note).trim()}` : "";
  const fullBody = `feeling ${moodPreview}${notePreview}`;
  sendPushToOthers(session.user.id, {
    title: `💭 ${session.user.name}`,
    body: fullBody.length > 120 ? fullBody.slice(0, 119) + "…" : fullBody,
    url: "/dashboard",
  }).catch(() => {});

  return NextResponse.json(log);
}
