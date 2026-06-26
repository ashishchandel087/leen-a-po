import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.timelineEvent.findMany({
    orderBy: { date: "asc" },
  });
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { type, date, endDate, title, reason } = await req.json().catch(() => ({}));
  const VALID_TYPES = ["start", "break", "reunion", "milestone"];
  if (typeof type !== "string" || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) required" }, { status: 400 });
  }
  if (endDate != null && (typeof endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
    return NextResponse.json({ error: "endDate must be YYYY-MM-DD" }, { status: 400 });
  }
  const cleanTitle = typeof title === "string" ? title.trim().slice(0, 100) : "";
  if (!cleanTitle) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }
  const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
  const event = await prisma.timelineEvent.create({
    data: { type, date, endDate: endDate || null, title: cleanTitle, reason: cleanReason },
  });
  return NextResponse.json(event);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { count } = await prisma.timelineEvent.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
