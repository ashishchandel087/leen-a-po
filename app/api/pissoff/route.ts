import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logs = await prisma.pissOffLog.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(logs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { who, reason, level, date } = await req.json();
  if (!who || !reason || !level) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (level < 1 || level > 5) {
    return NextResponse.json({ error: "Level must be 1–5" }, { status: 400 });
  }

  const createdAt = date ? new Date(date) : new Date();

  const log = await prisma.pissOffLog.create({
    data: { who, reason, level: Number(level), createdAt },
  });
  return NextResponse.json(log);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await prisma.pissOffLog.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ success: true });
}
