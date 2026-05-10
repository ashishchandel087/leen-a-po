"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppHeader from "../components/AppHeader";
import LoadingScreen from "../components/LoadingScreen";
import { useToast } from "../components/Toast";
import { Send, Heart, ImagePlus, X, Sparkles } from "../components/Icons";
import { motion, AnimatePresence, chatBubble, tapPress } from "../components/motion";
import StickerPicker from "../components/StickerPicker";
import StickerMedia from "../components/StickerMedia";
import MessageActions from "../components/MessageActions";
import MediaLinkEmbed, { detectMediaLink } from "../components/MediaLinkEmbed";
import VoiceRecorder from "../components/VoiceRecorder";
import AudioBubble from "../components/AudioBubble";

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

// ── Page ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
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
  const [now, setNow] = useState(Date.now()); // re-render every minute for "X min ago"

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

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [text, replyTo]);

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
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("message", (e) => {
      try {
        const m: Message = JSON.parse((e as MessageEvent).data);
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          if (m.sender.id === myIdRef.current) {
            for (let i = prev.length - 1; i >= 0; i--) {
              const x = prev[i];
              if (x.pending && x.sender.id === m.sender.id && x.text === m.text) {
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

    return () => {
      es.close();
      setConnected(false);
    };
  }, [status, loaded, scrollToBottom]);

  // Auto-clear typing indicator when its TTL passes
  useEffect(() => {
    if (!typing) return;
    const remaining = typing.until - Date.now();
    if (remaining <= 0) {
      setTyping(null);
      return;
    }
    const t = setTimeout(() => setTyping(null), remaining);
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
    if (loaded && messages.length > 0) markRead();
  }, [loaded, messages, markRead]);

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

  const onTextChange = useCallback((value: string) => {
    setText(value.slice(0, 2000));
    if (value.trim()) {
      const now = Date.now();
      if (now - lastTypingPingRef.current > TYPING_DEBOUNCE_MS) {
        lastTypingPingRef.current = now;
        pingTyping(true);
      }
      if (stoppedTypingTimeoutRef.current) clearTimeout(stoppedTypingTimeoutRef.current);
      stoppedTypingTimeoutRef.current = setTimeout(() => {
        pingTyping(false);
        lastTypingPingRef.current = 0;
      }, 2_500);
    }
  }, [pingTyping]);

  // ── Attachment upload ───────────────────────────────────────────
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
        previewUrl: URL.createObjectURL(file),
        status: "uploading",
      });
    }
    if (!additions.length) return;
    setAttachments((prev) => [...prev, ...additions]);
    additions.forEach(uploadOne);
  }, [attachments.length, uploadOne, toast]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  useEffect(() => {
    return () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Voice notes: upload helper ──────────────────────────────────
  const sendVoiceNote = useCallback(async (blob: Blob, mime: string) => {
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
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const optimistic: Message = {
        id: tempId,
        text: "",
        createdAt: new Date().toISOString(),
        sender: { id: session?.user?.id || "me", name: session?.user?.name || "You" },
        attachments: [],
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      autoStickRef.current = true;
      requestAnimationFrame(() => scrollToBottom());

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "", attachments: [key] }),
      });
      if (!res.ok) throw new Error();
      const saved: Message = await res.json();
      setMessages((prev) => {
        if (prev.some((m) => m.id === saved.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? saved : m));
      });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Voice note failed", "error");
    }
  }, [session, scrollToBottom, toast]);

  // ── Send + sticker ───────────────────────────────────────────────
  const send = useCallback(async () => {
    const trimmed = text.trim();
    const ready = attachments.filter((a) => a.status === "done" && a.key).map((a) => a.key as string);
    const stillUploading = attachments.some((a) => a.status === "uploading");
    if (!trimmed && ready.length === 0) return;
    if (sending) return;
    if (stillUploading) {
      toast.show("Hold on — attachments are still uploading", "error");
      return;
    }
    setSending(true);
    pingTyping(false);
    lastTypingPingRef.current = 0;
    if (stoppedTypingTimeoutRef.current) clearTimeout(stoppedTypingTimeoutRef.current);

    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const replyToSnapshot = replyTo;
    const optimistic: Message = {
      id: tempId,
      text: trimmed,
      createdAt: new Date().toISOString(),
      sender: { id: session?.user?.id || "me", name: session?.user?.name || "You" },
      attachments: attachments.filter((a) => a.status === "done").map((a) => a.previewUrl),
      replyTo: replyToSnapshot,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    const blobsToRevoke = attachments.map((a) => a.previewUrl);
    setAttachments([]);
    setReplyTo(null);
    autoStickRef.current = true;
    requestAnimationFrame(() => scrollToBottom());

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          attachments: ready,
          replyToId: replyToSnapshot?.id,
        }),
      });
      if (!res.ok) throw new Error();
      const saved: Message = await res.json();
      setMessages((prev) => {
        if (prev.some((m) => m.id === saved.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? saved : m));
      });
      blobsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
      );
      toast.show("Message didn't send", "error");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [text, attachments, sending, session, scrollToBottom, toast, replyTo, pingTyping]);

  const sendSticker = useCallback(async (key: string) => {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: tempId,
      text: "",
      createdAt: new Date().toISOString(),
      sender: { id: session?.user?.id || "me", name: session?.user?.name || "You" },
      attachments: [],
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    autoStickRef.current = true;
    requestAnimationFrame(() => scrollToBottom());
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "", attachments: [key] }),
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
  }, [session, scrollToBottom, toast]);

  // ── Reactions / reply / delete via action menu ───────────────────
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    // Optimistic toggle
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = (m.reactions ?? []).slice();
        const idx = reactions.findIndex(
          (r) => r.userId === myIdRef.current && r.emoji === emoji
        );
        if (idx === -1) {
          reactions.push({
            userId: myIdRef.current ?? "",
            userName: session?.user?.name ?? "You",
            emoji,
          });
        } else {
          reactions.splice(idx, 1);
        }
        return { ...m, reactions };
      })
    );
    try {
      const res = await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.show("Reaction failed", "error");
    }
  }, [session, toast]);

  const deleteMessage = useCallback(async (id: string) => {
    const prev = messagesRef.current;
    setMessages((m) => m.filter((x) => x.id !== id));
    try {
      const res = await fetch("/api/chat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMessages(prev);
      toast.show("Couldn't delete message", "error");
    }
  }, [toast]);

  const onBubbleClick = useCallback((id: string, el: HTMLElement) => {
    setActionFor({ id, rect: el.getBoundingClientRect() });
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }, [send]);

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
    <div className="h-[100dvh] bg-[#0a0305] text-white relative flex flex-col overflow-hidden">
      <div className="aurora" aria-hidden />
      <AppHeader variant="page" title="Chat 💬" subtitle={subtitle} />

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
            <div key={group.key} className="flex flex-col gap-1.5">
              <div className="sticky top-0 z-10 self-center px-3 py-1 my-1 rounded-full bg-[#0a0305]/80 backdrop-blur border border-white/10 text-[11px] text-white/60 uppercase tracking-wider">
                {group.label}
              </div>
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

        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 flex items-end gap-2">
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

          <motion.button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS || voiceOpen}
            aria-label="Attach images"
            whileTap={tapPress}
            className="flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed text-white/75 hover:text-rose-300 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <ImagePlus className="w-5 h-5" aria-hidden />
          </motion.button>

          <motion.button
            type="button"
            data-sticker-trigger
            onClick={() => setStickerPickerOpen((v) => !v)}
            disabled={voiceOpen}
            aria-label="Open stickers"
            aria-expanded={stickerPickerOpen}
            whileTap={tapPress}
            className={`flex items-center justify-center w-11 h-11 shrink-0 rounded-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-40 disabled:cursor-not-allowed ${
              stickerPickerOpen ? "bg-rose-500/25 text-rose-200" : "bg-white/[0.06] hover:bg-white/[0.10] text-white/75 hover:text-rose-300"
            }`}
          >
            <Sparkles className="w-5 h-5" aria-hidden />
          </motion.button>

          <motion.button
            type="button"
            onClick={() => setVoiceOpen(true)}
            disabled={voiceOpen}
            aria-label="Record voice note"
            whileTap={tapPress}
            className="flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed text-white/75 hover:text-rose-300 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </motion.button>

          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input"
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              replyTo ? `Reply to ${replyTo.sender.name}...` : attachments.length ? "Add a caption..." : "Say something sweet..."
            }
            className="flex-1 resize-none bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/45 focus:outline-none focus:border-rose-400 focus:bg-white/[0.09] transition-colors max-h-40"
          />

          <motion.button
            type="button"
            onClick={send}
            disabled={(!text.trim() && attachments.filter((a) => a.status === "done").length === 0) || sending}
            aria-label="Send message"
            whileTap={tapPress}
            whileHover={{ scale: 1.04 }}
            className="flex items-center justify-center w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white cursor-pointer shadow-lg shadow-rose-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            {sending ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
            ) : (
              <Send className="w-5 h-5 -ml-0.5" aria-hidden />
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
