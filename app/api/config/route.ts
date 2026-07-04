import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WALLPAPER_CONFIG_KEY } from "@/lib/wallpapers";

const MAX_KEY_LENGTH = 100;
const MAX_VALUE_LENGTH = 10000;

// Only the keys the app actually reads are exposed via GET — the Config
// table may hold internals that shouldn't leak to any signed-in user.
const READABLE_KEYS = new Set<string>([WALLPAPER_CONFIG_KEY]);

// GET — fetch a config value (allowlisted keys only)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Key required" }, { status: 400 });
  if (!READABLE_KEYS.has(key)) {
    return NextResponse.json({ error: "Key not readable" }, { status: 403 });
  }

  const config = await prisma.config.findUnique({ where: { key } });
  return NextResponse.json({ value: config?.value ?? null });
}

// POST — set a config value (admin only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { key, value } = await req.json().catch(() => ({}));
  // Empty-string value is legal (clears a setting); only reject non-strings.
  if (typeof key !== "string" || !key || typeof value !== "string") {
    return NextResponse.json({ error: "Key and value required" }, { status: 400 });
  }
  if (key.length > MAX_KEY_LENGTH) {
    return NextResponse.json({ error: `Key too long (max ${MAX_KEY_LENGTH})` }, { status: 400 });
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return NextResponse.json({ error: `Value too long (max ${MAX_VALUE_LENGTH})` }, { status: 400 });
  }

  const config = await prisma.config.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  return NextResponse.json(config);
}
