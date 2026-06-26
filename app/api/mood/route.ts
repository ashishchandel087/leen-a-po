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

  const { mood, note } = await req.json().catch(() => ({}));
  const cleanMood = typeof mood === "string" ? mood.trim().slice(0, 50) : "";
  if (!cleanMood) return NextResponse.json({ error: "Mood required" }, { status: 400 });
  const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;

  const log = await prisma.moodLog.create({
    data: { mood: cleanMood, note: cleanNote, userId: session.user.id },
    include: { user: { select: { name: true } } },
  });

  // Notify the partner — fire-and-forget, never block the response.
  const moodPreview = cleanMood;
  const notePreview = cleanNote ? ` — ${cleanNote}` : "";
  const fullBody = `feeling ${moodPreview}${notePreview}`;
  sendPushToOthers(session.user.id, {
    title: `💭 ${session.user.name}`,
    body: fullBody.length > 120 ? fullBody.slice(0, 119) + "…" : fullBody,
    url: "/dashboard",
  }).catch(() => {});

  return NextResponse.json(log);
}
