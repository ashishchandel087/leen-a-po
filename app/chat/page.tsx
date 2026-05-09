"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppHeader from "../components/AppHeader";
import LoadingScreen from "../components/LoadingScreen";
import { useToast } from "../components/Toast";
import { Send, Trash, Heart } from "../components/Icons";
import { motion, AnimatePresence, chatBubble, tapPress } from "../components/motion";

interface Message {
  id: string;
  text: string;
  createdAt: string;
  sender: { id: string; name: string };
  // Optimistic local flag
  pending?: boolean;
  failed?: boolean;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoStickRef = useRef(true); // stay pinned to bottom unless user scrolled up
  const myIdRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<Message[]>([]);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    myIdRef.current = session?.user?.id;
  }, [session?.user?.id]);

  // Keep a ref in sync with messages so callbacks can read fresh state
  // without being recreated on every change.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [text]);

  // Tap outside any bubble → deselect. Also Escape key.
  useEffect(() => {
    if (!selectedId) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest("[data-msg-bubble]")) setSelectedId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [selectedId]);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Load older messages (called when user scrolls near the top).
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return; // nothing to page from yet

    loadingMoreRef.current = true;
    setLoadingMore(true);

    // Snapshot scroll metrics so we can preserve the user's visual position
    // after we prepend older messages.
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
          // Dedupe just in case any id overlaps.
          const have = new Set(prev.map((m) => m.id));
          const fresh = older.filter((m) => !have.has(m.id));
          return [...fresh, ...prev];
        });
        // After paint, restore the relative scroll offset so the user
        // sees the same message they were looking at — no jump.
        requestAnimationFrame(() => {
          if (!list) return;
          const newScrollHeight = list.scrollHeight;
          list.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
        });
        // If we got fewer than the page size, no more history exists.
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

  // Track whether user is scrolled near the bottom; if so, keep pinning new msgs.
  // Also kick off loadMore when the user nears the top.
  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoStickRef.current = distanceFromBottom < 80;
    if (el.scrollTop < 120 && hasMoreRef.current && !loadingMoreRef.current) {
      loadMore();
    }
  }, [loadMore]);

  // Initial history load
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
        // If the very first page didn't fill the 100-row window, no older
        // history exists — don't bother trying to paginate.
        if (data.length < 100) {
          hasMoreRef.current = false;
          setHasMore(false);
        }
        setLoaded(true);
        requestAnimationFrame(() => scrollToBottom(false));
      } catch {
        if (alive) toast.show("Couldn't load chat", "error");
        setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [status, scrollToBottom, toast]);

  // Real-time subscription via Server-Sent Events. EventSource auto-reconnects
  // with exponential backoff on transient drops, so we don't need our own retry loop.
  useEffect(() => {
    if (status !== "authenticated" || !loaded) return;

    const es = new EventSource("/api/chat/stream");

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // browser will auto-reconnect

    es.addEventListener("message", (e) => {
      try {
        const m: Message = JSON.parse((e as MessageEvent).data);
        setMessages((prev) => {
          // Already have this id? skip.
          if (prev.some((x) => x.id === m.id)) return prev;

          // Our own message arriving via SSE before the POST resolved —
          // replace the matching pending optimistic instead of duplicating.
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
        if (autoStickRef.current) {
          requestAnimationFrame(() => scrollToBottom());
        }
      } catch {
        /* ignore malformed event */
      }
    });

    es.addEventListener("delete", (e) => {
      try {
        const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
        setMessages((prev) => prev.filter((m) => m.id !== id));
      } catch {
        /* ignore */
      }
    });

    return () => {
      es.close();
      setConnected(false);
    };
  }, [status, loaded, scrollToBottom]);

  // Send message
  const send = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: tempId,
      text: trimmed,
      createdAt: new Date().toISOString(),
      sender: { id: session?.user?.id || "me", name: session?.user?.name || "You" },
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    autoStickRef.current = true;
    requestAnimationFrame(() => scrollToBottom());

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!res.ok) throw new Error();
      const saved: Message = await res.json();
      setMessages((prev) => {
        // SSE may have already delivered the same message before this POST
        // resolved. If so, just drop the optimistic — don't reinsert.
        if (prev.some((m) => m.id === saved.id)) {
          return prev.filter((m) => m.id !== tempId);
        }
        return prev.map((m) => (m.id === tempId ? saved : m));
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
      );
      toast.show("Message didn't send", "error");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [text, sending, session, scrollToBottom, toast]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  // Delete a message (sender only)
  const deleteMessage = useCallback(
    async (id: string) => {
      const prev = messages;
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
    },
    [messages, toast]
  );

  // Group messages by day for date separators
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

  if (status === "loading" || status === "unauthenticated") {
    return <LoadingScreen message="Connecting" />;
  }

  const myId = session?.user?.id;

  return (
    <div className="h-[100dvh] bg-[#0a0305] text-white relative flex flex-col overflow-hidden">
      <div className="aurora" aria-hidden />
      <AppHeader
        variant="page"
        title="Chat 💬"
        subtitle={connected ? "Live · messages between us" : "Reconnecting…"}
      />

      {/* Messages list */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 pt-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          {!loaded && (
            <div className="flex justify-center py-8">
              <span
                className="w-6 h-6 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit"
                aria-hidden
              />
            </div>
          )}

          {/* Top-of-list indicator for infinite scroll */}
          {loaded && messages.length > 0 && (
            <div className="flex justify-center py-3" aria-live="polite">
              {loadingMore ? (
                <span
                  className="w-5 h-5 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit"
                  aria-label="Loading older messages"
                />
              ) : !hasMore ? (
                <span className="text-[11px] text-white/40 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10">
                  Beginning of chat ✨
                </span>
              ) : (
                <button
                  type="button"
                  onClick={loadMore}
                  className="text-[11px] text-white/55 hover:text-rose-300 px-3 py-1 rounded-full bg-white/[0.04] hover:bg-rose-500/10 border border-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
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
                      <div
                        className={`group max-w-[78%] flex flex-col ${
                          mine ? "items-end" : "items-start"
                        }`}
                      >
                        {showName && (
                          <span className="text-[11px] text-rose-300/80 font-medium px-1 mb-0.5">
                            {m.sender.name}
                          </span>
                        )}
                        <div className={`flex items-end gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                          {mine && !m.pending && !m.failed && !m.id.startsWith("tmp_") ? (
                            <motion.button
                              type="button"
                              data-msg-bubble
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId((cur) => (cur === m.id ? null : m.id));
                              }}
                              aria-label="Message actions"
                              aria-expanded={selectedId === m.id}
                              whileTap={tapPress}
                              className={`text-left px-3.5 py-2 text-sm leading-relaxed break-words shadow-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 transition-shadow bg-gradient-to-br from-rose-600 to-pink-600 text-white shadow-rose-700/30 ${
                                groupTop ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-r-md"
                              } ${groupBottom ? "rounded-br-2xl" : "rounded-br-md"} ${
                                selectedId === m.id ? "ring-2 ring-rose-300/60 shadow-rose-700/50" : ""
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{m.text}</p>
                            </motion.button>
                          ) : (
                            <div
                              className={`px-3.5 py-2 text-sm leading-relaxed break-words shadow-md ${
                                mine
                                  ? `bg-gradient-to-br from-rose-600 to-pink-600 text-white shadow-rose-700/30 ${
                                      groupTop ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-r-md"
                                    } ${groupBottom ? "rounded-br-2xl" : "rounded-br-md"}`
                                  : `bg-white/[0.07] text-white border border-white/10 ${
                                      groupTop ? "rounded-2xl rounded-bl-md" : "rounded-2xl rounded-l-md"
                                    } ${groupBottom ? "rounded-bl-2xl" : "rounded-bl-md"}`
                              } ${m.pending ? "opacity-70" : ""} ${m.failed ? "ring-2 ring-red-400/60" : ""}`}
                            >
                              <p className="whitespace-pre-wrap">{m.text}</p>
                            </div>
                          )}
                          <AnimatePresence>
                            {mine && selectedId === m.id && !m.pending && !m.failed && !m.id.startsWith("tmp_") && (
                              <motion.button
                                key="delete"
                                type="button"
                                data-msg-bubble
                                initial={{ opacity: 0, scale: 0.6, x: mine ? 8 : -8 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.6, x: mine ? 8 : -8 }}
                                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(null);
                                  deleteMessage(m.id);
                                }}
                                aria-label="Delete message"
                                whileTap={tapPress}
                                className="flex items-center justify-center w-9 h-9 rounded-full bg-red-500/15 text-red-300 hover:bg-red-500/25 hover:text-red-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 shrink-0"
                              >
                                <Trash className="w-4 h-4" aria-hidden />
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </div>
                        {groupBottom && (
                          <span className={`text-[10px] text-white/40 px-1 mt-0.5 ${m.failed ? "text-red-300" : ""}`}>
                            {m.failed ? "Failed to send" : m.pending ? "Sending…" : fmtTime(m.createdAt)}
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

      {/* Composer */}
      <div
        className="relative border-t border-white/10 bg-[#0a0305]/85 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input"
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            onKeyDown={onKeyDown}
            placeholder="Say something sweet..."
            className="flex-1 resize-none bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/45 focus:outline-none focus:border-rose-400 focus:bg-white/[0.09] transition-colors max-h-40"
          />
          <motion.button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending}
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
