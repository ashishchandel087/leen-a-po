import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Buffer } from "node:buffer";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

export const R2_BUCKET = process.env.R2_BUCKET || "";

export const r2 = new S3Client({
  region: "auto",
  endpoint: accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : undefined,
  credentials:
    accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined,
  // R2 doesn't support the integrity / checksum features that aws-sdk-js v3.778+
  // turn on by default. Without these overrides, presigned URLs include extra
  // query params and request headers R2 rejects → browser sees "Failed to fetch".
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VOICE_BYTES = 8 * 1024 * 1024;   // 8 MB — ~5 min of decent audio

/** Generate a short-lived URL the browser can use to GET an object. */
export async function signGet(key: string, expiresIn = 3600) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn }
  );
}

/** Generate a short-lived URL the browser can PUT directly to. */
export async function signPut(
  key: string,
  contentType: string,
  expiresIn = 600
) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

/**
 * Validate a key submitted as a message attachment. Two shapes are allowed:
 *   - chat/<userId>/<file>.<ext>     — user upload, must belong to sender
 *   - stickers/<id>.<ext>            — admin-curated sticker, anyone can send
 */
const CHAT_KEY = /^chat\/[a-z0-9_-]+\/[a-z0-9_-]+\.(jpe?g|png|webp|gif|heic|heif|webm|m4a|mp3|ogg|wav)$/i;
// Allow either:
//   stickers/<id>.<ext>            — legacy flat layout (still works)
//   stickers/<packId>/<id>.<ext>   — new per-pack folder layout
const STICKER_KEY = /^stickers\/(?:[a-z0-9_-]+\/)?[a-z0-9_-]+\.(jpe?g|png|webp|gif|webm)$/i;
const MEMORY_KEY = /^memories\/[a-z0-9_-]+\/[a-z0-9_-]+\.(jpe?g|png|webp|gif|heic|heif)$/i;

export function isValidAttachmentKey(key: unknown, userId: string): key is string {
  if (typeof key !== "string") return false;
  if (CHAT_KEY.test(key)) {
    return key.split("/")[1] === userId;
  }
  return STICKER_KEY.test(key);
}

export function isValidStickerKey(key: unknown): key is string {
  return typeof key === "string" && STICKER_KEY.test(key);
}

export function isValidMemoryKey(key: unknown, userId: string): key is string {
  if (typeof key !== "string") return false;
  if (!MEMORY_KEY.test(key)) return false;
  return key.split("/")[1] === userId;
}

/**
 * Sign each key. A partial signing failure doesn't 500 — the failed key is
 * dropped from the result, but logged so silently-vanishing attachments are
 * diagnosable rather than invisible.
 */
export async function signKeys(keys: string[]): Promise<string[]> {
  if (!keys.length) return [];
  const settled = await Promise.allSettled(keys.map((k) => signGet(k)));
  const signed: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      signed.push(s.value);
    } else {
      console.warn(`[r2] failed to sign key "${keys[i]}":`, s.reason);
    }
  });
  return signed;
}

/**
 * Upload a buffer directly to R2 from the server. Used by features that
 * pull bytes from elsewhere (Telegram stickers, etc.) — instead of presigned
 * PUT from the browser.
 */
export async function putR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}
