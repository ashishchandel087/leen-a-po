import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — fetch a config value
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Key required" }, { status: 400 });

  const config = await prisma.config.findUnique({ where: { key } });
  return NextResponse.json({ value: config?.value ?? null });
}

// POST — set a config value (admin only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key, value } = await req.json();
  if (!key || !value) return NextResponse.json({ error: "Key and value required" }, { status: 400 });

  const config = await prisma.config.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  return NextResponse.json(config);
}
