// Chat wallpaper presets. The chosen wallpaper is stored server-side in the
// Config table (key "chat_wallpaper") and can only be changed by an admin via
// POST /api/config (admin-gated). Everyone sees whatever is set.
//
// Each wallpaper is a `.chat-wp-<id>` class in globals.css that paints a subtle
// background-image over the dark base. "default" keeps the original aurora look
// and has no class. `swatch` is a small CSS background for the picker preview.

export type WallpaperId =
  | "default"
  | "violet"
  | "ocean"
  | "ember"
  | "forest"
  | "starry";

export interface WallpaperMeta {
  id: WallpaperId;
  label: string;
  emoji: string;
  /** CSS `background` value used to render the picker swatch. */
  swatch: string;
}

export const WALLPAPERS: WallpaperMeta[] = [
  { id: "default", label: "Cosmic",  emoji: "🌌", swatch: "radial-gradient(circle at 30% 20%, #be123c55, transparent 60%), radial-gradient(circle at 80% 90%, #4c1d9555, transparent 60%), #0a0305" },
  { id: "violet",  label: "Twilight", emoji: "🔮", swatch: "radial-gradient(circle at 20% 0%, #7c3aed66, transparent 60%), radial-gradient(circle at 100% 100%, #4c1d9577, transparent 60%), #0a0305" },
  { id: "ocean",   label: "Deep Sea", emoji: "🌊", swatch: "radial-gradient(circle at 10% 0%, #0ea5e955, transparent 60%), radial-gradient(circle at 100% 100%, #0d948855, transparent 60%), #050a12" },
  { id: "ember",   label: "Ember",    emoji: "🔥", swatch: "radial-gradient(circle at 50% 0%, #f9731644, transparent 60%), radial-gradient(circle at 100% 100%, #be123c55, transparent 60%), #0a0305" },
  { id: "forest",  label: "Forest",   emoji: "🌿", swatch: "radial-gradient(circle at 0% 0%, #10b98144, transparent 60%), radial-gradient(circle at 100% 100%, #05966955, transparent 60%), #04100a" },
  { id: "starry",  label: "Starlit",  emoji: "✨", swatch: "radial-gradient(1px 1px at 30% 30%, #fff, transparent), radial-gradient(1.5px 1.5px at 70% 60%, #fff, transparent), #0a0305" },
];

export const DEFAULT_WALLPAPER: WallpaperId = "default";

export const WALLPAPER_CONFIG_KEY = "chat_wallpaper";

export function isWallpaperId(v: unknown): v is WallpaperId {
  return typeof v === "string" && WALLPAPERS.some((w) => w.id === v);
}

/** Class to apply to the chat root for a wallpaper id ("" for default). */
export function wallpaperClass(id: WallpaperId): string {
  return id === "default" ? "" : `chat-wp-${id}`;
}

// A custom-image wallpaper is stored in Config as its R2 key. This regex (kept
// here so both client and server can share it without pulling in the S3 SDK)
// is the single source of truth for what a valid wallpaper key looks like.
export const WALLPAPER_IMAGE_KEY_RE = /^wallpapers\/[a-z0-9_-]+\.(jpe?g|png|webp)$/i;

export function isWallpaperImageKey(v: unknown): v is string {
  return typeof v === "string" && WALLPAPER_IMAGE_KEY_RE.test(v);
}

/** The resolved wallpaper the client applies: a preset, or a signed image URL. */
export interface ResolvedWallpaper {
  preset: WallpaperId; // "default" when a custom image is set
  imageUrl: string | null; // signed GET URL when a custom image is set
}
