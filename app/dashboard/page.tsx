"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Theme, EmojiStyle, type EmojiClickData } from "emoji-picker-react";
import AppHeader from "../components/AppHeader";
import LoadingScreen from "../components/LoadingScreen";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { useToast } from "../components/Toast";
import { Plus, Trash, Sparkles, Send, Heart, Calendar, X } from "../components/Icons";
import { motion, AnimatePresence, listItem, tapPress } from "../components/motion";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] flex items-center justify-center">
      <span className="w-6 h-6 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit" aria-hidden />
    </div>
  ),
});

/* ── Push notification helpers ── */
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function usePush() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      setSwReg(reg);
      const existing = await reg.pushManager.getSubscription();
      setSubscribed(!!existing);
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!swReg) return false;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return false;
      const sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setSubscribed(true);
      return true;
    } catch {
      return false;
    }
  }, [swReg]);

  const unsubscribe = useCallback(async () => {
    if (!swReg) return false;
    const sub = await swReg.pushManager.getSubscription();
    if (!sub) return false;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
    setSubscribed(false);
    return true;
  }, [swReg]);

  const sendPing = useCallback(async (title: string, body: string) => {
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, url: "/dashboard" }),
    });
  }, []);

  return { supported, subscribed, subscribe, unsubscribe, sendPing };
}

const MOODS = [
  { emoji: "😄", label: "Happy" },
  { emoji: "😍", label: "In Love" },
  { emoji: "😌", label: "Peaceful" },
  { emoji: "🥰", label: "Grateful" },
  { emoji: "🤩", label: "Excited" },
  { emoji: "🥳", label: "Celebrating" },
  { emoji: "😂", label: "Laughing" },
  { emoji: "🤗", label: "Cozy" },
  { emoji: "🥹", label: "Touched" },
  { emoji: "🙃", label: "Silly" },
  { emoji: "😎", label: "Confident" },
  { emoji: "🤔", label: "Thoughtful" },
  { emoji: "😴", label: "Tired" },
  { emoji: "🥱", label: "Bored" },
  { emoji: "😰", label: "Anxious" },
  { emoji: "🤒", label: "Unwell" },
  { emoji: "😔", label: "Sad" },
  { emoji: "😢", label: "Hurt" },
  { emoji: "💔", label: "Heartbroken" },
  { emoji: "😤", label: "Annoyed" },
  { emoji: "😡", label: "Angry" },
  { emoji: "🫠", label: "Melting" },
  { emoji: "🥺", label: "Pleading" },
  { emoji: "😶‍🌫️", label: "Foggy" },
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
  start:     { color: "text-green-200",  bg: "bg-green-900/25",  border: "border-green-500/35",  dot: "bg-green-400",   icon: "💚" },
  break:     { color: "text-red-200",    bg: "bg-red-900/25",    border: "border-red-500/35",    dot: "bg-red-400",     icon: "💔" },
  reunion:   { color: "text-rose-200",   bg: "bg-rose-900/25",   border: "border-rose-500/35",   dot: "bg-rose-400",    icon: "💗" },
  milestone: { color: "text-yellow-200", bg: "bg-yellow-900/25", border: "border-yellow-500/35", dot: "bg-yellow-400",  icon: "⭐" },
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
      <div className="flex flex-col items-center text-center py-6 gap-2">
        <Sparkles className="w-6 h-6 text-rose-400/60 animate-float" aria-hidden />
        <p className="text-white/55 text-sm">
          No timeline events yet
        </p>
        <Link href="/admin" className="text-rose-300 hover:text-rose-200 text-xs font-medium underline-offset-2 hover:underline">
          Add one in the Admin Panel
        </Link>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="relative pl-6 stagger">
      <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-rose-400/20 via-white/10 to-rose-400/20" />

      <div className="flex flex-col gap-5">
        {events.map((event, i) => {
          const cfg = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.milestone;
          const isLast = i === events.length - 1;

          return (
            <div key={event.id} className="relative animate-fade-up">
              <div
                className={`absolute -left-[1.35rem] top-1 w-3 h-3 rounded-full ${cfg.dot} ring-2 ring-[#0a0305] ${
                  isLast ? "shadow-[0_0_12px] shadow-rose-400/40" : ""
                }`}
              />

              <div className={`rounded-xl p-3 border backdrop-blur-sm transition-all ${cfg.bg} ${cfg.border} hover:border-white/30`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${cfg.color}`}>
                      {cfg.icon} {event.title}
                    </p>
                    <p className="text-white/55 text-xs mt-0.5">
                      {fmt(event.date)}
                      {event.endDate && ` → ${fmt(event.endDate)}`}
                    </p>
                    {event.reason && (
                      <p className="text-white/65 text-xs mt-1 italic">&ldquo;{event.reason}&rdquo;</p>
                    )}
                  </div>
                  {event.type === "break" && event.endDate && (
                    <span className="text-[11px] bg-red-500/20 text-red-200 px-2 py-0.5 rounded-full whitespace-nowrap font-medium">
                      {daysBetween(event.date, event.endDate)}d
                    </span>
                  )}
                  {isLast && event.type !== "break" && (
                    <span className="text-[11px] bg-rose-500/20 text-rose-200 px-2 py-0.5 rounded-full whitespace-nowrap font-medium">
                      {daysBetween(event.date, today)}d ago
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div className="relative animate-fade-up">
          <div className="absolute -left-[1.35rem] top-1 w-3 h-3 rounded-full bg-rose-400/70 ring-2 ring-[#0a0305] animate-glow-pulse" />
          <p className="text-white/60 text-xs pl-1 pt-0.5 font-medium">Today</p>
        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "", animate = true }: { children: React.ReactNode; className?: string; animate?: boolean }) {
  return (
    <section
      className={`relative bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 ${
        animate ? "animate-fade-up" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [moods, setMoods] = useState<MoodLog[]>([]);
  const [bucketItems, setBucketItems] = useState<BucketItem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [occasions, setOccasions] = useState<SpecialOccasion[]>([]);
  const [selectedMood, setSelectedMood] = useState("");
  const [moodPickerOpen, setMoodPickerOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const [customLabel, setCustomLabel] = useState("");
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
  // Push notifications
  const { supported, subscribed, subscribe, unsubscribe, sendPing } = usePush();
  const [pingMsg, setPingMsg] = useState("");
  const [pingSending, setPingSending] = useState(false);
  const pingInputRef = useRef<HTMLInputElement>(null);

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

  async function handleNotifToggle() {
    if (!supported) {
      // Likely insecure context (HTTP), iOS Safari without PWA install,
      // or a private window where Service Workers / PushManager are missing.
      const isSecure = typeof window !== "undefined" && window.isSecureContext;
      if (!isSecure) {
        toast.show("Push needs HTTPS — open via localhost or a secure URL", "error");
      } else if (typeof window !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        toast.show("On iPhone, add this app to Home Screen first", "error");
      } else {
        toast.show("Notifications aren't supported in this browser", "error");
      }
      return;
    }
    if (subscribed) {
      const ok = await unsubscribe();
      if (ok) toast.show("Notifications disabled", "success");
      else toast.show("Couldn't disable notifications", "error");
    } else {
      const ok = await subscribe();
      if (ok) toast.show("Notifications enabled ✨", "love");
      else toast.show("Permission denied", "error");
    }
  }

  async function logMood() {
    if (!selectedMood) return;
    setLoadingMood(true);
    try {
      const res = await fetch("/api/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: selectedMood, note: moodNote }),
      });
      if (!res.ok) throw new Error();
      const log = await res.json();
      setMoods((prev) => [log, ...prev]);
      setSelectedMood("");
      setMoodNote("");
      toast.show("Mood logged ✨", "love");
    } catch {
      toast.show("Couldn't save your mood", "error");
    } finally {
      setLoadingMood(false);
    }
  }

  async function addBucketItem() {
    if (!newBucketItem.trim()) return;
    setLoadingBucket(true);
    try {
      const res = await fetch("/api/bucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newBucketItem }),
      });
      if (!res.ok) throw new Error();
      const item = await res.json();
      setBucketItems((prev) => [item, ...prev]);
      setNewBucketItem("");
      toast.show("Added to bucket list", "success");
    } catch {
      toast.show("Couldn't add item", "error");
    } finally {
      setLoadingBucket(false);
    }
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
    if (!completed) toast.show("Done! 🎉", "love");
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
    try {
      const res = await fetch("/api/occasions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: occTitle, date: occDate, emoji: occEmoji, note: occNote || null }),
      });
      if (!res.ok) throw new Error();
      const occ = await res.json();
      setOccasions((prev) => [...prev, occ].sort((a, b) => a.date.localeCompare(b.date)));
      setOccTitle("");
      setOccDate("");
      setOccEmoji("🎉");
      setOccNote("");
      setShowOccForm(false);
      toast.show("Occasion saved 🌟", "love");
    } catch {
      toast.show("Couldn't save occasion", "error");
    } finally {
      setLoadingOcc(false);
    }
  }

  async function deleteOccasion(id: string) {
    await fetch("/api/occasions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setOccasions((prev) => prev.filter((o) => o.id !== id));
  }

  async function sendPingNow() {
    if (!pingMsg.trim()) return;
    setPingSending(true);
    try {
      await sendPing(`💌 ${session?.user?.name}`, pingMsg.trim());
      setPingMsg("");
      toast.show("Ping sent 💌", "love");
    } catch {
      toast.show("Couldn't send ping", "error");
    } finally {
      setPingSending(false);
      pingInputRef.current?.focus();
    }
  }

  function daysUntil(dateStr: string) {
    const today = new Date().toISOString().split("T")[0];
    const diff = Math.ceil(
      (new Date(dateStr + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime()) / 86400000
    );
    return diff;
  }

  if (status === "loading" || status === "unauthenticated") {
    return <LoadingScreen message="Tuning the cosmos" />;
  }

  const pendingItems = bucketItems.filter((i) => !i.completed);
  const doneItems = bucketItems.filter((i) => i.completed);

  return (
    <div className="min-h-screen bg-[#0a0305] text-white relative">
      <div className="aurora" aria-hidden />

      <AppHeader
        variant="main"
        title="leen-a-po"
        subtitle={session?.user?.name ? `Hey ${session.user.name} 👋` : undefined}
        notifications={{ supported, subscribed, onToggle: handleNotifToggle }}
      />

      <div className="relative max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Top row: Timeline + Mood Logger */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

          {/* Timeline */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-400 fill-rose-400/40" aria-hidden />
                Our Story
              </h2>
              {session?.user?.role === "admin" && (
                <Link
                  href="/admin"
                  className="flex items-center gap-1 text-rose-300 text-xs hover:text-rose-200 font-medium transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden />
                  Add event
                </Link>
              )}
            </div>
            <Timeline events={timelineEvents} />
          </Card>

          {/* Mood Logger */}
          <Card>
            <h2 className="font-semibold text-sm mb-4">How are you feeling? 💭</h2>

            {/* Selected mood / picker trigger */}
            <button
              type="button"
              onClick={() => setMoodPickerOpen((v) => !v)}
              aria-expanded={moodPickerOpen}
              aria-controls="mood-picker"
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[56px] rounded-xl border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                selectedMood
                  ? "bg-gradient-to-r from-rose-500/15 to-pink-500/10 border-rose-400/40"
                  : "bg-white/5 border-white/10 hover:bg-white/[0.07] hover:border-white/20"
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                {selectedMood ? (
                  <>
                    <span className="text-2xl shrink-0">{selectedMood.split(" ")[0]}</span>
                    <span className="text-sm font-medium text-white truncate">
                      {selectedMood.split(" ").slice(1).join(" ")}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl shrink-0 opacity-60">🙂</span>
                    <span className="text-sm text-white/70">Pick your mood</span>
                  </>
                )}
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`w-4 h-4 text-white/60 shrink-0 transition-transform duration-200 ${moodPickerOpen ? "rotate-180" : ""}`}
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Picker panel */}
            {moodPickerOpen && (
              <div
                id="mood-picker"
                className="mt-3 mb-4 rounded-xl overflow-hidden border border-white/10 animate-slide-down emoji-picker-host"
              >
                <EmojiPicker
                  theme={Theme.DARK}
                  emojiStyle={EmojiStyle.NATIVE}
                  lazyLoadEmojis
                  searchPlaceHolder="Search any emoji..."
                  width="100%"
                  height={380}
                  previewConfig={{ showPreview: false }}
                  onEmojiClick={(d: EmojiClickData) => {
                    const niceLabel = (d.names?.[0] || "Mood")
                      .split(/[\s_-]+/)
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                      .join(" ");
                    setSelectedMood(`${d.emoji} ${niceLabel}`);
                    setMoodPickerOpen(false);
                  }}
                />

                {/* Custom label override — for moods that need a personal twist */}
                <div className="bg-white/[0.03] border-t border-white/10 px-3 py-3">
                  <p className="text-white/65 text-[11px] font-medium uppercase tracking-wider mb-2">
                    Or type your own
                  </p>
                  <div className="flex gap-2">
                    <label htmlFor="custom-emoji" className="sr-only">Custom emoji</label>
                    <input
                      id="custom-emoji"
                      type="text"
                      value={customEmoji}
                      onChange={(e) => setCustomEmoji(e.target.value.slice(0, 4))}
                      placeholder="🌈"
                      aria-label="Custom emoji"
                      className="w-14 text-center bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-xl focus:outline-none focus:border-rose-400"
                    />
                    <label htmlFor="custom-label" className="sr-only">Custom mood label</label>
                    <input
                      id="custom-label"
                      type="text"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="Label (e.g. Hopeful)"
                      maxLength={32}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const e = customEmoji.trim();
                        const l = customLabel.trim();
                        if (!e || !l) return;
                        setSelectedMood(`${e} ${l}`);
                        setCustomEmoji("");
                        setCustomLabel("");
                        setMoodPickerOpen(false);
                      }}
                      disabled={!customEmoji.trim() || !customLabel.trim()}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-br from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      Use
                    </button>
                  </div>
                </div>
              </div>
            )}

            <label htmlFor="mood-note" className="sr-only">Optional note about your mood</label>
            <input
              id="mood-note"
              type="text"
              value={moodNote}
              onChange={(e) => setMoodNote(e.target.value)}
              placeholder="Add a note... (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400 focus:bg-white/[0.07] transition-colors mt-3 mb-3"
            />
            <button
              type="button"
              onClick={logMood}
              disabled={!selectedMood || loadingMood}
              className="w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-rose-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 flex items-center justify-center gap-2"
            >
              {loadingMood ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                  Logging...
                </>
              ) : (
                <>
                  Log Mood
                  <Sparkles className="w-4 h-4" aria-hidden />
                </>
              )}
            </button>
            {moods.length > 0 && (
              <div className="mt-4 space-y-2 stagger">
                <p className="text-white/55 text-xs font-medium uppercase tracking-wider">Recent</p>
                {moods.slice(0, 5).map((log) => (
                  <div
                    key={log.id}
                    className="animate-fade-up flex items-center justify-between bg-white/5 hover:bg-white/[0.07] rounded-xl px-3 py-2 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{log.mood.split(" ")[0]}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-white/85 truncate">{log.mood} · {log.user.name}</p>
                        {log.note && <p className="text-xs text-white/55 truncate">{log.note}</p>}
                      </div>
                    </div>
                    <p className="text-white/45 text-xs shrink-0">
                      {new Date(log.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>

        {/* Bucket List */}
        <Card>
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            🪣 Our Bucket List
            <Sparkles className="w-3.5 h-3.5 text-rose-400" aria-hidden />
          </h2>
          <div className="flex gap-2 mb-4">
            <label htmlFor="bucket-input" className="sr-only">New bucket-list item</label>
            <input
              id="bucket-input"
              type="text"
              value={newBucketItem}
              onChange={(e) => setNewBucketItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBucketItem()}
              placeholder="Add something to do together..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400 focus:bg-white/[0.07] transition-colors"
            />
            <button
              type="button"
              onClick={addBucketItem}
              disabled={loadingBucket || !newBucketItem.trim()}
              aria-label="Add to bucket list"
              className="flex items-center justify-center w-12 min-w-[44px] h-12 rounded-xl bg-gradient-to-br from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-lg shadow-rose-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <Plus className="w-5 h-5" aria-hidden />
            </button>
          </div>
          {pendingItems.length > 0 && (
            <ul className="mb-4">
              <AnimatePresence initial={false} mode="popLayout">
                {pendingItems.map((item) => (
                  <motion.li
                    key={item.id}
                    layout
                    variants={listItem}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex items-center gap-2 group rounded-xl pl-1 pr-1 hover:bg-white/[0.04] transition-colors"
                  >
                    <motion.button
                      type="button"
                      onClick={() => toggleBucketItem(item.id, item.completed)}
                      aria-label={`Mark "${item.title}" as done`}
                      whileTap={tapPress}
                      className="flex items-center justify-center w-10 h-10 rounded-full text-white/60 hover:text-rose-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      <span className="w-5 h-5 rounded-full border-2 border-white/40 group-hover:border-rose-400 transition-colors" />
                    </motion.button>
                    <span className="flex-1 text-sm text-white/90 break-words py-1.5">{item.title}</span>
                    <motion.button
                      type="button"
                      onClick={() => deleteBucketItem(item.id)}
                      aria-label={`Delete "${item.title}"`}
                      whileTap={tapPress}
                      className="flex items-center justify-center w-10 h-10 rounded-full text-white/40 hover:text-red-400 hover:bg-red-500/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors shrink-0"
                    >
                      <Trash className="w-4 h-4" aria-hidden />
                    </motion.button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          {doneItems.length > 0 && (
            <div>
              <p className="text-white/55 text-xs mb-2 font-medium uppercase tracking-wider">✅ Done ({doneItems.length})</p>
              <ul>
                <AnimatePresence initial={false} mode="popLayout">
                  {doneItems.map((item) => (
                    <motion.li
                      key={item.id}
                      layout
                      variants={listItem}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="flex items-center gap-2 group rounded-xl pl-1 pr-1 hover:bg-white/[0.04] transition-colors"
                    >
                      <motion.button
                        type="button"
                        onClick={() => toggleBucketItem(item.id, item.completed)}
                        aria-label={`Mark "${item.title}" as not done`}
                        whileTap={tapPress}
                        className="flex items-center justify-center w-10 h-10 rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <motion.span
                          layout
                          className="w-5 h-5 rounded-full bg-rose-600 flex items-center justify-center shadow-md shadow-rose-700/40"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-3 h-3 text-white" aria-hidden>
                            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </motion.span>
                      </motion.button>
                      <span className="flex-1 text-sm text-white/45 line-through break-words py-1.5">{item.title}</span>
                      <motion.button
                        type="button"
                        onClick={() => deleteBucketItem(item.id)}
                        aria-label={`Delete "${item.title}"`}
                        whileTap={tapPress}
                        className="flex items-center justify-center w-10 h-10 rounded-full text-white/40 hover:text-red-400 hover:bg-red-500/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors shrink-0"
                      >
                        <Trash className="w-4 h-4" aria-hidden />
                      </motion.button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          )}
          {bucketItems.length === 0 && (
            <div className="flex flex-col items-center text-center py-6 gap-2">
              <Sparkles className="w-6 h-6 text-rose-400/60 animate-float" aria-hidden />
              <p className="text-white/55 text-sm">No plans yet — add the first one above</p>
            </div>
          )}
        </Card>

        {/* Special Occasions */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-rose-400" aria-hidden />
              Special Occasions
            </h2>
            <button
              type="button"
              onClick={() => setShowOccForm((v) => !v)}
              aria-expanded={showOccForm}
              className="flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-full text-rose-300 text-xs hover:text-rose-200 hover:bg-rose-500/10 font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              {showOccForm ? <X className="w-3.5 h-3.5" aria-hidden /> : <Plus className="w-3.5 h-3.5" aria-hidden />}
              {showOccForm ? "Cancel" : "Add"}
            </button>
          </div>

          {showOccForm && (
            <div className="mb-5 bg-white/[0.04] border border-white/10 rounded-xl p-4 flex flex-col gap-3 animate-slide-down">
              <div className="flex gap-2">
                <label htmlFor="occ-title" className="sr-only">Occasion title</label>
                <input
                  id="occ-title"
                  type="text"
                  value={occTitle}
                  onChange={(e) => setOccTitle(e.target.value)}
                  placeholder="Occasion title..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400"
                />
                <label htmlFor="occ-emoji" className="sr-only">Emoji</label>
                <input
                  id="occ-emoji"
                  type="text"
                  value={occEmoji}
                  onChange={(e) => setOccEmoji(e.target.value)}
                  maxLength={2}
                  placeholder="🎉"
                  aria-label="Emoji"
                  className="w-14 text-center bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-lg focus:outline-none focus:border-rose-400"
                />
              </div>
              <label htmlFor="occ-date" className="sr-only">Date</label>
              <input
                id="occ-date"
                type="date"
                value={occDate}
                onChange={(e) => setOccDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-rose-400"
              />
              <label htmlFor="occ-note" className="sr-only">Note</label>
              <input
                id="occ-note"
                type="text"
                value={occNote}
                onChange={(e) => setOccNote(e.target.value)}
                placeholder="Note... (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400"
              />
              <button
                type="button"
                onClick={addOccasion}
                disabled={!occTitle.trim() || !occDate || loadingOcc}
                className="w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-rose-700/30 flex items-center justify-center gap-2"
              >
                {loadingOcc ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                    Saving...
                  </>
                ) : (
                  <>
                    Save Occasion
                    <Sparkles className="w-4 h-4" aria-hidden />
                  </>
                )}
              </button>
            </div>
          )}

          {occasions.length === 0 ? (
            <div className="flex flex-col items-center text-center py-6 gap-2">
              <Calendar className="w-6 h-6 text-rose-400/60 animate-float" aria-hidden />
              <p className="text-white/55 text-sm">No occasions yet — add something to remember</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {occasions.map((occ) => {
                const days = daysUntil(occ.date);
                const isPast = days < 0;
                const isToday = days === 0;
                const isSoon = !isPast && !isToday && days <= 7;
                return (
                  <motion.li
                    key={occ.id}
                    layout
                    variants={listItem}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className={`group flex items-start gap-3 rounded-xl pl-4 pr-2 py-3 border transition-all hover:border-white/25 ${
                      isToday
                        ? "bg-gradient-to-r from-yellow-500/15 to-amber-500/10 border-yellow-400/40 shadow-lg shadow-yellow-500/10"
                        : isSoon
                        ? "bg-rose-500/[0.06] border-rose-400/25"
                        : "bg-white/[0.04] border-white/10"
                    }`}
                  >
                    <span className={`text-2xl leading-none shrink-0 mt-1 ${isToday ? "animate-heart-beat" : ""}`}>
                      {occ.emoji}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white break-words leading-snug flex-1 min-w-0">
                          {occ.title}
                        </p>
                        <span
                          className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0 mt-0.5 ${
                            isToday
                              ? "bg-yellow-400/25 text-yellow-100 ring-1 ring-yellow-400/40"
                              : isPast
                              ? "bg-white/10 text-white/55"
                              : isSoon
                              ? "bg-pink-500/25 text-pink-100"
                              : "bg-rose-500/15 text-rose-200"
                          }`}
                        >
                          {isToday ? "Today! 🎉" : isPast ? `${Math.abs(days)}d ago` : `in ${days}d`}
                        </span>
                      </div>
                      <p className="text-xs text-white/65">
                        {new Date(occ.date + "T12:00:00Z").toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric",
                        })}
                      </p>
                      {occ.note && (
                        <p className="text-xs text-white/60 italic break-words leading-relaxed">
                          &ldquo;{occ.note}&rdquo;
                        </p>
                      )}
                    </div>
                    <motion.button
                      type="button"
                      onClick={() => deleteOccasion(occ.id)}
                      aria-label={`Delete "${occ.title}"`}
                      whileTap={tapPress}
                      className="flex items-center justify-center w-9 h-9 rounded-full text-white/40 hover:text-red-400 hover:bg-red-500/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors shrink-0 self-start mt-0.5"
                    >
                      <Trash className="w-4 h-4" aria-hidden />
                    </motion.button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            </ul>
          )}
        </Card>

        {/* Ping your partner */}
        {supported && subscribed && (
          <Card>
            <h2 className="font-semibold text-sm mb-1 flex items-center gap-2">
              <Send className="w-4 h-4 text-rose-400" aria-hidden />
              Ping
            </h2>
            <p className="text-white/55 text-xs mb-4">Send a notification to your partner</p>
            <div className="flex gap-2">
              <label htmlFor="ping-input" className="sr-only">Ping message</label>
              <input
                id="ping-input"
                ref={pingInputRef}
                type="text"
                value={pingMsg}
                onChange={(e) => setPingMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && pingMsg.trim()) sendPingNow(); }}
                placeholder="Say something sweet..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400 focus:bg-white/[0.07] transition-colors"
              />
              <button
                type="button"
                onClick={sendPingNow}
                disabled={!pingMsg.trim() || pingSending}
                aria-label="Send ping"
                className="flex items-center justify-center gap-1.5 min-w-[80px] px-4 py-3 rounded-xl bg-gradient-to-br from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold transition-all cursor-pointer shadow-lg shadow-rose-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                {pingSending ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                ) : (
                  <>
                    Send
                    <Send className="w-4 h-4" aria-hidden />
                  </>
                )}
              </button>
            </div>
          </Card>
        )}

        {supported && !subscribed && (
          <button
            type="button"
            onClick={handleNotifToggle}
            className="animate-fade-up w-full py-4 min-h-[44px] rounded-2xl bg-white/[0.04] border border-dashed border-white/15 hover:border-rose-400/50 hover:bg-rose-500/5 text-white/65 hover:text-white text-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 flex items-center justify-center gap-2"
          >
            <span className="text-base">🔕</span>
            Enable notifications to ping each other
          </button>
        )}

        {/* Theme picker — sits at the very end of the dashboard */}
        <ThemeSwitcher />

      </div>
    </div>
  );
}

