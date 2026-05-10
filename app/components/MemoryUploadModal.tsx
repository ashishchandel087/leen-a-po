"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence, tapPress } from "./motion";
import { useToast } from "./Toast";
import { Plus, Trash, Sparkles, X, MapPin, ImagePlus } from "./Icons";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  key?: string;
}

interface PlaceSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function todayLocal() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function MemoryUploadModal({ open, onClose, onCreated }: Props) {
  const toast = useToast();
  const [date, setDate] = useState<string>(todayLocal());
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [latLng, setLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const placeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state whenever the modal closes
  useEffect(() => {
    if (open) return;
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setDate(todayLocal());
    setCaption("");
    setLocation("");
    setLatLng(null);
    setSuggestions([]);
    setFiles([]);
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Geocode location text on debounce — uses Nominatim (OSM, free, no API key,
  // rate limited to ~1 req/sec by polite usage policy)
  useEffect(() => {
    if (!open) return;
    if (placeTimeoutRef.current) clearTimeout(placeTimeoutRef.current);
    if (location.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    placeTimeoutRef.current = setTimeout(async () => {
      setSearchingPlace(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(location.trim())}`,
          { headers: { "Accept-Language": "en" } }
        );
        if (res.ok) {
          const data = (await res.json()) as PlaceSuggestion[];
          setSuggestions(data.slice(0, 5));
        }
      } catch {
        /* ignore */
      } finally {
        setSearchingPlace(false);
      }
    }, 600);
    return () => {
      if (placeTimeoutRef.current) clearTimeout(placeTimeoutRef.current);
    };
  }, [location, open]);

  const uploadOne = useCallback(
    async (pf: PendingFile) => {
      try {
        const sigRes = await fetch("/api/upload/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: pf.file.type,
            size: pf.file.size,
            kind: "memory",
          }),
        });
        if (!sigRes.ok) {
          const j = await sigRes.json().catch(() => ({}));
          throw new Error(j.error || "Couldn't presign");
        }
        const { url, key } = (await sigRes.json()) as { url: string; key: string };
        const put = await fetch(url, {
          method: "PUT",
          body: pf.file,
          headers: { "Content-Type": pf.file.type },
        });
        if (!put.ok) throw new Error("Upload failed");
        setFiles((prev) =>
          prev.map((f) => (f.id === pf.id ? { ...f, status: "done", key } : f))
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) => (f.id === pf.id ? { ...f, status: "error" } : f))
        );
        toast.show(err instanceof Error ? err.message : "Upload failed", "error");
      }
    },
    [toast]
  );

  const onPickFiles = useCallback(
    (picked: FileList | null) => {
      if (!picked || !picked.length) return;
      const slots = MAX_FILES - files.length;
      if (slots <= 0) {
        toast.show(`Up to ${MAX_FILES} photos per memory`, "error");
        return;
      }
      const additions: PendingFile[] = [];
      for (const file of Array.from(picked).slice(0, slots)) {
        if (!file.type.startsWith("image/")) {
          toast.show(`${file.name}: only images supported`, "error");
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.show(`${file.name}: max 10 MB`, "error");
          continue;
        }
        additions.push({
          id: `f_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          status: "uploading",
        });
      }
      if (!additions.length) return;
      setFiles((prev) => [...prev, ...additions]);
      additions.forEach(uploadOne);
    },
    [files.length, uploadOne, toast]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const submit = useCallback(async () => {
    const ready = files.filter((f) => f.status === "done" && f.key);
    if (ready.length === 0) {
      toast.show("Add at least one photo", "error");
      return;
    }
    if (files.some((f) => f.status === "uploading")) {
      toast.show("Wait for uploads to finish", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          caption: caption.trim(),
          location: location.trim() || null,
          lat: latLng?.lat ?? null,
          lng: latLng?.lng ?? null,
          attachments: ready.map((f) => f.key),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't save memory");
      }
      toast.show("Memory saved 🌟", "love");
      onCreated();
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSubmitting(false);
    }
  }, [files, date, caption, location, latLng, onCreated, onClose, toast]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="New memory"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="bg-[#0c0407] sm:rounded-2xl rounded-t-2xl border border-white/10 shadow-2xl shadow-black/50 w-full sm:max-w-md max-h-[88vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-rose-400" aria-hidden />
                  New memory
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex items-center justify-center w-10 h-10 rounded-full text-white/70 hover:bg-white/5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  <X className="w-5 h-5" aria-hidden />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                {/* File picker */}
                <div className="flex flex-col gap-2">
                  <label className="text-white/70 text-xs font-medium uppercase tracking-wider">
                    Photos
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                    onChange={(e) => {
                      onPickFiles(e.target.files);
                      e.currentTarget.value = "";
                    }}
                    className="hidden"
                  />
                  {files.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-white/15 hover:border-rose-400/50 hover:bg-rose-500/5 text-white/65 hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      <ImagePlus className="w-7 h-7" aria-hidden />
                      <span className="text-sm">Tap to choose photos</span>
                      <span className="text-[11px] text-white/45">Up to {MAX_FILES}, 10 MB each</span>
                    </button>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        {files.map((f) => (
                          <div
                            key={f.id}
                            className="relative aspect-square rounded-lg overflow-hidden bg-white/[0.04] border border-white/10"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={f.previewUrl}
                              alt="preview"
                              className={`w-full h-full object-cover ${f.status === "uploading" ? "opacity-50" : ""}`}
                            />
                            {f.status === "uploading" && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span
                                  className="w-5 h-5 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit"
                                  aria-label="Uploading"
                                />
                              </div>
                            )}
                            {f.status === "error" && (
                              <div className="absolute inset-0 flex items-center justify-center bg-red-500/30 text-red-100 text-[10px] font-medium">
                                Failed
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeFile(f.id)}
                              aria-label="Remove"
                              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white/90"
                            >
                              <X className="w-3 h-3" aria-hidden />
                            </button>
                          </div>
                        ))}
                        {files.length < MAX_FILES && (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-square rounded-lg border-2 border-dashed border-white/15 hover:border-rose-400/50 flex items-center justify-center text-white/55 hover:text-rose-300 transition-colors cursor-pointer"
                            aria-label="Add more photos"
                          >
                            <Plus className="w-5 h-5" aria-hidden />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Date */}
                <div>
                  <label htmlFor="memory-date" className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1.5 block">
                    Date
                  </label>
                  <input
                    id="memory-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-400"
                  />
                </div>

                {/* Caption */}
                <div>
                  <label htmlFor="memory-caption" className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1.5 block">
                    Caption
                  </label>
                  <textarea
                    id="memory-caption"
                    rows={2}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value.slice(0, 1000))}
                    placeholder="What was this moment?"
                    className="w-full resize-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/45 focus:outline-none focus:border-rose-400"
                  />
                </div>

                {/* Location with geocoding */}
                <div>
                  <label htmlFor="memory-location" className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1.5 block flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" aria-hidden />
                    Location
                    {latLng && (
                      <span className="text-rose-300 normal-case font-normal text-[10px]">
                        · pin saved
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      id="memory-location"
                      type="text"
                      value={location}
                      onChange={(e) => {
                        setLocation(e.target.value);
                        setLatLng(null);
                      }}
                      placeholder="e.g. Lucknow, India (optional)"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/45 focus:outline-none focus:border-rose-400"
                    />
                    {searchingPlace && (
                      <span
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit"
                        aria-label="Searching"
                      />
                    )}
                  </div>
                  {suggestions.length > 0 && !latLng && (
                    <div className="mt-2 bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
                      {suggestions.map((s) => (
                        <button
                          key={`${s.lat}-${s.lon}`}
                          type="button"
                          onClick={() => {
                            setLocation(s.display_name);
                            setLatLng({ lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
                            setSuggestions([]);
                          }}
                          className="w-full text-left px-4 py-2 text-xs text-white/85 hover:bg-rose-500/10 hover:text-white cursor-pointer"
                        >
                          <span className="line-clamp-2">{s.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-white/40 text-[11px] mt-1.5">
                    Pick a place from the suggestions to put this memory on the map.
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-white/10 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-white/85 text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <motion.button
                  type="button"
                  onClick={submit}
                  disabled={submitting || files.filter((f) => f.status === "done").length === 0}
                  whileTap={tapPress}
                  className="flex-1 py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-rose-700/30 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                      Saving...
                    </>
                  ) : (
                    <>
                      Save
                      <Sparkles className="w-4 h-4" aria-hidden />
                    </>
                  )}
                </motion.button>
              </div>

              <p className="text-[10px] text-white/35 text-center pb-2 px-4">
                Locations are searched via OpenStreetMap (Nominatim) — please use sparingly.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
