import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const occasions = await prisma.specialOccasion.findMany({
    where: { deletedAt: null },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(occasions);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, date, emoji, note } = await req.json().catch(() => ({}));
  const cleanTitle = typeof title === "string" ? title.trim().slice(0, 100) : "";
  if (!cleanTitle) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) required" }, { status: 400 });
  }
  const cleanEmoji = typeof emoji === "string" && emoji.trim() ? emoji.trim().slice(0, 4) : "🎉";
  const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;

  const occasion = await prisma.specialOccasion.create({
    data: {
      title: cleanTitle,
      date,
      emoji: cleanEmoji,
      note: cleanNote,
    },
  });
  return NextResponse.json(occasion);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { count } = await prisma.specialOccasion.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
