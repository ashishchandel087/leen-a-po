// Theme catalogue. Each theme remaps the app's accent (built entirely from
// Tailwind `rose-*` / `pink-*` utilities) by overriding the underlying
// --color-* CSS variables in globals.css under `html[data-theme="<id>"]`.
// This file only holds the metadata the picker UI needs (label + preview
// swatch); the actual colour values live in globals.css.

export type ThemeId = "rose" | "ocean" | "emerald" | "violet" | "sunset" | "slate";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  emoji: string;
  /** Two colours for the picker's gradient swatch (primary → secondary). */
  from: string;
  to: string;
}

export const THEMES: ThemeMeta[] = [
  { id: "rose",    label: "Rosé",    emoji: "🌹", from: "#f43f5e", to: "#ec4899" },
  { id: "ocean",   label: "Ocean",   emoji: "🌊", from: "#3b82f6", to: "#0ea5e9" },
  { id: "emerald", label: "Emerald", emoji: "🌿", from: "#10b981", to: "#14b8a6" },
  { id: "violet",  label: "Violet",  emoji: "🔮", from: "#8b5cf6", to: "#d946ef" },
  { id: "sunset",  label: "Sunset",  emoji: "🌅", from: "#f97316", to: "#f59e0b" },
  { id: "slate",   label: "Mono",    emoji: "🌙", from: "#64748b", to: "#71717a" },
];

export const DEFAULT_THEME: ThemeId = "rose";

export const THEME_STORAGE_KEY = "theme";

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}
