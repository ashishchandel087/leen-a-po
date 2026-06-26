import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — fetch all bucket list items
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.bucketItem.findMany({
    where: { deletedAt: null },
    orderBy: [{ completed: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

// POST — add a new bucket item
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title } = await req.json().catch(() => ({}));
  const clean = typeof title === "string" ? title.trim().slice(0, 300) : "";
  if (!clean) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const item = await prisma.bucketItem.create({
    data: { title: clean, addedById: session.user.id },
  });
  return NextResponse.json(item);
}

// PATCH — toggle complete/incomplete
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, completed } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id || typeof completed !== "boolean") {
    return NextResponse.json({ error: "id and completed required" }, { status: 400 });
  }
  const { count } = await prisma.bucketItem.updateMany({
    where: { id, deletedAt: null },
    data: {
      completed,
      completedAt: completed ? new Date() : null,
    },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

// DELETE — remove an item
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await prisma.bucketItem.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ success: true });
}
