"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Check, X as XIcon, Heart } from "./Icons";
import { motion, AnimatePresence, toastVariants } from "./motion";

type ToastTone = "success" | "error" | "love";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastCtx {
  show: (message: string, tone?: ToastTone) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // Stable context value — otherwise every toast add/expire re-renders the
  // provider and hands consumers a fresh object, re-firing their effects.
  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              variants={toastVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              role="status"
              className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full backdrop-blur-md border text-sm font-medium shadow-2xl shadow-black/40"
              style={{
                background:
                  t.tone === "error"
                    ? "rgba(127,29,29,.85)"
                    : t.tone === "love"
                    ? "rgba(136,19,55,.85)"
                    : "rgba(15,23,42,.85)",
                color: "#fff",
                borderColor:
                  t.tone === "error"
                    ? "rgba(248,113,113,.5)"
                    : t.tone === "love"
                    ? "rgba(251,113,133,.5)"
                    : "rgba(244,114,182,.4)",
              }}
            >
              {t.tone === "success" && <Check className="w-4 h-4 text-rose-300" aria-hidden />}
              {t.tone === "error" && <XIcon className="w-4 h-4 text-red-300" aria-hidden />}
              {t.tone === "love" && <Heart className="w-4 h-4 text-rose-200 fill-rose-300" aria-hidden />}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) {
    // Safe no-op if provider not mounted
    return { show: () => {} };
  }
  return c;
}

// Hook that auto-clears a value after a tick — keeps UX smooth
export function useTransientFlag(durationMs = 1500) {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const t = setTimeout(() => setFlag(false), durationMs);
    return () => clearTimeout(t);
  }, [flag, durationMs]);
  return [flag, setFlag] as const;
}
