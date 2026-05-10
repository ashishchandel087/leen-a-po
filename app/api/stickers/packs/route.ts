import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST — create a sticker pack (admin only). Body: { name, emoji? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { name, emoji } = await req.json().catch(() => ({}));
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  if (trimmedName.length > 50) {
    return NextResponse.json({ error: "Name too long (max 50)" }, { status: 400 });
  }

  const cleanEmoji = typeof emoji === "string" ? emoji.trim().slice(0, 4) : null;

  const pack = await prisma.stickerPack.create({
    data: { name: trimmedName, emoji: cleanEmoji || null },
  });
  return NextResponse.json({
    id: pack.id,
    name: pack.name,
    emoji: pack.emoji,
    stickers: [],
  });
}

// DELETE — soft-delete a pack (admin). Body: { id }
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await prisma.stickerPack.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
