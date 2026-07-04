import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putR2, signGet } from "@/lib/r2";
import {
  extractPackName,
  getStickerSet,
  downloadFile,
  FileTooLargeError,
  type TelegramSticker,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60; // import can take a moment for big packs

const MAX_STICKERS_PER_REQUEST = 50; // serial downloads must fit inside maxDuration
const MAX_STICKER_BYTES = 2 * 1024 * 1024; // stickers are small; skip anything bigger

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

interface ImportBody {
  url?: string;
  packId?: string;
  packName?: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      {
        error:
          "TELEGRAM_BOT_TOKEN not configured. Create a bot via @BotFather on Telegram, then set TELEGRAM_BOT_TOKEN in your env.",
      },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as ImportBody;
  const tgName = body.url ? extractPackName(body.url) : null;
  if (!tgName) {
    return NextResponse.json(
      { error: "Couldn't parse Telegram pack name. Expected a t.me/addstickers/<name> URL." },
      { status: 400 }
    );
  }

  let set;
  try {
    set = await getStickerSet(tgName);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch sticker set" },
      { status: 502 }
    );
  }

  // Decide pack: reuse existing if packId provided, else create one named after Telegram pack title
  let pack;
  if (body.packId) {
    pack = await prisma.stickerPack.findUnique({ where: { id: body.packId } });
    if (!pack || pack.deletedAt) {
      return NextResponse.json({ error: "Pack not found" }, { status: 404 });
    }
  } else {
    const packName = (body.packName || set.title || tgName).slice(0, 50);
    pack = await prisma.stickerPack.create({
      data: { name: packName, emoji: set.stickers[0]?.emoji?.slice(0, 4) || null },
    });
  }

  // Filter stickers we can render: WEBP (image) and WEBM (video). Animated
  // .tgs (Lottie) needs a different renderer, skip with a count for the user.
  const supported: TelegramSticker[] = [];
  let skippedAnimated = 0;
  for (const s of set.stickers) {
    if (s.is_animated) {
      skippedAnimated++;
      continue;
    }
    supported.push(s);
  }

  // Bound the batch so the serial download loop fits inside maxDuration.
  // Anything past the cap is reported as `truncated` — the client can re-run
  // the import into the same pack to pick up the rest.
  const truncated = Math.max(0, supported.length - MAX_STICKERS_PER_REQUEST);
  const batch = supported.slice(0, MAX_STICKERS_PER_REQUEST);

  const created: { id: string; key: string; url: string }[] = [];
  const errors: { file_id: string; error: string }[] = [];
  let skippedTooLarge = 0;

  // Process serially to avoid hammering Telegram's rate limit (~30 req/sec)
  // and R2's regional concurrent upload behavior.
  for (const tgSticker of batch) {
    try {
      const { bytes, mime } = await downloadFile(tgSticker.file_id, MAX_STICKER_BYTES);
      const ext = tgSticker.is_video ? "webm" : "webp";
      // Group stickers by pack folder so the R2 dashboard mirrors the app.
      const key = `stickers/${pack.id}/${randomId()}.${ext}`;
      await putR2(key, bytes, mime);

      const sticker = await prisma.sticker.create({ data: { packId: pack.id, key } });
      created.push({
        id: sticker.id,
        key: sticker.key,
        url: await signGet(sticker.key, 3600),
      });
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        skippedTooLarge++;
        continue;
      }
      errors.push({
        file_id: tgSticker.file_id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    pack: {
      id: pack.id,
      name: pack.name,
      emoji: pack.emoji,
    },
    importedCount: created.length,
    skippedAnimated,
    skippedTooLarge,
    truncated,
    errors,
    stickers: created,
  });
}
