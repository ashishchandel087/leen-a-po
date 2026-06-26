"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, tapPress } from "./motion";
import { WALLPAPERS, type WallpaperId } from "@/lib/wallpapers";

interface Props {
  preset: WallpaperId;
  imageUrl: string | null;
  uploading: boolean;
  onSelectPreset: (id: WallpaperId) => void;
  onUploadImage: (file: File) => void;
}

/** Admin-only control (the chat page only renders it for admins). Lets the
 *  admin set the shared chat wallpaper — a preset or a custom photo. */
export default function ChatWallpaperPicker({
  preset,
  imageUrl,
  uploading,
  onSelectPreset,
  onUploadImage,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const customActive = !!imageUrl;

  // The modal is portalled to <body> so it escapes the chat header's
  // backdrop-filter, which would otherwise become the containing block for
  // our position:fixed overlay and trap it inside the (tiny) header bar.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change chat wallpaper"
        title="Change chat wallpaper"
        className="flex items-center justify-center w-10 h-10 rounded-full text-white/70 hover:text-rose-300 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
      >
        <span className="text-lg leading-none" aria-hidden>🖼️</span>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Chat wallpaper"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="fixed left-1/2 bottom-0 sm:bottom-auto sm:top-1/2 z-40 w-full sm:max-w-md -translate-x-1/2 sm:-translate-y-1/2 max-h-[85dvh] flex flex-col overflow-hidden bg-[#0c0407] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/60"
            >
              {/* Sticky header — Done is always reachable even if the grid scrolls */}
              <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-2 border-b border-white/10">
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <span aria-hidden>🖼️</span> Chat wallpaper
                  </h2>
                  <p className="text-white/50 text-xs mt-0.5">Sets the background for both of you · admin only</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="shrink-0 ml-3 text-rose-300 hover:text-rose-200 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-rose-500/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  Done
                </button>
              </div>

              <div
                className="flex-1 min-h-0 overflow-y-auto px-5 py-4"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
              >
                <div className="grid grid-cols-3 gap-3">
                  {WALLPAPERS.map((w) => {
                    const active = !customActive && w.id === preset;
                    return (
                      <motion.button
                        key={w.id}
                        type="button"
                        onClick={() => onSelectPreset(w.id)}
                        whileTap={tapPress}
                        aria-pressed={active}
                        aria-label={`${w.label} wallpaper`}
                        className={`relative flex flex-col items-center gap-1.5 rounded-xl p-1.5 border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                          active ? "border-rose-400/70 ring-1 ring-rose-400/40" : "border-white/10 hover:border-white/25"
                        }`}
                      >
                        <span
                          className="w-full aspect-square rounded-lg ring-1 ring-white/10"
                          style={{ background: w.swatch }}
                          aria-hidden
                        />
                        <span className="text-[11px] text-white/80 flex items-center gap-1">
                          <span aria-hidden>{w.emoji}</span>
                          {w.label}
                        </span>
                        {active && (
                          <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] flex items-center justify-center shadow" aria-hidden>
                            ✓
                          </span>
                        )}
                      </motion.button>
                    );
                  })}

                  {/* Custom image upload tile */}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    aria-pressed={customActive}
                    aria-label="Upload custom wallpaper"
                    className={`relative flex flex-col items-center gap-1.5 rounded-xl p-1.5 border transition-all cursor-pointer disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                      customActive ? "border-rose-400/70 ring-1 ring-rose-400/40" : "border-dashed border-white/20 hover:border-white/40"
                    }`}
                  >
                    <span
                      className="w-full aspect-square rounded-lg ring-1 ring-white/10 bg-white/[0.04] bg-cover bg-center flex items-center justify-center text-white/60"
                      style={customActive ? { backgroundImage: `url("${imageUrl}")` } : undefined}
                      aria-hidden
                    >
                      {uploading ? (
                        <span className="w-5 h-5 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit" />
                      ) : customActive ? null : (
                        <span className="text-xl">＋</span>
                      )}
                    </span>
                    <span className="text-[11px] text-white/80">{uploading ? "Uploading…" : "Custom"}</span>
                    {customActive && !uploading && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] flex items-center justify-center shadow" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                </div>

                <p className="text-white/40 text-[11px] mt-3 text-center">
                  Custom photos: JPEG / PNG / WebP, up to 4 MB
                </p>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // allow re-selecting the same file
                  if (file) onUploadImage(file);
                }}
              />
            </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
