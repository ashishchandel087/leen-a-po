import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  signPut,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_AUDIO_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_VOICE_BYTES,
} from "@/lib/r2";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

// Sticker uploads accept a tighter set (heic/heif don't render reliably as
// stickers across platforms) — keep it to the universal four.
const STICKER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const STICKER_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — stickers are small

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { contentType, size, kind, packId } = body as {
    contentType?: string;
    size?: number;
    kind?: "chat" | "sticker" | "memory";
    packId?: string;
  };
  const uploadKind: "chat" | "sticker" | "memory" =
    kind === "sticker" || kind === "memory" ? kind : "chat";

  // Validate type/size by kind
  if (uploadKind === "sticker") {
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (!contentType || !STICKER_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Stickers must be jpeg/png/webp/gif" },
        { status: 400 }
      );
    }
    if (typeof size !== "number" || size <= 0 || size > STICKER_MAX_BYTES) {
      return NextResponse.json(
        { error: `Sticker too large (max ${STICKER_MAX_BYTES / 1024 / 1024} MB)` },
        { status: 400 }
      );
    }
  } else {
    // chat or memory — both accept images; chat additionally accepts audio
    // (voice notes). Memory uploads stay image-only.
    const isImage = !!contentType && ALLOWED_IMAGE_TYPES.has(contentType);
    const isAudio = uploadKind === "chat" && !!contentType && ALLOWED_AUDIO_TYPES.has(contentType);
    if (!isImage && !isAudio) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }
    const cap = isAudio ? MAX_VOICE_BYTES : MAX_UPLOAD_BYTES;
    if (typeof size !== "number" || size <= 0 || size > cap) {
      return NextResponse.json(
        { error: `File too large (max ${cap / 1024 / 1024} MB)` },
        { status: 400 }
      );
    }
  }

  const ext = EXT_BY_TYPE[contentType] || "bin";
  // Stickers go under their pack folder when packId is provided so the
  // R2 dashboard reflects the same grouping as the app.
  const safePackId = typeof packId === "string" && /^[a-z0-9_-]+$/i.test(packId) ? packId : null;
  const key =
    uploadKind === "sticker"
      ? safePackId
        ? `stickers/${safePackId}/${randomId()}.${ext}`
        : `stickers/${randomId()}.${ext}`
      : uploadKind === "memory"
      ? `memories/${session.user.id}/${randomId()}.${ext}`
      : `chat/${session.user.id}/${randomId()}.${ext}`;

  try {
    const url = await signPut(key, contentType);
    return NextResponse.json({ url, key });
  } catch (err) {
    console.warn("[upload/sign] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't presign upload" }, { status: 500 });
  }
}
