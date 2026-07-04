"use client";

import { useEffect, useRef, useState, useCallback, useMemo, type RefObject } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppHeader from "../components/AppHeader";
import LoadingScreen from "../components/LoadingScreen";
import { useToast } from "../components/Toast";
import { Send, Heart, X, Sparkles, Camera, Mic } from "../components/Icons";
import { motion, AnimatePresence, chatBubble, tapPress } from "../components/motion";
import StickerPicker from "../components/StickerPicker";
import StickerMedia from "../components/StickerMedia";
import MessageActions from "../components/MessageActions";
import MediaLinkEmbed, { detectMediaLink } from "../components/MediaLinkEmbed";
import VoiceRecorder from "../components/VoiceRecorder";
import AudioBubble from "../components/AudioBubble";
import ChatWallpaperPicker from "../components/ChatWallpaperPicker";
import {
  DEFAULT_WALLPAPER,
  isWallpaperId,
  wallpaperClass,
  type ResolvedWallpaper,
  type WallpaperId,
} from "@/lib/wallpapers";

// ── Types ────────────────────────────────────────────────────────────
interface Reaction {
  userId: string;
  userName: string;
  emoji: string;
}
interface ReplyPreview {
  id: string;
  text: string;
  sender: { id: string; name: string };
  attachments: string[];
}
interface Message {
  id: string;
  /** Echo-matching nonce for our own optimistic sends — never persisted. */
  clientId?: string;
  text: string;
  createdAt: string;
  sender: { id: string; name: string };
  attachments?: string[];
  reactions?: Reaction[];
  replyTo?: ReplyPreview | null;
  pending?: boolean;
  failed?: boolean;
}

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  key?: string;
}

interface Presence {
  userId: string;
  name: string;
  lastSeenAt: string | null;
  lastReadAt: string | null;
}

const MAX_ATTACHMENTS = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const ONLINE_THRESHOLD_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const TYPING_HOLD_MS = 4_000;
const TYPING_DEBOUNCE_MS = 800;

// ── Helpers ─────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit",
  });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long",
  });
}

function lastSeenLabel(iso: string | null) {
  if (!iso) return "Offline";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < ONLINE_THRESHOLD_MS) return "Online";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last seen ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Last seen ${days}d ago`;
  return `Last seen ${new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function newClientId() {
  // crypto.randomUUID is everywhere we support, but degrade gracefully.
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// Toggle `emoji` by `userId` on one message — pure, so the optimistic update
// and its failure revert can share the exact same transform (a second apply
// undoes the first).
function withReactionToggled(
  list: Message[],
  messageId: string,
  emoji: string,
  userId: string,
  userName: string
): Message[] {
  return list.map((m) => {
    if (m.id !== messageId) return m;
    const reactions = (m.reactions ?? []).slice();
    const idx = reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);
    if (idx === -1) reactions.push({ userId, userName, emoji });
    else reactions.splice(idx, 1);
    return { ...m, reactions };
  });
}

// Sticker key → signed URL, so optimistic sticker bubbles can show the actual
// sticker (the picker only hands us the R2 key). Module-level: survives
// remounts. Entries are 1h-signed URLs — plenty for a pending bubble.
const stickerUrlCache = new Map<string, string>();

function isAudioUrl(url: string) {
  const path = url.split("?")[0];
  return /\.(webm|m4a|mp3|ogg|wav)$/i.test(path);
}

function isStickerUrl(url: string) {
  const path = url.split("?")[0];
  return /\/stickers\//.test(path);
}

function previewLine(m: ReplyPreview): string {
  if (m.text) return m.text.length > 60 ? m.text.slice(0, 59) + "…" : m.text;
  if (m.attachments?.length) {
    if (m.attachments.some(isStickerUrl)) return "🎨 Sticker";
    if (m.attachments.some(isAudioUrl)) return "🎤 Voice note";
    return `📷 ${m.attachments.length === 1 ? "Photo" : `${m.attachments.length} photos`}`;
  }
  return "Message";
}

// ── Inline sub-components ───────────────────────────────────────────
function AttachmentGrid({ urls, onOpen }: { urls: string[]; onOpen?: (i: number) => void }) {
  const cols = urls.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <div className={`grid ${cols} gap-1.5 ${urls.length ? "mb-1" : ""}`}>
      {urls.map((url, i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.(i);
          }}
          className="block rounded-xl overflow-hidden bg-black/30 max-w-xs cursor-pointer"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="attachment" loading="lazy" className="w-full h-auto max-h-72 object-cover" />
        </button>
      ))}
    </div>
  );
}

function StickerBubble({ url }: { url: string }) {
  return <StickerMedia url={url} className="w-40 h-40 sm:w-48 sm:h-48 object-contain select-none" />;
}

function ReplyQuote({
  reply,
  onJump,
  mine,
}: {
  reply: ReplyPreview;
  onJump?: () => void;
  mine: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump?.();
      }}
      className={`flex items-stretch gap-2 mb-1.5 -mx-1 -mt-1 rounded-md text-left w-full overflow-hidden cursor-pointer hover:opacity-90 ${
        mine ? "bg-white/15" : "bg-rose-500/15"
      }`}
    >
      <span className={`w-1 shrink-0 ${mine ? "bg-white/60" : "bg-rose-400"}`} aria-hidden />
      <div className="py-1.5 pr-2 min-w-0">
        <p className={`text-[11px] font-semibold truncate ${mine ? "text-white" : "text-rose-200"}`}>
          {reply.sender.name}
        </p>
        <p className={`text-xs truncate ${mine ? "text-white/85" : "text-white/75"}`}>
          {previewLine(reply)}
        </p>
      </div>
    </button>
  );
}

function ReactionChips({
  reactions,
  myId,
  onToggle,
}: {
  reactions: Reaction[];
  myId: string | undefined;
  onToggle: (emoji: string) => void;
}) {
  if (!reactions.length) return null;
  // Group by emoji
  const grouped = new Map<string, Reaction[]>();
  for (const r of reactions) {
    if (!grouped.has(r.emoji)) grouped.set(r.emoji, []);
    grouped.get(r.emoji)!.push(r);
  }
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Array.from(grouped.entries()).map(([emoji, list]) => {
        const mine = list.some((r) => r.userId === myId);
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(emoji);
            }}
            title={list.map((r) => r.userName).join(", ")}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs leading-none cursor-pointer transition-colors ${
              mine
                ? "bg-rose-500/30 text-rose-100 ring-1 ring-rose-400/40"
                : "bg-white/10 text-white/85 hover:bg-white/15"
            }`}
          >
            <span className="text-sm">{emoji}</span>
            <span className="text-[11px] font-medium">{list.length}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Composer ────────────────────────────────────────────────────────
// Owns the draft text locally so each keystroke re-renders just this pill —
// not the entire message list in ChatPage.
function Composer({
  textareaRef,
  replyTo,
  attachmentCount,
  hasReadyAttachment,
  sending,
  voiceOpen,
  stickerPickerOpen,
  onSend,
  onTyping,
  onAttach,
  onVoice,
  onStickerToggle,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  replyTo: ReplyPreview | null;
  attachmentCount: number;
  hasReadyAttachment: boolean;
  sending: boolean;
  voiceOpen: boolean;
  stickerPickerOpen: boolean;
  /** Kicks off the send; returns true when accepted (draft should clear). */
  onSend: (raw: string) => boolean;
  onTyping: () => void;
  onAttach: () => void;
  onVoice: () => void;
  onStickerToggle: () => void;
}) {
  const [text, setText] = useState("");

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [text, replyTo, textareaRef]);

  const trySend = () => {
    if (onSend(text)) setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      trySend();
    }
  };

  const canSend = (text.trim().length > 0 || hasReadyAttachment) && !sending;

  return (
    <div className="flex items-end gap-1 bg-white/[0.05] border border-white/10 rounded-[28px] pl-1.5 pr-1.5 py-1.5 focus-within:border-rose-400/50 focus-within:bg-white/[0.07] transition-colors">
      <motion.button
        type="button"
        onClick={onAttach}
        disabled={attachmentCount >= MAX_ATTACHMENTS || voiceOpen}
        aria-label="Attach images"
        whileTap={tapPress}
        className="flex items-center justify-center w-10 h-10 shrink-0 self-end rounded-full bg-rose-200/95 hover:bg-rose-100 active:bg-rose-200 disabled:opacity-40 disabled:cursor-not-allowed text-rose-950 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
      >
        <Camera className="w-5 h-5" aria-hidden />
      </motion.button>

      <label htmlFor="chat-input" className="sr-only">Message</label>
      <textarea
        id="chat-input"
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(e) => {
          const value = e.target.value.slice(0, 2000);
          setText(value);
          if (value.trim()) onTyping();
        }}
        onKeyDown={onKeyDown}
        placeholder={
          replyTo ? `Reply to ${replyTo.sender.name}...` : attachmentCount ? "Add a caption..." : "Message..."
        }
        className="flex-1 min-w-0 resize-none self-center bg-transparent border-0 px-2.5 py-2 text-base sm:text-[15px] leading-6 text-white placeholder-white/50 focus:outline-none max-h-40"
      />

      <motion.button
        type="button"
        onClick={onVoice}
        disabled={voiceOpen}
        aria-label="Record voice note"
        whileTap={tapPress}
        className="flex items-center justify-center w-9 h-9 shrink-0 self-end rounded-full text-white/75 hover:text-rose-300 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
      >
        <Mic className="w-5 h-5" aria-hidden />
      </motion.button>

      <motion.button
        type="button"
        data-sticker-trigger
        onClick={onStickerToggle}
        disabled={voiceOpen}
        aria-label="Open stickers"
        aria-expanded={stickerPickerOpen}
        whileTap={tapPress}
        className={`flex items-center justify-center w-9 h-9 shrink-0 self-end rounded-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-40 disabled:cursor-not-allowed ${
          stickerPickerOpen ? "bg-rose-500/25 text-rose-200" : "text-white/75 hover:text-rose-300 hover:bg-white/[0.06]"
        }`}
      >
        <Sparkles className="w-5 h-5" aria-hidden />
      </motion.button>

      <motion.button
        type="button"
        onClick={trySend}
        disabled={!canSend}
        aria-label="Send message"
        whileTap={tapPress}
        whileHover={canSend ? { scale: 1.04 } : undefined}
        className={`flex items-center justify-center w-10 h-10 shrink-0 self-end rounded-full transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
          canSend
            ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-700/30"
            : "text-white/55 hover:text-rose-300 hover:bg-white/[0.06] disabled:cursor-not-allowed"
        }`}
      >
        {sending ? (
          <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
        ) : (
          <Send className="w-[18px] h-[18px] -ml-0.5" aria-hidden />
        )}
      </motion.button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionFor, setActionFor] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const [presence, setPresence] = useState<Map<string, Presence>>(new Map());
  const [typing, setTyping] = useState<{ userId: string; userName: string; until: number } | null>(null);
  // Minute tick — value only forces re-renders for "X min ago" labels, so it
  // can start at 0 (Date.now() during render would be impure).
  const [now, setNow] = useState(0);
  const [wallpaper, setWallpaper] = useState<WallpaperId>(DEFAULT_WALLPAPER);
  const [wallpaperImage, setWallpaperImage] = useState<string | null>(null);
  const [wallpaperUploading, setWallpaperUploading] = useState(false);

  const isAdmin = session?.user?.role === "admin";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const myIdRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<Message[]>([]);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const autoStickRef = useRef(true);
  const bubbleRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [connected, setConnected] = useState(false);
  const lastTypingPingRef = useRef(0);
  const stoppedTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReadSentAtRef = useRef<string | null>(null);

  useEffect(() => {
    myIdRef.current = session?.user?.id;
  }, [session?.user?.id]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Re-render every minute to refresh "X min ago" labels
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Apply a resolved wallpaper (preset class or signed image URL) to state.
  const applyWallpaper = useCallback((w: ResolvedWallpaper) => {
    setWallpaper(isWallpaperId(w.preset) ? w.preset : DEFAULT_WALLPAPER);
    setWallpaperImage(w.imageUrl ?? null);
  }, []);

  // Load the shared chat wallpaper (admin-set, applies for everyone).
  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    fetch("/api/chat/wallpaper")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ResolvedWallpaper | null) => {
        if (alive && data) applyWallpaper(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [status, applyWallpaper]);

  // Admin-only: persist a preset (server enforces admin + broadcasts live).
  const changeWallpaper = useCallback(
    async (id: WallpaperId) => {
      const prev: ResolvedWallpaper = { preset: wallpaper, imageUrl: wallpaperImage };
      applyWallpaper({ preset: id, imageUrl: null }); // optimistic
      try {
        const res = await fetch("/api/chat/wallpaper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: id }),
        });
        if (!res.ok) throw new Error();
        applyWallpaper(await res.json());
        toast.show("Wallpaper updated 🖼️", "success");
      } catch {
        applyWallpaper(prev); // revert on failure
        toast.show("Couldn't update wallpaper", "error");
      }
    },
    [wallpaper, wallpaperImage, applyWallpaper, toast]
  );

  // Admin-only: upload a custom photo, then set it as the wallpaper.
  const uploadWallpaper = useCallback(
    async (file: File) => {
      setWallpaperUploading(true);
      try {
        // Same-origin upload — the server proxies the bytes to R2, so there's
        // no browser→R2 request and no R2 CORS to satisfy.
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/chat/wallpaper", { method: "POST", body: fd });
        if (!res.ok) {
          throw new Error((await res.json().catch(() => ({})))?.error || "Couldn't upload wallpaper");
        }
        applyWallpaper(await res.json());
        toast.show("Wallpaper updated 🖼️", "success");
      } catch (err) {
        toast.show(err instanceof Error && err.message ? err.message : "Couldn't upload wallpaper", "error");
      } finally {
        setWallpaperUploading(false);
      }
    },
    [applyWallpaper, toast]
  );

  // Close action menu on Esc + outside click handled by backdrop in the menu itself
  useEffect(() => {
    if (!actionFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionFor(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [actionFor]);

  // ── Load history ─────────────────────────────────────────────────
  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/chat");
        if (!res.ok) throw new Error();
        const data: Message[] = await res.json();
        if (!alive) return;
        setMessages(data);
        if (data.length < 100) {
          hasMoreRef.current = false;
          setHasMore(false);
        }
        setLoaded(true);
      } catch {
        if (alive) toast.show("Couldn't load chat", "error");
        setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [status, toast]);

  useEffect(() => {
    if (!loaded || initialScrollDoneRef.current || messages.length === 0) return;
    initialScrollDoneRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom(false)));
  }, [loaded, messages.length, scrollToBottom]);

  // ── Presence load + heartbeat ────────────────────────────────────
  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    fetch("/api/presence")
      .then((r) => r.ok ? r.json() : [])
      .then((users: { id: string; name: string; lastSeenAt: string | null; lastReadAt: string | null }[]) => {
        if (!alive) return;
        const map = new Map<string, Presence>();
        for (const u of users) map.set(u.id, { userId: u.id, name: u.name, lastSeenAt: u.lastSeenAt, lastReadAt: u.lastReadAt });
        setPresence(map);
      })
      .catch(() => {});
    // Initial heartbeat + interval
    const beat = () => {
      fetch("/api/presence", { method: "POST" }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [status]);

  // ── SSE: real-time events ────────────────────────────────────────
  useEffect(() => {
    if (status !== "authenticated" || !loaded) return;
    const es = new EventSource("/api/chat/stream");

    // EventSource auto-reconnects after a network drop, but anything
    // published while the socket was down is gone — on the reopen that
    // follows an error, fetch the gap since the newest confirmed message.
    let sawError = false;
    let disposed = false;
    let catchingUp = false;
    const catchUp = async () => {
      if (catchingUp) return; // one loop at a time
      catchingUp = true;
      try {
        for (let hasMore = true; hasMore && !disposed; ) {
          // Baseline: newest message the server actually confirmed (skip
          // optimistic pending/failed ones — their timestamps are local).
          let since: string | null = null;
          for (let i = messagesRef.current.length - 1; i >= 0; i--) {
            const m = messagesRef.current[i];
            if (!m.pending && !m.id.startsWith("tmp_")) { since = m.createdAt; break; }
          }
          if (!since) break; // nothing loaded yet — initial history fetch covers it
          const res = await fetch(`/api/chat?since=${encodeURIComponent(since)}`);
          if (!res.ok || disposed) break;
          const batch: Message[] = await res.json();
          hasMore = res.headers.get("X-Has-More") === "true"; // missing header ⇒ done
          if (batch.length === 0) break;
          setMessages((prev) => {
            const have = new Set(prev.map((x) => x.id));
            const fresh = batch.filter((x) => !have.has(x.id));
            if (!fresh.length) return prev;
            // Gap messages are all newer than `since`; the (stable) sort keeps
            // chronology even if a live SSE message landed mid-fetch.
            return [...prev, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          });
          if (autoStickRef.current) requestAnimationFrame(() => scrollToBottom());
        }
      } catch {/* transient — the next reconnect retries */}
      finally { catchingUp = false; }
    };

    es.onopen = () => {
      setConnected(true);
      if (sawError) {
        sawError = false;
        void catchUp();
      }
    };
    es.onerror = () => {
      setConnected(false);
      sawError = true;
    };

    es.addEventListener("message", (e) => {
      try {
        const m: Message = JSON.parse((e as MessageEvent).data);
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          if (m.sender.id === myIdRef.current) {
            for (let i = prev.length - 1; i >= 0; i--) {
              const x = prev[i];
              if (!x.pending) continue;
              // Prefer the exact clientId nonce (two attachment-only sends
              // both have text "" — the heuristic can't tell them apart);
              // fall back to it only for echoes without one.
              const matches = m.clientId
                ? x.clientId === m.clientId
                : x.sender.id === m.sender.id && x.text === m.text;
              if (matches) {
                const next = prev.slice();
                next[i] = m;
                return next;
              }
            }
          }
          return [...prev, m];
        });
        if (autoStickRef.current) requestAnimationFrame(() => scrollToBottom());
      } catch {/* ignore */}
    });

    es.addEventListener("delete", (e) => {
      try {
        const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
        setMessages((prev) => prev.filter((m) => m.id !== id));
      } catch {/* ignore */}
    });

    es.addEventListener("reaction", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as {
          messageId: string; userId: string; userName: string; emoji: string; action: "add" | "remove";
        };
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== ev.messageId) return m;
            const reactions = (m.reactions ?? []).slice();
            const idx = reactions.findIndex(
              (r) => r.userId === ev.userId && r.emoji === ev.emoji
            );
            if (ev.action === "remove") {
              if (idx !== -1) reactions.splice(idx, 1);
            } else if (idx === -1) {
              reactions.push({ userId: ev.userId, userName: ev.userName, emoji: ev.emoji });
            }
            return { ...m, reactions };
          })
        );
      } catch {/* ignore */}
    });

    es.addEventListener("read", (e) => {
      try {
        const { userId, lastReadAt } = JSON.parse((e as MessageEvent).data) as {
          userId: string; lastReadAt: string;
        };
        setPresence((prev) => {
          const next = new Map(prev);
          const existing = next.get(userId);
          next.set(userId, {
            userId,
            name: existing?.name ?? "",
            lastSeenAt: existing?.lastSeenAt ?? null,
            lastReadAt,
          });
          return next;
        });
      } catch {/* ignore */}
    });

    es.addEventListener("typing", (e) => {
      try {
        const { userId, userName, isTyping } = JSON.parse((e as MessageEvent).data) as {
          userId: string; userName: string; isTyping: boolean;
        };
        if (userId === myIdRef.current) return; // ignore self
        if (isTyping) {
          setTyping({ userId, userName, until: Date.now() + TYPING_HOLD_MS });
        } else {
          setTyping((t) => (t && t.userId === userId ? null : t));
        }
      } catch {/* ignore */}
    });

    es.addEventListener("presence", (e) => {
      try {
        const { userId, userName, lastSeenAt } = JSON.parse((e as MessageEvent).data) as {
          userId: string; userName: string; lastSeenAt: string;
        };
        setPresence((prev) => {
          const next = new Map(prev);
          const existing = next.get(userId);
          next.set(userId, {
            userId,
            name: userName || existing?.name || "",
            lastSeenAt,
            lastReadAt: existing?.lastReadAt ?? null,
          });
          return next;
        });
      } catch {/* ignore */}
    });

    // Live wallpaper sync — when the admin changes it, everyone's chat updates.
    es.addEventListener("wallpaper", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as ResolvedWallpaper;
        applyWallpaper(data);
      } catch {/* ignore */}
    });

    return () => {
      disposed = true;
      es.close();
      setConnected(false);
    };
  }, [status, loaded, scrollToBottom, applyWallpaper]);

  // Auto-clear typing indicator when its TTL passes. Always via a timeout —
  // even when already expired — so no setState runs synchronously in the
  // effect body.
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => setTyping(null), Math.max(0, typing.until - Date.now()));
    return () => clearTimeout(t);
  }, [typing]);

  // ── Read receipts: auto-mark when scrolled near bottom ───────────
  const markRead = useCallback(async () => {
    if (messagesRef.current.length === 0) return;
    const latest = messagesRef.current[messagesRef.current.length - 1];
    if (!latest) return;
    if (lastReadSentAtRef.current === latest.createdAt) return;
    lastReadSentAtRef.current = latest.createdAt;
    try {
      await fetch("/api/chat/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upToCreatedAt: latest.createdAt }),
      });
    } catch {/* ignore */}
  }, []);

  useEffect(() => {
    if (!loaded || messages.length === 0) return;
    // Only claim "read" when plausibly actually read: tab visible AND still
    // pinned to the bottom of the list (not scrolled up in history).
    if (document.visibilityState !== "visible" || !autoStickRef.current) return;
    markRead();
  }, [loaded, messages, markRead]);

  // Tab became visible while stuck to bottom → what's on screen counts as read.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && autoStickRef.current) markRead();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markRead]);

  // ── Scroll handlers ──────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const list = listRef.current;
    const prevScrollHeight = list?.scrollHeight ?? 0;
    const prevScrollTop = list?.scrollTop ?? 0;
    try {
      const res = await fetch(`/api/chat?before=${encodeURIComponent(oldest.createdAt)}`);
      if (!res.ok) throw new Error();
      const older: Message[] = await res.json();
      if (older.length === 0) {
        hasMoreRef.current = false;
        setHasMore(false);
      } else {
        setMessages((prev) => {
          const have = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !have.has(m.id)), ...prev];
        });
        requestAnimationFrame(() => {
          if (!list) return;
          list.scrollTop = list.scrollHeight - prevScrollHeight + prevScrollTop;
        });
        if (older.length < 100) {
          hasMoreRef.current = false;
          setHasMore(false);
        }
      }
    } catch {
      toast.show("Couldn't load older messages", "error");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [toast]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoStickRef.current = distanceFromBottom < 80;
    if (el.scrollTop < 120 && hasMoreRef.current && !loadingMoreRef.current) loadMore();
    if (autoStickRef.current) markRead();
  }, [loadMore, markRead]);

  // ── Typing broadcast ─────────────────────────────────────────────
  const pingTyping = useCallback((isTyping: boolean) => {
    fetch("/api/chat/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTyping }),
    }).catch(() => {});
  }, []);

  // Debounced "I'm typing" broadcast — the composer calls this per keystroke
  // (the draft text itself lives in <Composer/>; only the refs live here so
  // send() can cancel the pending "stopped typing" ping).
  const notifyTyping = useCallback(() => {
    const nowMs = Date.now();
    if (nowMs - lastTypingPingRef.current > TYPING_DEBOUNCE_MS) {
      lastTypingPingRef.current = nowMs;
      pingTyping(true);
    }
    if (stoppedTypingTimeoutRef.current) clearTimeout(stoppedTypingTimeoutRef.current);
    stoppedTypingTimeoutRef.current = setTimeout(() => {
      pingTyping(false);
      lastTypingPingRef.current = 0;
    }, 2_500);
  }, [pingTyping]);

  // ── Attachment upload ───────────────────────────────────────────
  // Every object URL we've minted that might still be on screen (composer
  // previews, pending/failed optimistic bubbles). The old `[]`-dep cleanup
  // closed over the initial empty `attachments` and revoked nothing — this
  // ref always holds the live set instead. The set-membership guard makes
  // revocation idempotent.
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const trackBlobUrl = useCallback((url: string) => {
    blobUrlsRef.current.add(url);
    return url;
  }, []);
  const revokeBlobUrls = useCallback((urls: Iterable<string>) => {
    for (const u of urls) {
      if (blobUrlsRef.current.delete(u)) URL.revokeObjectURL(u);
    }
  }, []);
  useEffect(() => {
    const urls = blobUrlsRef.current; // same Set instance for the whole life of the page
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  const uploadOne = useCallback(async (att: PendingAttachment) => {
    try {
      const sig = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: att.file.type, size: att.file.size }),
      });
      if (!sig.ok) {
        const j = await sig.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't presign upload");
      }
      const { url, key } = (await sig.json()) as { url: string; key: string };
      const put = await fetch(url, { method: "PUT", body: att.file, headers: { "Content-Type": att.file.type } });
      if (!put.ok) throw new Error("Upload failed");
      setAttachments((prev) => prev.map((a) => (a.id === att.id ? { ...a, status: "done", key } : a)));
    } catch (err) {
      setAttachments((prev) => prev.map((a) => (a.id === att.id ? { ...a, status: "error" } : a)));
      toast.show(err instanceof Error ? err.message : "Upload failed", "error");
    }
  }, [toast]);

  const onPickFiles = useCallback((files: FileList | null) => {
    if (!files || !files.length) return;
    const slots = MAX_ATTACHMENTS - attachments.length;
    if (slots <= 0) {
      toast.show(`Up to ${MAX_ATTACHMENTS} attachments per message`, "error");
      return;
    }
    const additions: PendingAttachment[] = [];
    for (const file of Array.from(files).slice(0, slots)) {
      if (!file.type.startsWith("image/")) {
        toast.show(`${file.name}: only images supported`, "error");
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.show(`${file.name}: max 10 MB`, "error");
        continue;
      }
      additions.push({
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: trackBlobUrl(URL.createObjectURL(file)),
        status: "uploading",
      });
    }
    if (!additions.length) return;
    setAttachments((prev) => [...prev, ...additions]);
    additions.forEach(uploadOne);
  }, [attachments.length, uploadOne, toast, trackBlobUrl]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) revokeBlobUrls([target.previewUrl]);
      return prev.filter((a) => a.id !== id);
    });
  }, [revokeBlobUrls]);

  // ── Voice notes: upload helper ──────────────────────────────────
  const sendVoiceNote = useCallback(async (blob: Blob, mime: string) => {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const clientId = newClientId();
    // Local preview so the pending bubble isn't empty. The #fragment gives
    // the blob URL an audio "extension" so isAudioUrl() routes it to
    // AudioBubble; browsers ignore fragments when resolving blob: URLs.
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const bareUrl = trackBlobUrl(URL.createObjectURL(blob));
    const optimistic: Message = {
      id: tempId,
      clientId,
      text: "",
      createdAt: new Date().toISOString(),
      sender: { id: session?.user?.id || "me", name: session?.user?.name || "You" },
      attachments: [`${bareUrl}#voice.${ext}`],
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    autoStickRef.current = true;
    requestAnimationFrame(() => scrollToBottom());
    try {
      const sig = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: mime, size: blob.size }),
      });
      if (!sig.ok) {
        const j = await sig.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't presign");
      }
      const { url, key } = (await sig.json()) as { url: string; key: string };
      const put = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": mime } });
      if (!put.ok) throw new Error("Upload failed");
      // Now POST as a chat message with this single attachment
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "", attachments: [key], clientId }),
      });
      if (!res.ok) throw new Error();
      const saved: Message = await res.json();
      setMessages((prev) => {
        if (prev.some((m) => m.id === saved.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? saved : m));
      });
      revokeBlobUrls([bareUrl]); // delivered bubble streams the signed URL now
    } catch (err) {
      // Mark failed (don't strand a "Sending…" bubble). Keep the blob URL —
      // the failed bubble's player still uses it; it's swept on unmount.
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
      );
      toast.show(err instanceof Error ? err.message : "Voice note failed", "error");
    }
  }, [session, scrollToBottom, toast, trackBlobUrl, revokeBlobUrls]);

  // ── Send + sticker ───────────────────────────────────────────────
  // Returns true when the send was actually kicked off — the composer only
  // clears its draft in that case (guards run synchronously up front).
  const send = useCallback((rawText: string): boolean => {
    const trimmed = rawText.trim();
    const ready = attachments.filter((a) => a.status === "done" && a.key).map((a) => a.key as string);
    const stillUploading = attachments.some((a) => a.status === "uploading");
    if (!trimmed && ready.length === 0) return false;
    if (sending) return false;
    if (stillUploading) {
      toast.show("Hold on — attachments are still uploading", "error");
      return false;
    }
    setSending(true);
    pingTyping(false);
    lastTypingPingRef.current = 0;
    if (stoppedTypingTimeoutRef.current) clearTimeout(stoppedTypingTimeoutRef.current);

    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const clientId = newClientId();
    const replyToSnapshot = replyTo;
    const optimistic: Message = {
      id: tempId,
      clientId,
      text: trimmed,
      createdAt: new Date().toISOString(),
      sender: { id: session?.user?.id || "me", name: session?.user?.name || "You" },
      attachments: attachments.filter((a) => a.status === "done").map((a) => a.previewUrl),
      replyTo: replyToSnapshot,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    const blobsToRevoke = attachments.map((a) => a.previewUrl);
    setAttachments([]);
    setReplyTo(null);
    autoStickRef.current = true;
    requestAnimationFrame(() => scrollToBottom());

    void (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: trimmed,
            attachments: ready,
            replyToId: replyToSnapshot?.id,
            clientId,
          }),
        });
        if (!res.ok) throw new Error();
        const saved: Message = await res.json();
        setMessages((prev) => {
          if (prev.some((m) => m.id === saved.id)) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => (m.id === tempId ? saved : m));
        });
        revokeBlobUrls(blobsToRevoke);
      } catch {
        // Don't revoke here — the failed bubble still shows these previews.
        // They stay tracked in blobUrlsRef and get swept on unmount.
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
        );
        toast.show("Message didn't send", "error");
      } finally {
        setSending(false);
        textareaRef.current?.focus();
      }
    })();
    return true;
  }, [attachments, sending, session, scrollToBottom, toast, replyTo, pingTyping, revokeBlobUrls]);

  // Resolve a sticker key to a displayable signed URL (best-effort) by
  // re-listing the packs — the picker's onSelect only hands us the R2 key.
  const resolveStickerUrl = useCallback(async (key: string): Promise<string | null> => {
    const hit = stickerUrlCache.get(key);
    if (hit) return hit;
    try {
      const res = await fetch("/api/stickers");
      if (!res.ok) return null;
      const packs = (await res.json()) as { stickers: { key: string; url: string }[] }[];
      for (const p of packs) for (const s of p.stickers) stickerUrlCache.set(s.key, s.url);
      return stickerUrlCache.get(key) ?? null;
    } catch {
      return null;
    }
  }, []);

  const sendSticker = useCallback(async (key: string) => {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const clientId = newClientId();
    const cachedUrl = stickerUrlCache.get(key);
    const optimistic: Message = {
      id: tempId,
      clientId,
      text: "",
      createdAt: new Date().toISOString(),
      sender: { id: session?.user?.id || "me", name: session?.user?.name || "You" },
      attachments: cachedUrl ? [cachedUrl] : [],
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    autoStickRef.current = true;
    requestAnimationFrame(() => scrollToBottom());
    if (!cachedUrl) {
      // Fill the pending bubble with the sticker itself once its signed URL
      // resolves. If the real message already replaced tempId, this no-ops.
      void resolveStickerUrl(key).then((url) => {
        if (!url) return;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, attachments: [url] } : m)));
      });
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "", attachments: [key], clientId }),
      });
      if (!res.ok) throw new Error();
      const saved: Message = await res.json();
      setMessages((prev) => {
        if (prev.some((m) => m.id === saved.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? saved : m));
      });
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      toast.show("Sticker didn't send", "error");
    }
  }, [session, scrollToBottom, toast, resolveStickerUrl]);

  // ── Reactions / reply / delete via action menu ───────────────────
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const userId = myIdRef.current ?? "";
    const userName = session?.user?.name ?? "You";
    // Optimistic toggle
    setMessages((prev) => withReactionToggled(prev, messageId, emoji, userId, userName));
    try {
      const res = await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Toggle is its own inverse — re-apply to revert just this reaction,
      // leaving everything that arrived meanwhile intact.
      setMessages((prev) => withReactionToggled(prev, messageId, emoji, userId, userName));
      toast.show("Reaction failed", "error");
    }
  }, [session, toast]);

  const deleteMessage = useCallback(async (id: string) => {
    const removed = messagesRef.current.find((x) => x.id === id);
    setMessages((m) => m.filter((x) => x.id !== id));
    try {
      const res = await fetch("/api/chat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Re-insert only the removed message (in createdAt order) — restoring a
      // whole snapshot would clobber anything that arrived since.
      if (removed) {
        setMessages((prev) => {
          if (prev.some((x) => x.id === id)) return prev;
          const at = prev.findIndex((x) => x.createdAt > removed.createdAt);
          const next = prev.slice();
          next.splice(at === -1 ? next.length : at, 0, removed);
          return next;
        });
      }
      toast.show("Couldn't delete message", "error");
    }
  }, [toast]);

  const onBubbleClick = useCallback((id: string, el: HTMLElement) => {
    setActionFor({ id, rect: el.getBoundingClientRect() });
  }, []);

  // ── Group + render ───────────────────────────────────────────────
  const grouped = useMemo(() => {
    const g: Array<{ key: string; label: string; items: Message[] }> = [];
    for (const m of messages) {
      const key = m.createdAt.slice(0, 10);
      const last = g[g.length - 1];
      if (last && last.key === key) last.items.push(m);
      else g.push({ key, label: dayLabel(m.createdAt), items: [m] });
    }
    return g;
  }, [messages]);

  // Determine the partner's lastReadAt — for read ticks on own messages.
  const myId = session?.user?.id;
  const partnerPresence = useMemo(() => {
    for (const p of presence.values()) {
      if (p.userId !== myId) return p;
    }
    return null;
  }, [presence, myId]);
  void now; // keep `now` referenced so the minute-tick re-renders presence labels

  if (status === "loading" || status === "unauthenticated") {
    return <LoadingScreen message="Connecting" />;
  }

  const subtitle = (() => {
    if (typing && typing.userId !== myId) return `${typing.userName} is typing…`;
    if (!partnerPresence?.lastSeenAt) return connected ? "Live · messages between us" : "Reconnecting…";
    return lastSeenLabel(partnerPresence.lastSeenAt);
  })();

  const actionMessage = actionFor ? messages.find((m) => m.id === actionFor.id) ?? null : null;
  const myReactionEmojisOnAction =
    actionMessage?.reactions?.filter((r) => r.userId === myId).map((r) => r.emoji) ?? [];

  return (
    <div
      className={`h-[100dvh] bg-[#0a0305] text-white relative flex flex-col overflow-hidden ${
        wallpaperImage ? "" : wallpaperClass(wallpaper)
      }`}
      style={
        wallpaperImage
          ? {
              // Dark scrim composited over the photo keeps bubbles/text readable.
              backgroundImage: `linear-gradient(rgba(10,3,5,0.55), rgba(10,3,5,0.55)), url("${wallpaperImage}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {wallpaper === "default" && !wallpaperImage && <div className="aurora" aria-hidden />}
      <AppHeader
        variant="page"
        title="Chat 💬"
        subtitle={subtitle}
        actions={
          isAdmin ? (
            <ChatWallpaperPicker
              preset={wallpaper}
              imageUrl={wallpaperImage}
              uploading={wallpaperUploading}
              onSelectPreset={changeWallpaper}
              onUploadImage={uploadWallpaper}
            />
          ) : undefined
        }
      />

      {/* Messages list */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 pt-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        <div className="max-w-2xl mx-auto flex flex-col gap-2 min-h-full">
          <div className="flex-1" aria-hidden />

          {!loaded && (
            <div className="flex justify-center py-8">
              <span className="w-6 h-6 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit" aria-hidden />
            </div>
          )}

          {loaded && messages.length > 0 && (
            <div className="flex justify-center py-3" aria-live="polite">
              {loadingMore ? (
                <span className="w-5 h-5 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit" aria-label="Loading older messages" />
              ) : !hasMore ? (
                <span className="text-[11px] text-white/40 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10">
                  Beginning of chat ✨
                </span>
              ) : (
                <button
                  type="button"
                  onClick={loadMore}
                  className="text-[11px] text-white/55 hover:text-rose-300 px-3 py-1 rounded-full bg-white/[0.04] hover:bg-rose-500/10 border border-white/10 transition-colors cursor-pointer"
                >
                  Load older messages
                </button>
              )}
            </div>
          )}

          {loaded && messages.length === 0 && (
            <div className="flex flex-col items-center text-center py-16 gap-3 animate-fade-up">
              <Heart className="w-10 h-10 text-rose-400/70 fill-rose-400/30 animate-heart-beat" aria-hidden />
              <p className="text-white/75 text-sm">No messages yet</p>
              <p className="text-white/50 text-xs max-w-xs">
                Say something sweet — your partner will get a notification when it lands.
              </p>
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.key} className="flex flex-col gap-1.5 cv-auto">
              <div className="sticky top-0 z-10 self-center px-3 py-1 my-1 rounded-full bg-[#0a0305]/80 backdrop-blur border border-white/10 text-[11px] text-white/60 uppercase tracking-wider">
                {group.label}
              </div>
              {/* Rows are deliberately not memo()-ized: AnimatePresence
                  popLayout tracks child identity for exit/layout animations
                  and memo wrappers risk breaking them. Extracting <Composer/>
                  already keeps keystrokes from re-rendering this list. */}
              <AnimatePresence initial={false} mode="popLayout">
                {group.items.map((m, i) => {
                  const mine = m.sender.id === myId;
                  const prev = group.items[i - 1];
                  const next = group.items[i + 1];
                  const groupTop = !prev || prev.sender.id !== m.sender.id;
                  const groupBottom = !next || next.sender.id !== m.sender.id;
                  const showName = !mine && groupTop;

                  const onlyAttachment = m.attachments?.length === 1 ? m.attachments[0] : null;
                  const isStickerOnly = !m.text && onlyAttachment ? isStickerUrl(onlyAttachment) : false;
                  const isAudioOnly = !m.text && onlyAttachment ? isAudioUrl(onlyAttachment) : false;
                  const imageAttachments = (m.attachments ?? []).filter(
                    (u) => !isStickerUrl(u) && !isAudioUrl(u)
                  );

                  // Read tick: own + delivered + partner has read
                  const isReadByPartner =
                    mine &&
                    !m.pending &&
                    !m.failed &&
                    !m.id.startsWith("tmp_") &&
                    !!partnerPresence?.lastReadAt &&
                    new Date(partnerPresence.lastReadAt).getTime() >= new Date(m.createdAt).getTime();

                  const setRef = (el: HTMLElement | null) => {
                    if (el) bubbleRefs.current.set(m.id, el);
                    else bubbleRefs.current.delete(m.id);
                  };

                  const jumpToReply = () => {
                    if (!m.replyTo) return;
                    const target = bubbleRefs.current.get(m.replyTo.id);
                    if (target) {
                      target.scrollIntoView({ behavior: "smooth", block: "center" });
                      target.classList.add("ring-2", "ring-rose-300/70");
                      setTimeout(() => target.classList.remove("ring-2", "ring-rose-300/70"), 1200);
                    }
                  };

                  return (
                    <motion.div
                      key={m.id}
                      layout="position"
                      custom={mine}
                      variants={chatBubble}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`group max-w-[78%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                        {showName && (
                          <span className="text-[11px] text-rose-300/80 font-medium px-1 mb-0.5">
                            {m.sender.name}
                          </span>
                        )}

                        <div
                          ref={setRef}
                          className="transition-shadow rounded-2xl"
                        >
                          {(() => {
                            // Bubble interaction wired on a <div> rather than
                            // a <button> because the bubble can contain nested
                            // buttons (image previews, reply-quote, etc.) — and
                            // <button> inside <button> is invalid HTML.
                            const interactive =
                              !m.pending && !m.failed && !m.id.startsWith("tmp_");

                            const handleOpen = (e: React.MouseEvent | React.KeyboardEvent) => {
                              e.stopPropagation();
                              if (!interactive) return;
                              const target = e.currentTarget as HTMLElement;
                              onBubbleClick(m.id, target);
                            };

                            const a11y = interactive
                              ? {
                                  role: "button" as const,
                                  tabIndex: 0,
                                  onClick: handleOpen,
                                  onKeyDown: (e: React.KeyboardEvent) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      handleOpen(e);
                                    }
                                  },
                                }
                              : {};

                            // Sticker-only: bare sticker, no bubble
                            if (isStickerOnly && onlyAttachment) {
                              return (
                                <div
                                  data-msg-bubble
                                  {...a11y}
                                  className={`p-1 rounded-2xl ${interactive ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300" : ""} ${
                                    m.pending ? "opacity-70" : ""
                                  } ${m.failed ? "ring-2 ring-red-400/60" : ""}`}
                                >
                                  <StickerBubble url={onlyAttachment} />
                                </div>
                              );
                            }

                            // Audio-only: voice note bubble
                            if (isAudioOnly && onlyAttachment) {
                              return (
                                <div
                                  data-msg-bubble
                                  {...a11y}
                                  className={`text-left px-3 py-2.5 shadow-md ${interactive ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300" : ""} ${
                                    mine
                                      ? `bg-gradient-to-br from-rose-600 to-pink-600 text-white shadow-rose-700/30 ${
                                          groupTop ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-r-md"
                                        } ${groupBottom ? "rounded-br-2xl" : "rounded-br-md"}`
                                      : `bg-white/[0.07] text-white border border-white/10 ${
                                          groupTop ? "rounded-2xl rounded-bl-md" : "rounded-2xl rounded-l-md"
                                        } ${groupBottom ? "rounded-bl-2xl" : "rounded-bl-md"}`
                                  } ${m.pending ? "opacity-70" : ""} ${m.failed ? "ring-2 ring-red-400/60" : ""}`}
                                >
                                  <AudioBubble url={onlyAttachment} mine={mine} />
                                </div>
                              );
                            }

                            // Text/photo bubble (with optional reply quote + media embed)
                            return (
                              <div
                                data-msg-bubble
                                {...a11y}
                                className={`text-left px-3.5 py-2 text-sm leading-relaxed break-words shadow-md ${interactive ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300" : ""} ${
                                  mine
                                    ? `bg-gradient-to-br from-rose-600 to-pink-600 text-white shadow-rose-700/30 ${
                                        groupTop ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-r-md"
                                      } ${groupBottom ? "rounded-br-2xl" : "rounded-br-md"}`
                                    : `bg-white/[0.07] text-white border border-white/10 ${
                                        groupTop ? "rounded-2xl rounded-bl-md" : "rounded-2xl rounded-l-md"
                                      } ${groupBottom ? "rounded-bl-2xl" : "rounded-bl-md"}`
                                } ${m.pending ? "opacity-70" : ""} ${m.failed ? "ring-2 ring-red-400/60" : ""}`}
                              >
                                {m.replyTo && (
                                  <ReplyQuote reply={m.replyTo} mine={mine} onJump={jumpToReply} />
                                )}
                                {imageAttachments.length > 0 && (
                                  <AttachmentGrid urls={imageAttachments} />
                                )}
                                {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                                {m.text && detectMediaLink(m.text) && <MediaLinkEmbed text={m.text} />}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Reactions chips */}
                        <ReactionChips
                          reactions={m.reactions ?? []}
                          myId={myId}
                          onToggle={(emoji) => toggleReaction(m.id, emoji)}
                        />

                        {/* Footer: time + status */}
                        {groupBottom && (
                          <span className={`text-[10px] text-white/40 px-1 mt-0.5 flex items-center gap-1 ${m.failed ? "text-red-300" : ""}`}>
                            {m.failed ? (
                              "Failed to send"
                            ) : m.pending ? (
                              "Sending…"
                            ) : (
                              <>
                                {fmtTime(m.createdAt)}
                                {mine && (
                                  <span aria-label={isReadByPartner ? "Read" : "Sent"}>
                                    {isReadByPartner ? (
                                      // Double-tick rose
                                      <svg viewBox="0 0 22 14" fill="none" stroke="currentColor" className="w-3.5 h-3.5 text-rose-300" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <polyline points="2 7 6 11 14 3" />
                                        <polyline points="9 11 17 3" />
                                      </svg>
                                    ) : (
                                      // Single tick
                                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" className="w-3.5 h-3.5 text-white/40" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <polyline points="2 7 6 11 12 3" />
                                      </svg>
                                    )}
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* Action menu popover */}
      <MessageActions
        open={!!actionFor && !!actionMessage}
        anchor={actionFor?.rect ?? null}
        canDelete={!!actionMessage && actionMessage.sender.id === myId}
        myReactions={myReactionEmojisOnAction}
        onReact={(emoji) => {
          if (actionFor) toggleReaction(actionFor.id, emoji);
          setActionFor(null);
        }}
        onReply={() => {
          if (actionMessage) {
            setReplyTo({
              id: actionMessage.id,
              text: actionMessage.text,
              sender: actionMessage.sender,
              attachments: actionMessage.attachments ?? [],
            });
            textareaRef.current?.focus();
          }
          setActionFor(null);
        }}
        onCopy={
          actionMessage?.text
            ? () => {
                navigator.clipboard.writeText(actionMessage.text).catch(() => {});
                toast.show("Copied", "success");
                setActionFor(null);
              }
            : undefined
        }
        onDelete={
          actionMessage && actionMessage.sender.id === myId
            ? () => {
                if (actionFor) deleteMessage(actionFor.id);
                setActionFor(null);
              }
            : undefined
        }
        onClose={() => setActionFor(null)}
      />

      {/* Composer */}
      <div className="relative border-t border-white/10 bg-[#0a0305]/85 backdrop-blur-md" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* Typing indicator */}
        <AnimatePresence>
          {typing && typing.userId !== myId && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden border-b border-white/5"
            >
              <div className="max-w-2xl mx-auto px-4 py-1.5 flex items-center gap-2 text-xs text-rose-300/85">
                <span className="flex gap-0.5" aria-hidden>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" style={{ animationDelay: "300ms" }} />
                </span>
                {typing.userName} is typing…
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <StickerPicker
          open={stickerPickerOpen}
          onClose={() => setStickerPickerOpen(false)}
          onSelect={(key) => sendSticker(key)}
        />

        <VoiceRecorder
          open={voiceOpen}
          onClose={() => setVoiceOpen(false)}
          onRecorded={(blob, mime) => sendVoiceNote(blob, mime)}
        />

        {/* Reply preview */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden border-b border-white/5"
            >
              <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2">
                <div className="w-1 h-10 rounded-full bg-rose-400 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-rose-300 font-semibold truncate">
                    Replying to {replyTo.sender.name}
                  </p>
                  <p className="text-xs text-white/65 truncate">{previewLine(replyTo)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                  className="flex items-center justify-center w-9 h-9 rounded-full text-white/65 hover:bg-white/5 cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pending attachments */}
        <AnimatePresence initial={false}>
          {attachments.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-b border-white/5"
            >
              <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2 flex gap-2 overflow-x-auto">
                {attachments.map((a) => (
                  <div key={a.id} className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-white/5 border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.previewUrl} alt="preview" className={`w-full h-full object-cover ${a.status === "uploading" ? "opacity-50" : ""}`} />
                    {a.status === "uploading" && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="w-5 h-5 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit" aria-label="Uploading" />
                      </div>
                    )}
                    {a.status === "error" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-red-500/30 text-red-100 text-[10px] font-medium">
                        Failed
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label="Remove attachment"
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/90 cursor-pointer"
                    >
                      <X className="w-3 h-3" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-2xl mx-auto px-2 sm:px-3 py-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
            multiple
            onChange={(e) => {
              onPickFiles(e.target.files);
              e.currentTarget.value = "";
            }}
            className="hidden"
            aria-hidden
          />

          <Composer
            textareaRef={textareaRef}
            replyTo={replyTo}
            attachmentCount={attachments.length}
            hasReadyAttachment={attachments.some((a) => a.status === "done")}
            sending={sending}
            voiceOpen={voiceOpen}
            stickerPickerOpen={stickerPickerOpen}
            onSend={send}
            onTyping={notifyTyping}
            onAttach={() => fileInputRef.current?.click()}
            onVoice={() => setVoiceOpen(true)}
            onStickerToggle={() => setStickerPickerOpen((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
}
