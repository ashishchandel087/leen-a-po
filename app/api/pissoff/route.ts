import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToOthers } from "@/lib/push";

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

  const { who, reason, level, date } = await req.json().catch(() => ({}));
  if (who !== "ashish" && who !== "leena") {
    return NextResponse.json({ error: "Invalid 'who'" }, { status: 400 });
  }
  const cleanReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  if (!cleanReason) {
    return NextResponse.json({ error: "Reason required" }, { status: 400 });
  }
  const lvl = Number(level);
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > 5) {
    return NextResponse.json({ error: "Level must be 1–5" }, { status: 400 });
  }

  // A date may be supplied to backfill a past incident, but it must parse and
  // can't be in the future (no forging entries dated tomorrow).
  let createdAt = new Date();
  if (date) {
    const d = new Date(date);
    if (isNaN(d.getTime()) || d.getTime() > Date.now()) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    createdAt = d;
  }

  const log = await prisma.pissOffLog.create({
    data: { who, reason: cleanReason, level: lvl, createdAt },
  });

  // Notify the other person
  const name = who === "ashish" ? "Ashish" : "Leena";
  const lvlEmojis: Record<number, string> = { 1: "😒", 2: "😤", 3: "😠", 4: "🤬", 5: "☠️" };
  sendPushToOthers(session.user.id, {
    title: `${lvlEmojis[lvl] ?? "😤"} Piss-O-Meter Alert`,
    body: `${name} logged a Level ${lvl} incident — "${cleanReason}"`,
    url: "/pissoff",
  }).catch(() => {});

  return NextResponse.json(log);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { count } = await prisma.pissOffLog.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
