"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const MOODS = [
  { emoji: "😄", label: "Happy" },
  { emoji: "😍", label: "In Love" },
  { emoji: "😌", label: "Peaceful" },
  { emoji: "🥰", label: "Grateful" },
  { emoji: "😔", label: "Sad" },
  { emoji: "😤", label: "Annoyed" },
  { emoji: "😴", label: "Tired" },
  { emoji: "🤩", label: "Excited" },
];

interface MoodLog {
  id: string;
  mood: string;
  note: string | null;
  createdAt: string;
  user: { name: string };
}

interface BucketItem {
  id: string;
  title: string;
  completed: boolean;
  addedById: string;
  completedAt: string | null;
  createdAt: string;
}

interface TimelineEvent {
  id: string;
  type: string;
  date: string;
  endDate: string | null;
  title: string;
  reason: string | null;
}

interface SpecialOccasion {
  id: string;
  title: string;
  date: string;
  emoji: string;
  note: string | null;
}

const EVENT_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string; icon: string }> = {
  start:     { color: "text-green-300",  bg: "bg-green-900/20",  border: "border-green-500/30",  dot: "bg-green-400",   icon: "💚" },
  break:     { color: "text-red-300",    bg: "bg-red-900/20",    border: "border-red-500/30",    dot: "bg-red-400",     icon: "💔" },
  reunion:   { color: "text-rose-300",   bg: "bg-rose-900/20",   border: "border-rose-500/30",   dot: "bg-rose-400",    icon: "💗" },
  milestone: { color: "text-yellow-300", bg: "bg-yellow-900/20", border: "border-yellow-500/30", dot: "bg-yellow-400",  icon: "⭐" },
};

function fmt(dateStr: string) {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
  });
}

function daysBetween(a: string, b: string) {
  return Math.abs(Math.floor(
    (new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000
  ));
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-white/30 text-sm text-center py-6">
        No timeline events yet — add them in the Admin Panel ✨
      </p>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-2 top-2 bottom-2 w-px bg-white/10" />

      <div className="flex flex-col gap-5">
        {events.map((event, i) => {
          const cfg = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.milestone;
          const isLast = i === events.length - 1;

          return (
            <div key={event.id} className="relative">
              {/* Dot */}
              <div className={`absolute -left-[1.35rem] top-1 w-3 h-3 rounded-full ${cfg.dot} ring-2 ring-black`} />

              <div className={`rounded-xl p-3 border ${cfg.bg} ${cfg.border}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className={`text-xs font-semibold ${cfg.color}`}>
                      {cfg.icon} {event.title}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {fmt(event.date)}
                      {event.endDate && ` → ${fmt(event.endDate)}`}
                    </p>
                    {event.reason && (
                      <p className="text-white/50 text-xs mt-1 italic">"{event.reason}"</p>
                    )}
                  </div>
                  {/* Duration badge */}
                  {event.type === "break" && event.endDate && (
                    <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {daysBetween(event.date, event.endDate)}d
                    </span>
                  )}
                  {isLast && event.type !== "break" && (
                    <span className="text-xs bg-rose-900/40 text-rose-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {daysBetween(event.date, today)}d ago
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* "Today" cap */}
        <div className="relative">
          <div className="absolute -left-[1.35rem] top-1 w-3 h-3 rounded-full bg-white/30 ring-2 ring-black animate-pulse" />
          <p className="text-white/30 text-xs pl-1 pt-0.5">Today</p>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [moods, setMoods] = useState<MoodLog[]>([]);
  const [bucketItems, setBucketItems] = useState<BucketItem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [occasions, setOccasions] = useState<SpecialOccasion[]>([]);
  const [selectedMood, setSelectedMood] = useState("");
  const [moodNote, setMoodNote] = useState("");
  const [newBucketItem, setNewBucketItem] = useState("");
  const [loadingMood, setLoadingMood] = useState(false);
  const [loadingBucket, setLoadingBucket] = useState(false);
  // Occasions form state
  const [occTitle, setOccTitle] = useState("");
  const [occDate, setOccDate] = useState("");
  const [occEmoji, setOccEmoji] = useState("🎉");
  const [occNote, setOccNote] = useState("");
  const [loadingOcc, setLoadingOcc] = useState(false);
  const [showOccForm, setShowOccForm] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/mood").then((r) => r.ok ? r.json() : []).then(setMoods);
      fetch("/api/bucket").then((r) => r.ok ? r.json() : []).then(setBucketItems);
      fetch("/api/timeline").then((r) => r.ok ? r.json() : []).then(setTimelineEvents);
      fetch("/api/occasions").then((r) => r.ok ? r.json() : []).then(setOccasions);
    }
  }, [status]);

  async function logMood() {
    if (!selectedMood) return;
    setLoadingMood(true);
    const res = await fetch("/api/mood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood: selectedMood, note: moodNote }),
    });
    const log = await res.json();
    setMoods((prev) => [log, ...prev]);
    setSelectedMood("");
    setMoodNote("");
    setLoadingMood(false);
  }

  async function addBucketItem() {
    if (!newBucketItem.trim()) return;
    setLoadingBucket(true);
    const res = await fetch("/api/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newBucketItem }),
    });
    const item = await res.json();
    setBucketItems((prev) => [item, ...prev]);
    setNewBucketItem("");
    setLoadingBucket(false);
  }

  async function toggleBucketItem(id: string, completed: boolean) {
    await fetch("/api/bucket", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, completed: !completed }),
    });
    setBucketItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, completed: !completed, completedAt: !completed ? new Date().toISOString() : null }
          : item
      )
    );
  }

  async function deleteBucketItem(id: string) {
    await fetch("/api/bucket", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBucketItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function addOccasion() {
    if (!occTitle.trim() || !occDate) return;
    setLoadingOcc(true);
    const res = await fetch("/api/occasions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: occTitle, date: occDate, emoji: occEmoji, note: occNote || null }),
    });
    const occ = await res.json();
    setOccasions((prev) => [...prev, occ].sort((a, b) => a.date.localeCompare(b.date)));
    setOccTitle("");
    setOccDate("");
    setOccEmoji("🎉");
    setOccNote("");
    setShowOccForm(false);
    setLoadingOcc(false);
  }

  async function deleteOccasion(id: string) {
    await fetch("/api/occasions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setOccasions((prev) => prev.filter((o) => o.id !== id));
  }

  function daysUntil(dateStr: string) {
    const today = new Date().toISOString().split("T")[0];
    const diff = Math.ceil(
      (new Date(dateStr + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime()) / 86400000
    );
    return diff;
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#0a0305] flex items-center justify-center">
        <div className="text-white/40 animate-pulse">Loading...</div>
      </div>
    );
  }

  const pendingItems = bucketItems.filter((i) => !i.completed);
  const doneItems = bucketItems.filter((i) => i.completed);

  return (
    <div className="min-h-screen bg-[#0a0305] text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#0a0305]/80 backdrop-blur border-b border-white/10 px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">leen-a-po 🌌</h1>
          <p className="text-white/40 text-xs">Hey {session?.user?.name} 👋</p>
        </div>
        <div className="flex items-center gap-3">
          {session?.user?.role === "admin" && (
            <Link href="/admin" className="text-rose-400 text-xs font-medium hover:text-rose-300">
              Admin
            </Link>
          )}
          <Link href="/about" className="text-white/40 text-xs hover:text-white/60">About Us</Link>
          <Link href="/pissoff" className="text-orange-400 text-xs hover:text-orange-300">😤 Meter</Link>
          <Link href="/apod" className="text-white/40 text-xs hover:text-white/60">APOD</Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-white/40 text-xs hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Top row: Timeline (left) + Mood Logger (right) on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

          {/* Timeline — left on desktop */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-sm">Our Story 💫</h2>
              {session?.user?.role === "admin" && (
                <Link href="/admin" className="text-rose-400 text-xs hover:text-rose-300">
                  + Add event
                </Link>
              )}
            </div>
            <Timeline events={timelineEvents} />
          </div>

          {/* Mood Logger — right on desktop */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="font-semibold text-sm mb-4">How are you feeling? 💭</h2>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {MOODS.map((m) => (
                <button
                  key={m.emoji}
                  onClick={() => setSelectedMood(m.emoji + " " + m.label)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-xs transition-all ${
                    selectedMood === m.emoji + " " + m.label
                      ? "bg-rose-800/40 border border-rose-600"
                      : "bg-white/5 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  <span className="text-xl">{m.emoji}</span>
                  <span className="text-white/60">{m.label}</span>
                </button>
              ))}
            </div>
            <input
              type="text"
              value={moodNote}
              onChange={(e) => setMoodNote(e.target.value)}
              placeholder="Add a note... (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-rose-500 mb-3"
            />
            <button
              onClick={logMood}
              disabled={!selectedMood || loadingMood}
              className="w-full py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-sm font-semibold transition-colors"
            >
              {loadingMood ? "Logging..." : "Log Mood ✨"}
            </button>
            {moods.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-white/40 text-xs">Recent</p>
                {moods.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{log.mood.split(" ")[0]}</span>
                      <div>
                        <p className="text-xs text-white/80">{log.mood} · {log.user.name}</p>
                        {log.note && <p className="text-xs text-white/40">{log.note}</p>}
                      </div>
                    </div>
                    <p className="text-white/30 text-xs">
                      {new Date(log.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Bucket List — full width below */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="font-semibold text-sm mb-4">Our Bucket List 🪣✨</h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newBucketItem}
              onChange={(e) => setNewBucketItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBucketItem()}
              placeholder="Add something to do together..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-rose-500"
            />
            <button
              onClick={addBucketItem}
              disabled={loadingBucket}
              className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-sm font-bold transition-colors"
            >
              +
            </button>
          </div>
          {pendingItems.length > 0 && (
            <div className="space-y-2 mb-4">
              {pendingItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 group">
                  <button
                    onClick={() => toggleBucketItem(item.id, item.completed)}
                    className="w-5 h-5 rounded-full border-2 border-white/30 hover:border-rose-400 flex-shrink-0 transition-colors"
                  />
                  <span className="flex-1 text-sm text-white/80">{item.title}</span>
                  <button onClick={() => deleteBucketItem(item.id)} className="opacity-30 group-hover:opacity-100 text-white/50 hover:text-red-400 active:text-red-400 text-xs transition-all">✕</button>
                </div>
              ))}
            </div>
          )}
          {doneItems.length > 0 && (
            <div>
              <p className="text-white/30 text-xs mb-2">✅ Done ({doneItems.length})</p>
              <div className="space-y-2">
                {doneItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 group">
                    <button
                      onClick={() => toggleBucketItem(item.id, item.completed)}
                      className="w-5 h-5 rounded-full bg-rose-700 border-2 border-rose-700 flex-shrink-0 flex items-center justify-center text-white text-xs"
                    >✓</button>
                    <span className="flex-1 text-sm text-white/30 line-through">{item.title}</span>
                    <button onClick={() => deleteBucketItem(item.id)} className="opacity-30 group-hover:opacity-100 text-white/50 hover:text-red-400 active:text-red-400 text-xs transition-all">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {bucketItems.length === 0 && (
            <p className="text-white/30 text-sm text-center py-4">No plans yet... add some! 💫</p>
          )}
        </div>

        {/* Special Occasions */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Special Occasions 🗓️✨</h2>
            <button
              onClick={() => setShowOccForm((v) => !v)}
              className="text-rose-400 text-xs hover:text-rose-300 font-medium transition-colors"
            >
              {showOccForm ? "Cancel" : "+ Add"}
            </button>
          </div>

          {/* Add form */}
          {showOccForm && (
            <div className="mb-5 bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={occTitle}
                  onChange={(e) => setOccTitle(e.target.value)}
                  placeholder="Occasion title..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-rose-500"
                />
                <input
                  type="text"
                  value={occEmoji}
                  onChange={(e) => setOccEmoji(e.target.value)}
                  maxLength={2}
                  placeholder="🎉"
                  className="w-14 text-center bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-lg focus:outline-none focus:border-rose-500"
                />
              </div>
              <input
                type="date"
                value={occDate}
                onChange={(e) => setOccDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
              />
              <input
                type="text"
                value={occNote}
                onChange={(e) => setOccNote(e.target.value)}
                placeholder="Note... (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-rose-500"
              />
              <button
                onClick={addOccasion}
                disabled={!occTitle.trim() || !occDate || loadingOcc}
                className="w-full py-2 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-sm font-semibold transition-colors"
              >
                {loadingOcc ? "Saving..." : "Save Occasion ✨"}
              </button>
            </div>
          )}

          {occasions.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-4">No occasions yet — add something to remember! 🌟</p>
          ) : (
            <div className="flex flex-col gap-2">
              {occasions.map((occ) => {
                const days = daysUntil(occ.date);
                const isPast = days < 0;
                const isToday = days === 0;
                return (
                  <div key={occ.id} className={`group flex items-start gap-3 rounded-xl px-4 py-3 border transition-all ${
                    isToday
                      ? "bg-yellow-900/20 border-yellow-500/30"
                      : isPast
                      ? "bg-white/5 border-white/10"
                      : "bg-white/5 border-white/10"
                  }`}>
                    <span className="text-2xl mt-0.5 leading-none">{occ.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{occ.title}</p>
                      <p className="text-xs text-white/60 mt-0.5">
                        {new Date(occ.date + "T12:00:00Z").toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric",
                        })}
                      </p>
                      {occ.note && <p className="text-xs text-white/55 italic mt-0.5 truncate">"{occ.note}"</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                        isToday
                          ? "bg-yellow-500/20 text-yellow-300"
                          : isPast
                          ? "bg-white/10 text-white/50"
                          : days <= 7
                          ? "bg-pink-900/40 text-pink-300"
                          : "bg-rose-900/40 text-rose-300"
                      }`}>
                        {isToday ? "Today! 🎉" : isPast ? `${Math.abs(days)}d ago` : `in ${days}d`}
                      </span>
                      <button
                        onClick={() => deleteOccasion(occ.id)}
                        className="opacity-30 group-hover:opacity-100 text-white/50 hover:text-red-400 active:text-red-400 text-xs transition-all"
                      >✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
