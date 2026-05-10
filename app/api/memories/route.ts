import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signKeys, isValidMemoryKey } from "@/lib/r2";

const MAX_CAPTION = 1000;
const MAX_LOCATION = 200;
const MAX_ATTACHMENTS = 10;

type ApiMemory = {
  id: string;
  date: string;
  caption: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  uploadedBy: { id: string; name: string };
  attachments: string[]; // signed URLs
  createdAt: Date;
};

async function toApiMemory(m: {
  id: string;
  date: string;
  caption: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  attachments: string[];
  createdAt: Date;
  uploadedBy: { id: string; name: string };
}): Promise<ApiMemory> {
  return {
    id: m.id,
    date: m.date,
    caption: m.caption,
    location: m.location,
    lat: m.lat,
    lng: m.lng,
    uploadedBy: m.uploadedBy,
    attachments: await signKeys(m.attachments ?? []),
    createdAt: m.createdAt,
  };
}

// GET — list memories newest-date first.
//   ?cursor=<id>   — paginate (id of last memory from previous page)
//   ?limit=N       — page size, default 60, max 200
//   ?from=YYYY-MM  — filter by month (YYYY-MM-01 .. YYYY-MM-31 lexicographic)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cursor = req.nextUrl.searchParams.get("cursor");
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "60", 10);
  const limit = Math.min(Math.max(limitParam, 1), 200);
  const from = req.nextUrl.searchParams.get("from");

  const where: {
    deletedAt: null;
    date?: { gte?: string; lte?: string };
  } = { deletedAt: null };
  if (from && /^\d{4}-\d{2}$/.test(from)) {
    where.date = { gte: `${from}-01`, lte: `${from}-31` };
  }

  const memories = await prisma.memory.findMany({
    where,
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = memories.length > limit;
  const page = hasMore ? memories.slice(0, limit) : memories;
  const out = await Promise.all(page.map(toApiMemory));

  return NextResponse.json({
    items: out,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

// POST — create a memory
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { date, caption, location, lat, lng, attachments } = body as {
    date?: unknown;
    caption?: unknown;
    location?: unknown;
    lat?: unknown;
    lng?: unknown;
    attachments?: unknown;
  };

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) required" }, { status: 400 });
  }
  const cleanCaption = typeof caption === "string" ? caption.trim().slice(0, MAX_CAPTION) : "";
  const cleanLocation =
    typeof location === "string" && location.trim()
      ? location.trim().slice(0, MAX_LOCATION)
      : null;
  const cleanLat =
    typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
  const cleanLng =
    typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;

  const rawAttachments: unknown[] = Array.isArray(attachments) ? attachments : [];
  const cleanAttachments: string[] = rawAttachments
    .filter((k) => isValidMemoryKey(k, session.user.id))
    .slice(0, MAX_ATTACHMENTS);

  if (cleanAttachments.length === 0) {
    return NextResponse.json({ error: "At least one image is required" }, { status: 400 });
  }

  const memory = await prisma.memory.create({
    data: {
      date,
      caption: cleanCaption,
      location: cleanLocation,
      lat: cleanLat,
      lng: cleanLng,
      attachments: cleanAttachments,
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json(await toApiMemory(memory));
}

// DELETE — uploader (or admin) can soft-delete a memory.
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const m = await prisma.memory.findUnique({ where: { id } });
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (m.uploadedById !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.memory.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
