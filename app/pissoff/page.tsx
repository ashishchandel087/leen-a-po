"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppHeader from "../components/AppHeader";
import LoadingScreen from "../components/LoadingScreen";
import { useToast } from "../components/Toast";
import { Trash, Flame } from "../components/Icons";

interface PissOffLog {
  id: string;
  who: string;
  reason: string;
  level: number;
  createdAt: string;
}

const LEVELS = [
  { level: 1, emoji: "😒", label: "Mildly Annoyed" },
  { level: 2, emoji: "😤", label: "Irritated" },
  { level: 3, emoji: "😠", label: "Properly Mad" },
  { level: 4, emoji: "🤬", label: "Fuming" },
  { level: 5, emoji: "☠️", label: "Sleep on the Couch" },
];

const WHO_CONFIG = {
  ashish: { label: "Ashish", color: "bg-pink-700",   border: "border-pink-500",   text: "text-pink-300",   bar: "#f9a8d4" },
  leena:  { label: "Leena",  color: "bg-rose-700",   border: "border-rose-600",   text: "text-rose-300",   bar: "#be123c" },
};

function levelInfo(l: number) { return LEVELS.find(x => x.level === l) ?? LEVELS[0]; }

function todayLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ── Grouped bar chart: levels 1–5 on X, count on Y, two bars per group ── */
function BarChart({ logs }: { logs: PissOffLog[] }) {
  if (logs.length === 0) return null;

  const counts: Record<number, { ashish: number; leena: number }> = {};
  for (let i = 1; i <= 5; i++) counts[i] = { ashish: 0, leena: 0 };
  for (const log of logs) {
    if (log.who === "ashish") counts[log.level].ashish++;
    else counts[log.level].leena++;
  }

  const maxCount = Math.max(...Object.values(counts).flatMap(c => [c.ashish, c.leena]), 1);
  const chartH = 120;
  const barW = 18;
  const gap = 6;
  const groupGap = 20;
  const groupW = barW * 2 + gap;
  const totalW = 5 * groupW + 4 * groupGap;
  const labelH = 24;
  const svgH = chartH + labelH + 8;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalW} ${svgH}`}
        className="w-full"
        style={{ minWidth: 240 }}
      >
        {/* Y gridlines */}
        {[0.25, 0.5, 0.75, 1].map(frac => (
          <line
            key={frac}
            x1={0} y1={chartH * (1 - frac)}
            x2={totalW} y2={chartH * (1 - frac)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1"
          />
        ))}

        {[1, 2, 3, 4, 5].map((lvl, i) => {
          const x = i * (groupW + groupGap);
          const li = levelInfo(lvl);
          const aH = (counts[lvl].ashish / maxCount) * chartH;
          const lH = (counts[lvl].leena  / maxCount) * chartH;

          return (
            <g key={lvl}>
              {/* Ashish bar */}
              <rect
                x={x} y={chartH - aH} width={barW} height={aH}
                fill="#f9a8d4" rx="2"
              />
              {aH > 0 && (
                <text x={x + barW / 2} y={chartH - aH - 3} textAnchor="middle" fontSize="9" fill="#f9a8d4">
                  {counts[lvl].ashish}
                </text>
              )}
              {/* Leena bar */}
              <rect
                x={x + barW + gap} y={chartH - lH} width={barW} height={lH}
                fill="#be123c" rx="2"
              />
              {lH > 0 && (
                <text x={x + barW + gap + barW / 2} y={chartH - lH - 3} textAnchor="middle" fontSize="9" fill="#be123c">
                  {counts[lvl].leena}
                </text>
              )}
              {/* Level label */}
              <text x={x + groupW / 2} y={chartH + 16} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.65)">
                {li.emoji}
              </text>
              <text x={x + groupW / 2} y={chartH + 26} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.5)">
                Lvl {lvl}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-1">
        {Object.entries(WHO_CONFIG).map(([, cfg]) => (
          <div key={cfg.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cfg.bar }} />
            <span className="text-white/65 text-xs">{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PissOffPage() {
  const { status } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [logs, setLogs]       = useState<PissOffLog[]>([]);
  const [who, setWho]         = useState<"ashish" | "leena">("ashish");
  const [reason, setReason]   = useState("");
  const [level, setLevel]     = useState(1);
  const [date, setDate]       = useState(todayLocal());
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/pissoff").then(r => r.ok ? r.json() : []).then(setLogs);
    }
  }, [status]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/pissoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ who, reason, level, date }),
    });
    const data = await res.json();
    if (res.ok) {
      setLogs(prev => [data, ...prev].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
      setReason("");
      setLevel(1);
      setDate(todayLocal());
      toast.show("Incident logged 🚨", "success");
    } else {
      setError(data.error ?? "Something went wrong");
      toast.show("Couldn't log incident", "error");
    }
    setLoading(false);
  }

  async function deleteLog(id: string) {
    await fetch("/api/pissoff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setLogs(prev => prev.filter(l => l.id !== id));
  }

  if (status === "loading") {
    return <LoadingScreen message="Calibrating the meter" />;
  }

  // ── Stats ──
  const ashishTotal = logs.filter(l => l.who === "ashish").reduce((s, l) => s + l.level, 0);
  const leenaTotal  = logs.filter(l => l.who === "leena").reduce((s, l) => s + l.level, 0);
  const grandTotal  = ashishTotal + leenaTotal;
  const ashishPct   = grandTotal ? Math.round((ashishTotal / grandTotal) * 100) : 50;
  const leenaPct    = 100 - ashishPct;
  const topLog      = [...logs].sort((a, b) => b.level - a.level)[0];
  const lastLog     = logs[0];
  const peaceDays   = lastLog
    ? Math.floor((Date.now() - new Date(lastLog.createdAt).getTime()) / 86400000)
    : null;

  // All history sorted newest first
  const allHistory = [...logs].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="min-h-screen bg-[#0a0305] text-white relative">
      <div className="aurora" aria-hidden />

      <AppHeader variant="page" title="Piss-O-Meter 😤" subtitle="Who's the bigger menace?" />

      <div className="relative max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">

        {/* ── Score card ── */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <p className="text-xs text-rose-300/80 uppercase tracking-[0.25em] mb-4 text-center">Total Piss Score</p>
          <div className="flex items-center justify-between mb-3">
            <div className="text-center">
              <p className="text-pink-300 font-bold text-3xl">{ashishTotal}</p>
              <p className="text-white/65 text-xs mt-0.5">Ashish</p>
            </div>
            <p className="text-white/40 text-xs">pts</p>
            <div className="text-center">
              <p className="text-rose-300 font-bold text-3xl">{leenaTotal}</p>
              <p className="text-white/65 text-xs mt-0.5">Leena</p>
            </div>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden flex shadow-inner">
            <div className="bg-gradient-to-r from-pink-300 to-pink-400 transition-all duration-700" style={{ width: `${ashishPct}%` }} />
            <div className="bg-gradient-to-r from-rose-600 to-rose-800 transition-all duration-700" style={{ width: `${leenaPct}%` }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-pink-300 text-xs font-medium">{ashishPct}%</span>
            <span className="text-rose-300 text-xs font-medium">{leenaPct}%</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-center transition-colors hover:bg-white/[0.07]">
              <p className="text-white/60 text-xs mb-1">☮️ Peace streak</p>
              <p className="text-white font-semibold text-sm">
                {peaceDays === null ? "No logs yet" : peaceDays === 0 ? "Today 😬" : `${peaceDays}d`}
              </p>
            </div>
            <div className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-center transition-colors hover:bg-white/[0.07]">
              <p className="text-white/60 text-xs mb-1">🔥 Worst offense</p>
              {topLog ? (
                <p className="text-white font-semibold text-sm">
                  {levelInfo(topLog.level).emoji} Lvl {topLog.level} · {WHO_CONFIG[topLog.who as keyof typeof WHO_CONFIG]?.label}
                </p>
              ) : (
                <p className="text-white/55 text-sm">None yet</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Bar chart ── */}
        {logs.length > 0 && (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
            <p className="text-sm font-semibold mb-4">Incidents by Level 📊</p>
            <BarChart logs={logs} />
          </div>
        )}

        {/* ── Log form ── */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" aria-hidden />
            Log an Incident
          </h2>
          <form onSubmit={submit} className="flex flex-col gap-3">

            {/* Who */}
            <fieldset>
              <legend className="sr-only">Who?</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["ashish", "leena"] as const).map(w => {
                  const cfg = WHO_CONFIG[w];
                  const active = who === w;
                  return (
                    <button key={w} type="button" onClick={() => setWho(w)} aria-pressed={active}
                      className={`py-3 min-h-[44px] rounded-xl text-sm font-semibold border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                        active
                          ? `${cfg.color} ${cfg.border} text-white shadow-lg`
                          : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      {cfg.label} 😤
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Level */}
            <fieldset>
              <legend className="sr-only">Anger level</legend>
              <div className="grid grid-cols-5 gap-1.5">
                {LEVELS.map(li => {
                  const active = level === li.level;
                  return (
                    <button key={li.level} type="button" onClick={() => setLevel(li.level)} aria-pressed={active} aria-label={`Level ${li.level}: ${li.label}`}
                      className={`flex flex-col items-center gap-1 py-2.5 min-h-[56px] rounded-xl border text-xs transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                        active
                          ? "bg-gradient-to-b from-orange-500/40 to-orange-700/40 border-orange-400 text-white scale-[1.04] shadow-lg shadow-orange-700/30"
                          : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      <span className="text-lg">{li.emoji}</span>
                      <span>{li.level}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <p className="text-white/65 text-xs text-center -mt-1">
              {levelInfo(level).emoji} {levelInfo(level).label}
            </p>

            {/* Reason */}
            <label htmlFor="po-reason" className="sr-only">Reason</label>
            <input
              id="po-reason"
              type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="What did they do? 👀" required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-orange-400 focus:bg-white/[0.07] transition-colors"
            />

            {/* Date */}
            <div>
              <label htmlFor="po-date" className="text-white/70 text-xs mb-1 block font-medium">Date of incident</label>
              <input
                id="po-date"
                type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-400"
              />
            </div>

            {error && (
              <p role="alert" className="text-red-300 text-xs bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-orange-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                  Logging...
                </>
              ) : (
                <>
                  Log it
                  <Flame className="w-4 h-4" aria-hidden />
                </>
              )}
            </button>
          </form>
        </div>

        {/* ── All history ── */}
        {allHistory.length > 0 && (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
            <h2 className="font-semibold text-sm mb-4">All History ({allHistory.length})</h2>
            <ul className="flex flex-col gap-2 stagger">
              {allHistory.map(log => {
                const cfg = WHO_CONFIG[log.who as keyof typeof WHO_CONFIG];
                const li  = levelInfo(log.level);
                return (
                  <li key={log.id} className="animate-fade-up flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-xl px-3 py-2.5 transition-colors">
                    <span className="text-xl flex-shrink-0">{li.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${cfg?.text}`}>{cfg?.label}</span>
                        <span className="text-white/40 text-xs">·</span>
                        <span className="text-white/65 text-xs">Level {log.level}</span>
                        <span className="text-white/40 text-xs">·</span>
                        <span className="text-white/55 text-xs">
                          {new Date(log.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                        </span>
                      </div>
                      <p className="text-white/85 text-xs mt-0.5">{log.reason}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteLog(log.id)}
                      aria-label="Delete incident"
                      className="flex items-center justify-center w-10 h-10 rounded-full text-white/50 hover:text-red-400 hover:bg-red-500/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash className="w-4 h-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {logs.length === 0 && (
          <div className="text-center py-8 text-white/55 text-sm flex flex-col items-center gap-2">
            <span className="text-3xl animate-float">😇</span>
            <p>No incidents logged yet</p>
            <span className="text-xs text-white/40">Keep it that way...</span>
          </div>
        )}
      </div>
    </div>
  );
}
