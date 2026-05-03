import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const occasions = await prisma.specialOccasion.findMany({
    orderBy: { date: "asc" },
  });
  return NextResponse.json(occasions);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, date, emoji, note } = await req.json();
  if (!title || !date) {
    return NextResponse.json({ error: "Title and date are required" }, { status: 400 });
  }

  const occasion = await prisma.specialOccasion.create({
    data: {
      title,
      date,
      emoji: emoji || "🎉",
      note: note || null,
    },
  });
  return NextResponse.json(occasion);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await prisma.specialOccasion.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
