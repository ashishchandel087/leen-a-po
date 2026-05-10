// Thin wrapper around Telegram's Bot API just for sticker import.
// Requires TELEGRAM_BOT_TOKEN env var. Get one by messaging @BotFather on
// Telegram, sending /newbot, and copying the token it returns.

const API_BASE = "https://api.telegram.org";

interface TelegramSticker {
  file_id: string;
  file_unique_id: string;
  emoji?: string;
  is_animated: boolean; // .tgs (Lottie) — we skip these for now
  is_video: boolean;    // .webm
  width: number;
  height: number;
}

interface StickerSet {
  name: string;
  title: string;
  sticker_type: string;
  is_animated: boolean;
  is_video: boolean;
  stickers: TelegramSticker[];
}

interface FileResult {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path: string; // path to download from <API_BASE>/file/bot<token>/<file_path>
}

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN not set. Create a bot via @BotFather on Telegram, then add the token to your env."
    );
  }
  return t;
}

/** Extract the short pack name from a t.me URL or bare name. */
export function extractPackName(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Match https://t.me/addstickers/<name> or t.me/addstickers/<name>
  const m = trimmed.match(/(?:^|\/)addstickers\/([^/?#\s]+)/i);
  if (m) return m[1];
  // Bare name (alphanumeric + underscore)
  if (/^[a-zA-Z0-9_]+$/.test(trimmed)) return trimmed;
  return null;
}

export async function getStickerSet(name: string): Promise<StickerSet> {
  const url = `${API_BASE}/bot${token()}/getStickerSet?name=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  const json = (await res.json()) as { ok: boolean; result?: StickerSet; description?: string };
  if (!json.ok || !json.result) {
    throw new Error(json.description || "Telegram getStickerSet failed");
  }
  return json.result;
}

async function getFile(file_id: string): Promise<FileResult> {
  const url = `${API_BASE}/bot${token()}/getFile?file_id=${encodeURIComponent(file_id)}`;
  const res = await fetch(url);
  const json = (await res.json()) as { ok: boolean; result?: FileResult; description?: string };
  if (!json.ok || !json.result) {
    throw new Error(json.description || "Telegram getFile failed");
  }
  return json.result;
}

/** Download a Telegram-hosted file as a Uint8Array. */
export async function downloadFile(file_id: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const fileInfo = await getFile(file_id);
  const fileUrl = `${API_BASE}/file/bot${token()}/${fileInfo.file_path}`;
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // Telegram serves WebP as image/webp and WebM as video/webm; trust the
  // file_path extension as authoritative since the response header is sometimes
  // application/octet-stream.
  const ext = fileInfo.file_path.split(".").pop()?.toLowerCase() ?? "";
  const mime =
    ext === "webp"
      ? "image/webp"
      : ext === "webm"
      ? "video/webm"
      : ext === "tgs"
      ? "application/x-tgsticker"
      : "application/octet-stream";
  return { bytes: buf, mime };
}

export type { TelegramSticker, StickerSet };
