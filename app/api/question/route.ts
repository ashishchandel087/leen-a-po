import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToOthers } from "@/lib/push";
import { appToday, promptForDate, MAX_ANSWER_LENGTH } from "@/lib/daily-question";

// Question of the day. Answers are blind: each partner only sees the other's
// answer once both have answered. Until then an answer stays editable.

type QuestionState = {
  date: string;
  prompt: string;
  mine: { text: string; createdAt: string } | null;
  partner: { name: string; answered: boolean; text: string | null; createdAt: string | null };
  revealed: boolean;
};

async function loadState(userId: string): Promise<QuestionState> {
  const date = appToday();
  const question = await prisma.dailyQuestion.upsert({
    where: { date },
    update: {},
    create: { date, prompt: promptForDate(date) },
    include: { answers: { include: { user: { select: { id: true, name: true } } } } },
  });

  const mine = question.answers.find((a) => a.userId === userId) ?? null;
  const theirs = question.answers.find((a) => a.userId !== userId) ?? null;
  // Partner name even before they answer, for the "waiting for…" state.
  const partnerName =
    theirs?.user.name ??
    (await prisma.user.findFirst({ where: { id: { not: userId } }, select: { name: true } }))?.name ??
    "your person";

  const revealed = Boolean(mine && theirs);
  return {
    date,
    prompt: question.prompt,
    mine: mine ? { text: mine.text, createdAt: mine.createdAt.toISOString() } : null,
    partner: {
      name: partnerName,
      answered: Boolean(theirs),
      // The partner's text stays hidden until both have answered.
      text: revealed && theirs ? theirs.text : null,
      createdAt: revealed && theirs ? theirs.createdAt.toISOString() : null,
    },
    revealed,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await loadState(session.user.id));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = await req.json().catch(() => ({}));
  const cleanText = typeof text === "string" ? text.trim().slice(0, MAX_ANSWER_LENGTH) : "";
  if (!cleanText) {
    return NextResponse.json({ error: "Answer required" }, { status: 400 });
  }

  const date = appToday();
  const question = await prisma.dailyQuestion.upsert({
    where: { date },
    update: {},
    create: { date, prompt: promptForDate(date) },
    include: { answers: true },
  });

  const mine = question.answers.find((a) => a.userId === session.user.id);
  const partnerAnswered = question.answers.some((a) => a.userId !== session.user.id);

  // Once both answers exist the reveal has happened — no rewriting history.
  if (mine && partnerAnswered) {
    return NextResponse.json({ error: "Already revealed — see you tomorrow!" }, { status: 409 });
  }

  if (mine) {
    await prisma.dailyAnswer.update({ where: { id: mine.id }, data: { text: cleanText } });
  } else {
    await prisma.dailyAnswer.create({
      data: { questionId: question.id, userId: session.user.id, text: cleanText },
    });
    // Nudge the partner — first submission only, edits stay silent. If both
    // submit at the same instant each just gets a "your turn" nudge; the
    // reveal is still correct on next load.
    const me = session.user.name || "Someone";
    void sendPushToOthers(session.user.id, partnerAnswered
      ? { title: "✨ Answers revealed", body: `${me} answered today's question — go see what they said`, url: "/dashboard" }
      : { title: "💭 Question of the day", body: `${me} answered — your turn`, url: "/dashboard" }
    );
  }

  return NextResponse.json(await loadState(session.user.id));
}
