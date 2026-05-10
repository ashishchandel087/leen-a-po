"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, tapPress } from "./motion";
import StickerMedia from "./StickerMedia";

interface Sticker {
  id: string;
  key: string;
  url: string;
}
interface StickerPack {
  id: string;
  name: string;
  emoji: string | null;
  stickers: Sticker[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (key: string) => void;
}

export default function StickerPicker({ open, onClose, onSelect }: Props) {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Lazy-load packs only when the picker first opens, then cache.
  useEffect(() => {
    if (!open || loaded) return;
    let alive = true;
    fetch("/api/stickers")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: StickerPack[]) => {
        if (!alive) return;
        setPacks(data);
        if (data.length > 0) setActivePackId(data[0].id);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) {
          setError("Couldn't load stickers");
          setLoaded(true);
        }
      });
    return () => { alive = false; };
  }, [open, loaded]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest("[data-sticker-panel]") && !t?.closest("[data-sticker-trigger]")) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const activePack = packs.find((p) => p.id === activePackId) ?? packs[0];

  const onPick = useCallback(
    (key: string) => {
      onSelect(key);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          data-sticker-panel
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden border-b border-white/5 bg-[#0c0407]"
          role="dialog"
          aria-label="Stickers"
        >
          <div className="max-w-2xl mx-auto h-72 flex flex-col">
            {!loaded && (
              <div className="flex-1 flex items-center justify-center">
                <span
                  className="w-6 h-6 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit"
                  aria-label="Loading"
                />
              </div>
            )}

            {loaded && error && (
              <div className="flex-1 flex items-center justify-center text-white/60 text-sm">
                {error}
              </div>
            )}

            {loaded && !error && packs.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-2">
                <span className="text-3xl">🎨</span>
                <p className="text-white/70 text-sm">No stickers yet</p>
                <p className="text-white/45 text-xs">Admins can add packs in /admin/stickers</p>
              </div>
            )}

            {loaded && !error && packs.length > 0 && activePack && (
              <>
                {/* Sticker grid */}
                <div className="flex-1 overflow-y-auto px-3 py-3">
                  {activePack.stickers.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-white/55 text-xs">
                      Empty pack
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                      {activePack.stickers.map((s) => (
                        <motion.button
                          key={s.id}
                          type="button"
                          onClick={() => onPick(s.key)}
                          whileTap={tapPress}
                          whileHover={{ scale: 1.06 }}
                          aria-label="Send sticker"
                          className="aspect-square rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 transition-colors"
                        >
                          <StickerMedia
                            url={s.url}
                            className="w-full h-full object-contain p-1"
                          />
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pack tabs */}
                <div className="border-t border-white/10 px-2 py-2 flex gap-1 overflow-x-auto">
                  {packs.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePackId(p.id)}
                      className={`shrink-0 flex items-center gap-1 px-3 py-1.5 min-h-[34px] rounded-full text-xs font-medium transition-colors cursor-pointer ${
                        p.id === activePack.id
                          ? "bg-rose-500/25 text-rose-100"
                          : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {p.emoji && <span className="text-base">{p.emoji}</span>}
                      <span className="truncate max-w-[8rem]">{p.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
