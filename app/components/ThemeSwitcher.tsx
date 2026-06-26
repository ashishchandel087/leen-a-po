"use client";

import { motion, tapPress } from "./motion";
import { useTheme } from "./ThemeProvider";
import { THEMES } from "@/lib/themes";

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="relative bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
      <h2 className="font-semibold text-sm mb-1 flex items-center gap-2">
        <span className="text-base" aria-hidden>🎨</span>
        Theme
      </h2>
      <p className="text-white/55 text-xs mb-4">Pick a vibe — saved on this device</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {THEMES.map((t) => {
          const active = t.id === theme;
          return (
            <motion.button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              whileTap={tapPress}
              aria-pressed={active}
              aria-label={`${t.label} theme`}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 min-h-[44px] border text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                active
                  ? "border-rose-400/70 bg-rose-500/10 ring-1 ring-rose-400/40"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20"
              }`}
            >
              <span
                className="w-6 h-6 rounded-full shrink-0 ring-1 ring-white/20 shadow"
                style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
                aria-hidden
              />
              <span className="text-sm text-white/90 truncate flex items-center gap-1">
                <span aria-hidden>{t.emoji}</span>
                {t.label}
              </span>
              {active && <span className="ml-auto text-rose-300 text-xs" aria-hidden>✓</span>}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
