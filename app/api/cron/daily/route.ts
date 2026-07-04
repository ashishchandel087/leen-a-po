import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToAll } from "@/lib/push";
import { appToday, daysBetween, promptForDate } from "@/lib/daily-question";

// Daily scheduled pushes, hit once a morning by a cron (vercel.json cron on
// Vercel, or `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/daily`
// from crontab on a VPS). Idempotent: every push is deduped through
// NotificationLog, so re-runs and retries can't double-send.
//
// Not behind the auth middleware (proxy.ts only matches pages); guarded by
// CRON_SECRET instead — Vercel Cron sends it as a Bearer token automatically.

// Countdown pushes fire this many days before each occasion.
const COUNTDOWN_DAYS = new Set([7, 3, 1, 0]);

/** True if this key hasn't been sent before (and claims it atomically). */
async function claim(key: string): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { key } });
    return true;
  } catch {
    return false; // unique violation — already sent
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = appToday();
  let occasionPushes = 0;
  let questionPushed = false;

  // ── Occasion countdowns ─────────────────────────────────────────────
  const occasions = await prisma.specialOccasion.findMany({
    where: { deletedAt: null, date: { gte: today } },
  });
  for (const occ of occasions) {
    const days = daysBetween(today, occ.date);
    if (!COUNTDOWN_DAYS.has(days)) continue;
    if (!(await claim(`occasion:${occ.id}:${days}`))) continue;

    const body =
      days === 0 ? "It's today! 🎉"
      : days === 1 ? "Tomorrow!"
      : `In ${days} days`;
    await sendPushToAll({
      title: `${occ.emoji} ${occ.title}`,
      body: occ.note ? `${body} — ${occ.note}` : body,
      url: "/dashboard",
    });
    occasionPushes++;
  }

  // ── Question of the day ─────────────────────────────────────────────
  if (await claim(`question:${today}`)) {
    const question = await prisma.dailyQuestion.upsert({
      where: { date: today },
      update: {},
      create: { date: today, prompt: promptForDate(today) },
    });
    const prompt =
      question.prompt.length > 120 ? question.prompt.slice(0, 119) + "…" : question.prompt;
    await sendPushToAll({ title: "💭 Question of the day", body: prompt, url: "/dashboard" });
    questionPushed = true;
  }

  return NextResponse.json({ today, occasionPushes, questionPushed });
}
