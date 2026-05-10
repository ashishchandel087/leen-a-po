"use client";

// Tap-on-bubble action sheet: quick reactions row, reply, copy, delete.
// Renders as a popover anchored above/below the bubble using fixed
// positioning + a backdrop. Closing is handled by the parent (clicking
// outside or pressing Escape).

import { motion, AnimatePresence, tapPress } from "./motion";
import { Trash } from "./Icons";

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🔥"];

interface Props {
  open: boolean;
  /** Anchor element rect — used to position the popover. */
  anchor: { top: number; left: number; width: number; height: number } | null;
  canDelete: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onClose: () => void;
  /** User IDs to highlight already-reacted emojis */
  myReactions?: string[];
}

export default function MessageActions({
  open,
  anchor,
  canDelete,
  onReact,
  onReply,
  onCopy,
  onDelete,
  onClose,
  myReactions = [],
}: Props) {
  // Compute popover position — above the bubble, centered, but clamped to viewport.
  const top = anchor ? Math.max(anchor.top - 120, 16) : 100;
  const left = anchor
    ? Math.min(Math.max(anchor.left + anchor.width / 2 - 160, 8), window.innerWidth - 328)
    : 16;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            className="fixed inset-0 z-[60]"
            aria-hidden
          />
          <motion.div
            role="menu"
            data-msg-bubble
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            style={{ top, left, width: 320 }}
            className="fixed z-[61] bg-[#1a0a10]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            {/* Quick reactions */}
            <div className="flex items-center justify-between gap-1 px-2 py-2 border-b border-white/10">
              {QUICK_REACTIONS.map((emoji) => {
                const active = myReactions.includes(emoji);
                return (
                  <motion.button
                    key={emoji}
                    type="button"
                    whileTap={tapPress}
                    whileHover={{ scale: 1.15 }}
                    onClick={() => onReact(emoji)}
                    className={`flex items-center justify-center w-10 h-10 rounded-full text-xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 transition-colors ${
                      active ? "bg-rose-500/30" : "hover:bg-white/10"
                    }`}
                  >
                    {emoji}
                  </motion.button>
                );
              })}
            </div>

            {/* Action list */}
            <div className="flex flex-col">
              <button
                type="button"
                onClick={onReply}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 text-sm text-white/90 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-rose-300" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                </svg>
                Reply
              </button>
              {onCopy && (
                <button
                  type="button"
                  onClick={onCopy}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 text-sm text-white/90 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-rose-300" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy text
                </button>
              )}
              {canDelete && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-red-500/15 active:bg-red-500/25 text-sm text-red-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <Trash className="w-4 h-4" aria-hidden />
                  Delete message
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
