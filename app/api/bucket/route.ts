import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — fetch all bucket list items
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.bucketItem.findMany({
    orderBy: [{ completed: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

// POST — add a new bucket item
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const item = await prisma.bucketItem.create({
    data: { title: title.trim(), addedById: session.user.id },
  });
  return NextResponse.json(item);
}

// PATCH — toggle complete/incomplete
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, completed } = await req.json();
  const item = await prisma.bucketItem.update({
    where: { id },
    data: {
      completed,
      completedAt: completed ? new Date() : null,
    },
  });
  return NextResponse.json(item);
}

// DELETE — remove an item
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await prisma.bucketItem.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
