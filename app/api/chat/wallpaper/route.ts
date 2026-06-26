import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signGet, putR2 } from "@/lib/r2";
import { publishWallpaper } from "@/lib/chat-bus";
import {
  DEFAULT_WALLPAPER,
  WALLPAPER_CONFIG_KEY,
  isWallpaperId,
  isWallpaperImageKey,
  type ResolvedWallpaper,
} from "@/lib/wallpapers";

// Custom images are proxied through here (browser → server → R2), so the
// browser never uploads to R2 directly and no R2 CORS config is needed.
export const runtime = "nodejs";

// Presigned GET URLs live at most 7 days. We sign near the max and the client
// re-fetches on load / on the live "wallpaper" event, so it never goes stale.
// (A GET URL used as a CSS background / <img> needs no CORS.)
const IMAGE_URL_TTL = 7 * 24 * 60 * 60;

const WALLPAPER_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
// Kept under typical serverless request-body limits (~4.5 MB on Vercel) since
// the file now flows through the function rather than straight to R2.
const WALLPAPER_MAX_BYTES = 4 * 1024 * 1024;

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

// Turn the stored Config value (a preset id or an R2 key) into something the
// client can apply directly.
async function resolve(value: string | null | undefined): Promise<ResolvedWallpaper> {
  if (isWallpaperId(value)) return { preset: value, imageUrl: null };
  if (isWallpaperImageKey(value)) {
    try {
      return { preset: "default", imageUrl: await signGet(value, IMAGE_URL_TTL) };
    } catch {
      return { preset: DEFAULT_WALLPAPER, imageUrl: null };
    }
  }
  return { preset: DEFAULT_WALLPAPER, imageUrl: null };
}

// GET — the resolved wallpaper for any signed-in user.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await prisma.config.findUnique({ where: { key: WALLPAPER_CONFIG_KEY } });
  return NextResponse.json(await resolve(cfg?.value));
}

// POST — set the shared wallpaper (admin only). Two shapes:
//   • JSON  { value: presetId }                 — pick a preset
//   • multipart/form-data with `file`           — upload a custom photo
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";
  let value: string;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }
    const ext = WALLPAPER_EXT[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Wallpaper must be jpeg/png/webp" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > WALLPAPER_MAX_BYTES) {
      return NextResponse.json(
        { error: `Wallpaper too large (max ${WALLPAPER_MAX_BYTES / 1024 / 1024} MB)` },
        { status: 400 }
      );
    }
    const key = `wallpapers/${randomId()}.${ext}`;
    try {
      await putR2(key, Buffer.from(await file.arrayBuffer()), file.type);
    } catch {
      return NextResponse.json({ error: "Couldn't store wallpaper" }, { status: 502 });
    }
    value = key;
  } else {
    const body = await req.json().catch(() => ({}));
    if (!isWallpaperId(body?.value)) {
      return NextResponse.json({ error: "Invalid wallpaper" }, { status: 400 });
    }
    value = body.value;
  }

  await prisma.config.upsert({
    where: { key: WALLPAPER_CONFIG_KEY },
    update: { value },
    create: { key: WALLPAPER_CONFIG_KEY, value },
  });

  const resolved = await resolve(value);
  // Broadcast so the other person's open chat updates live.
  publishWallpaper(resolved);

  return NextResponse.json(resolved);
}
