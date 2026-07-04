import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signGet, isValidStickerKey } from "@/lib/r2";

// GET — list every (non-deleted) pack with its (non-deleted) stickers.
// Each sticker comes back with a short-lived signed URL so the client can
// render it. URL expires in 1 hour; client refreshes by reloading the picker.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const packs = await prisma.stickerPack.findMany({
    where: { deletedAt: null },
    include: {
      stickers: {
        where: { deletedAt: null },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  // Sign per-sticker with allSettled — one bad key shouldn't 500 the whole
  // picker. Failed stickers are dropped (and logged) rather than fatal.
  const out = await Promise.all(
    packs.map(async (p) => {
      const settled = await Promise.allSettled(
        p.stickers.map(async (s) => ({
          id: s.id,
          key: s.key,
          url: await signGet(s.key, 3600),
        }))
      );
      const stickers: { id: string; key: string; url: string }[] = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") {
          stickers.push(r.value);
        } else {
          console.warn(`[stickers] failed to sign key "${p.stickers[i].key}":`, r.reason);
        }
      });
      return { id: p.id, name: p.name, emoji: p.emoji, stickers };
    })
  );

  return NextResponse.json(out);
}

// POST — create a sticker (admin only). Body: { packId, key }
//   `key` must already exist in R2 (uploaded via /api/upload/sign with kind="sticker").
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { packId, key } = await req.json().catch(() => ({}));
  if (typeof packId !== "string" || !packId) {
    return NextResponse.json({ error: "packId required" }, { status: 400 });
  }
  if (!isValidStickerKey(key)) {
    return NextResponse.json({ error: "Invalid sticker key" }, { status: 400 });
  }

  const pack = await prisma.stickerPack.findUnique({ where: { id: packId } });
  if (!pack || pack.deletedAt) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const sticker = await prisma.sticker.create({
    data: { packId, key },
  });

  return NextResponse.json({
    id: sticker.id,
    key: sticker.key,
    url: await signGet(sticker.key, 3600),
  });
}

// DELETE — soft-delete a sticker (admin). Body: { id }
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

  const { count } = await prisma.sticker.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
