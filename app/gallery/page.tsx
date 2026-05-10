"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppHeader from "../components/AppHeader";
import LoadingScreen from "../components/LoadingScreen";
import MemoryUploadModal from "../components/MemoryUploadModal";
import { useToast } from "../components/Toast";
import {
  Plus, Trash, Sparkles, X, MapPin, Grid, CalendarDays, ArrowLeft,
} from "../components/Icons";
import { motion, AnimatePresence, listItem, tapPress } from "../components/motion";

const MemoryMap = dynamic(() => import("../components/MemoryMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center">
      <span className="w-7 h-7 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit" aria-hidden />
    </div>
  ),
});

interface Memory {
  id: string;
  date: string;
  caption: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  uploadedBy: { id: string; name: string };
  attachments: string[];
  createdAt: string;
}

type ViewMode = "masonry" | "calendar" | "map";

const VIEWS: { mode: ViewMode; label: string; Icon: typeof Grid }[] = [
  { mode: "masonry",  label: "Grid",     Icon: Grid },
  { mode: "calendar", label: "Calendar", Icon: CalendarDays },
  { mode: "map",      label: "Map",      Icon: MapPin },
];

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function monthKey(iso: string) {
  return iso.slice(0, 7); // YYYY-MM
}

function fmtMonth(yyyymm: string) {
  return new Date(yyyymm + "-01T12:00:00Z").toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "long",
    year: "numeric",
  });
}

export default function GalleryPage() {
  const { status } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [memories, setMemories] = useState<Memory[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<ViewMode>("masonry");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const loadInitial = useCallback(async () => {
    try {
      const res = await fetch("/api/memories");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: Memory[]; nextCursor: string | null };
      setMemories(data.items);
      setNextCursor(data.nextCursor);
      setLoaded(true);
    } catch {
      toast.show("Couldn't load memories", "error");
      setLoaded(true);
    }
  }, [toast]);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadInitial();
  }, [status, loadInitial]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !nextCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/memories?cursor=${encodeURIComponent(nextCursor)}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: Memory[]; nextCursor: string | null };
      setMemories((prev) => {
        const have = new Set(prev.map((m) => m.id));
        const fresh = data.items.filter((m) => !have.has(m.id));
        return [...prev, ...fresh];
      });
      setNextCursor(data.nextCursor);
    } catch {
      toast.show("Couldn't load more", "error");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, toast]);

  const onMemoryCreated = useCallback(() => {
    // simplest refresh — reload page 1
    loadInitial();
  }, [loadInitial]);

  const deleteMemory = useCallback(
    async (id: string) => {
      if (!confirm("Delete this memory?")) return;
      const prev = memories;
      setMemories((m) => m.filter((x) => x.id !== id));
      setLightboxId(null);
      try {
        const res = await fetch("/api/memories", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new Error();
        toast.show("Memory deleted", "success");
      } catch {
        setMemories(prev);
        toast.show("Couldn't delete memory", "error");
      }
    },
    [memories, toast]
  );

  // ── Calendar grouping ─────────────────────────────────────────────────
  const monthGroups = useMemo(() => {
    const map = new Map<string, Memory[]>();
    for (const m of memories) {
      const key = monthKey(m.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    // Already sorted desc by API; preserve.
    return Array.from(map.entries());
  }, [memories]);

  const toggleMonth = (key: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Map data ──────────────────────────────────────────────────────────
  const mapMemories = useMemo(
    () =>
      memories
        .filter((m) => m.lat != null && m.lng != null)
        .map((m) => ({
          id: m.id,
          lat: m.lat as number,
          lng: m.lng as number,
          date: fmtDate(m.date),
          caption: m.caption,
          location: m.location,
          thumbUrl: m.attachments[0] ?? null,
        })),
    [memories]
  );

  // ── Lightbox ─────────────────────────────────────────────────────────
  const lightboxMemory = useMemo(
    () => memories.find((m) => m.id === lightboxId) ?? null,
    [memories, lightboxId]
  );
  const [lightboxIdx, setLightboxIdx] = useState(0);
  useEffect(() => {
    setLightboxIdx(0);
  }, [lightboxId]);

  if (status === "loading" || !loaded) {
    return <LoadingScreen message="Gathering memories" />;
  }

  return (
    <div className="min-h-screen bg-[#0a0305] text-white relative">
      <div className="aurora" aria-hidden />

      <AppHeader variant="page" title="Gallery 🌌" subtitle={`${memories.length} ${memories.length === 1 ? "memory" : "memories"}`} />

      <div className="relative max-w-5xl mx-auto px-4 py-5 flex flex-col gap-4">
        {/* View switcher + add button */}
        <div className="flex items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="View mode"
            className="inline-flex bg-white/[0.04] border border-white/10 rounded-full p-1"
          >
            {VIEWS.map((v) => {
              const active = view === v.mode;
              return (
                <button
                  key={v.mode}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(v.mode)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 min-h-[36px] rounded-full text-xs font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                    active
                      ? "bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-700/30"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  <v.Icon className="w-3.5 h-3.5" aria-hidden />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
          <motion.button
            type="button"
            onClick={() => setUploadOpen(true)}
            whileTap={tapPress}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[36px] rounded-full bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-semibold shadow-lg shadow-rose-700/30 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Memory
          </motion.button>
        </div>

        {/* Empty state */}
        {memories.length === 0 && (
          <div className="flex flex-col items-center text-center py-16 gap-3 animate-fade-up">
            <Sparkles className="w-10 h-10 text-rose-400/70 animate-float" aria-hidden />
            <p className="text-white/75 text-sm">No memories yet</p>
            <p className="text-white/55 text-xs max-w-xs">
              Tap <strong>Memory</strong> to add your first photo, caption, and the place it
              happened.
            </p>
          </div>
        )}

        {/* ── Masonry view ── */}
        {memories.length > 0 && view === "masonry" && (
          <>
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-2 [column-fill:_balance]">
              {memories.map((m) => (
                <motion.button
                  key={m.id}
                  layout
                  type="button"
                  onClick={() => setLightboxId(m.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={tapPress}
                  className="block w-full mb-2 break-inside-avoid rounded-xl overflow-hidden bg-white/[0.04] border border-white/10 hover:border-rose-400/40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 transition-colors"
                >
                  {m.attachments[0] && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.attachments[0]}
                      alt=""
                      loading="lazy"
                      className="w-full h-auto block"
                    />
                  )}
                  {(m.caption || m.location) && (
                    <div className="p-2 text-left">
                      {m.caption && (
                        <p className="text-xs text-white/85 line-clamp-2">{m.caption}</p>
                      )}
                      <p className="text-[11px] text-white/50 mt-0.5 flex items-center gap-1">
                        {m.location && <MapPin className="w-3 h-3 shrink-0" aria-hidden />}
                        <span className="truncate">
                          {m.location ? `${m.location} · ` : ""}
                          {fmtDate(m.date)}
                        </span>
                      </p>
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
            {nextCursor && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 text-white/70 text-sm cursor-pointer transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                    Loading...
                  </span>
                ) : (
                  "Load more"
                )}
              </button>
            )}
          </>
        )}

        {/* ── Calendar view ── */}
        {memories.length > 0 && view === "calendar" && (
          <div className="flex flex-col gap-4">
            {monthGroups.map(([key, items]) => {
              const collapsed = collapsedMonths.has(key);
              return (
                <section key={key} className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleMonth(key)}
                    aria-expanded={!collapsed}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.04] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <span className="font-semibold text-sm text-white">{fmtMonth(key)}</span>
                    <span className="text-xs text-white/55">
                      {items.length} {items.length === 1 ? "memory" : "memories"} ·{" "}
                      <span className={`inline-block transition-transform ${collapsed ? "" : "rotate-180"}`}>↓</span>
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3">
                      {items.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setLightboxId(m.id)}
                          className="aspect-square rounded-lg overflow-hidden bg-black/30 cursor-pointer hover:ring-2 hover:ring-rose-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 transition-all"
                        >
                          {m.attachments[0] && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={m.attachments[0]}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            {nextCursor && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 text-white/70 text-sm cursor-pointer transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        )}

        {/* ── Map view ── */}
        {memories.length > 0 && view === "map" && (
          <div className="flex flex-col gap-3">
            {mapMemories.length === 0 && (
              <p className="text-white/55 text-sm text-center py-3">
                None of your memories have locations yet — add one with a place pinned to see it on the map.
              </p>
            )}
            <div className="h-[60vh] min-h-[400px]">
              <MemoryMap memories={mapMemories} onSelect={(id) => setLightboxId(id)} />
            </div>
            <p className="text-[11px] text-white/40 text-center">
              Showing {mapMemories.length} of {memories.length} memories with locations.
            </p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxMemory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-md"
              onClick={() => setLightboxId(null)}
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={lightboxMemory.caption || "Memory"}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[1001] flex flex-col p-3 sm:p-6"
              style={{
                paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
              }}
            >
              <div className="flex items-center justify-between mb-3 text-white">
                <button
                  type="button"
                  onClick={() => setLightboxId(null)}
                  aria-label="Close"
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  <ArrowLeft className="w-5 h-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => deleteMemory(lightboxMemory.id)}
                  aria-label="Delete memory"
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-red-500/30 hover:text-red-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <Trash className="w-5 h-5" aria-hidden />
                </button>
              </div>

              <div
                className="flex-1 flex items-center justify-center overflow-hidden relative"
                onClick={() => setLightboxId(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightboxMemory.attachments[lightboxIdx] || lightboxMemory.attachments[0]}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
                {lightboxMemory.attachments.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIdx((i) =>
                          i === 0 ? lightboxMemory.attachments.length - 1 : i - 1
                        );
                      }}
                      aria-label="Previous"
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center cursor-pointer"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIdx((i) =>
                          i === lightboxMemory.attachments.length - 1 ? 0 : i + 1
                        );
                      }}
                      aria-label="Next"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center cursor-pointer"
                    >
                      ›
                    </button>
                  </>
                )}
              </div>

              <div className="mt-3 text-white">
                {lightboxMemory.caption && (
                  <p className="text-base leading-relaxed">{lightboxMemory.caption}</p>
                )}
                <p className="text-xs text-white/65 mt-1 flex items-center gap-1.5 flex-wrap">
                  {lightboxMemory.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" aria-hidden />
                      {lightboxMemory.location}
                    </span>
                  )}
                  <span>·</span>
                  <span>{fmtDate(lightboxMemory.date)}</span>
                  <span>·</span>
                  <span>by {lightboxMemory.uploadedBy.name}</span>
                  {lightboxMemory.attachments.length > 1 && (
                    <>
                      <span>·</span>
                      <span>{lightboxIdx + 1} / {lightboxMemory.attachments.length}</span>
                    </>
                  )}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Upload modal */}
      <MemoryUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={onMemoryCreated}
      />
    </div>
  );
}
