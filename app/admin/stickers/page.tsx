"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import LoadingScreen from "../../components/LoadingScreen";
import { useToast } from "../../components/Toast";
import { Plus, Trash, Sparkles, ImagePlus } from "../../components/Icons";
import { motion, AnimatePresence, listItem, tapPress } from "../../components/motion";
import StickerMedia from "../../components/StickerMedia";

interface Sticker {
  id: string;
  key: string;
  url: string;
}
interface StickerPack {
  id: string;
  name: string;
  emoji: string | null;
  stickers: Sticker[];
}

const STICKER_TYPES = "image/jpeg,image/png,image/webp,image/gif";
const STICKER_MAX = 2 * 1024 * 1024;

export default function AdminStickersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Create-pack form
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [creating, setCreating] = useState(false);
  // Per-pack upload state — { [packId]: number of currently-uploading files }
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Telegram import state
  const [tgUrl, setTgUrl] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && session?.user?.role !== "admin") router.push("/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.role !== "admin") return;
    fetch("/api/stickers")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setPacks(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [status, session]);

  const createPack = useCallback(async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/stickers/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), emoji: newEmoji.trim() || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed");
      }
      const pack: StickerPack = await res.json();
      setPacks((prev) => [...prev, pack]);
      setNewName("");
      setNewEmoji("");
      toast.show("Pack created ✨", "love");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't create pack", "error");
    } finally {
      setCreating(false);
    }
  }, [newName, newEmoji, creating, toast]);

  const deletePack = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`Delete pack "${name}" and all its stickers?`)) return;
      const prev = packs;
      setPacks((p) => p.filter((x) => x.id !== id));
      try {
        const res = await fetch("/api/stickers/packs", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new Error();
        toast.show("Pack deleted", "success");
      } catch {
        setPacks(prev);
        toast.show("Couldn't delete pack", "error");
      }
    },
    [packs, toast]
  );

  const deleteSticker = useCallback(
    async (packId: string, stickerId: string) => {
      const prev = packs;
      setPacks((all) =>
        all.map((p) =>
          p.id === packId ? { ...p, stickers: p.stickers.filter((s) => s.id !== stickerId) } : p
        )
      );
      try {
        const res = await fetch("/api/stickers", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: stickerId }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setPacks(prev);
        toast.show("Couldn't delete sticker", "error");
      }
    },
    [packs, toast]
  );

  const uploadSticker = useCallback(
    async (packId: string, file: File): Promise<Sticker | null> => {
      if (!STICKER_TYPES.includes(file.type)) {
        toast.show(`${file.name}: not a supported image type`, "error");
        return null;
      }
      if (file.size > STICKER_MAX) {
        toast.show(`${file.name}: too large (max 2 MB)`, "error");
        return null;
      }
      try {
        // 1. Presign — include packId so the new key lands in the right folder
        const sigRes = await fetch("/api/upload/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: file.type,
            size: file.size,
            kind: "sticker",
            packId,
          }),
        });
        if (!sigRes.ok) {
          const j = await sigRes.json().catch(() => ({}));
          throw new Error(j.error || "Couldn't presign");
        }
        const { url, key } = (await sigRes.json()) as { url: string; key: string };

        // 2. PUT to R2
        const put = await fetch(url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!put.ok) throw new Error("Upload failed");

        // 3. Register sticker in DB
        const reg = await fetch("/api/stickers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packId, key }),
        });
        if (!reg.ok) {
          const j = await reg.json().catch(() => ({}));
          throw new Error(j.error || "Couldn't register sticker");
        }
        const sticker: Sticker = await reg.json();
        return sticker;
      } catch (err) {
        toast.show(err instanceof Error ? err.message : "Upload failed", "error");
        return null;
      }
    },
    [toast]
  );

  const importTelegram = useCallback(async () => {
    if (!tgUrl.trim() || importing) return;
    setImporting(true);
    try {
      const res = await fetch("/api/stickers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tgUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }
      const { importedCount, skippedAnimated, errors } = data as {
        importedCount: number;
        skippedAnimated: number;
        errors: { file_id: string; error: string }[];
      };

      const parts = [`Imported ${importedCount}`];
      if (skippedAnimated > 0) parts.push(`skipped ${skippedAnimated} animated`);
      if (errors.length > 0) parts.push(`${errors.length} failed`);
      toast.show(parts.join(" · "), "love");

      setTgUrl("");
      // Refresh pack list — easiest is a full re-fetch
      const reload = await fetch("/api/stickers");
      if (reload.ok) {
        setPacks(await reload.json());
      }
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }, [tgUrl, importing, toast]);

  const onPickFiles = useCallback(
    async (packId: string, files: FileList | null) => {
      if (!files || !files.length) return;
      const arr = Array.from(files);
      setUploading((u) => ({ ...u, [packId]: (u[packId] ?? 0) + arr.length }));

      for (const file of arr) {
        const sticker = await uploadSticker(packId, file);
        if (sticker) {
          setPacks((prev) =>
            prev.map((p) =>
              p.id === packId ? { ...p, stickers: [...p.stickers, sticker] } : p
            )
          );
        }
        setUploading((u) => ({ ...u, [packId]: Math.max(0, (u[packId] ?? 0) - 1) }));
      }
      toast.show("Stickers added 🎉", "love");
    },
    [uploadSticker, toast]
  );

  if (status === "loading" || !session || session.user.role !== "admin") {
    return <LoadingScreen message="Unlocking" />;
  }

  return (
    <div className="min-h-screen bg-[#0a0305] text-white relative">
      <div className="aurora" aria-hidden />
      <AppHeader variant="page" title="Sticker Packs 🎨" subtitle="Upload and curate" backHref="/admin" />

      <div className="relative max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Create pack */}
        <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-rose-400" aria-hidden />
            New Pack
          </h2>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <label htmlFor="pack-name" className="sr-only">Pack name</label>
              <input
                id="pack-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Pack name (e.g. Cats)"
                maxLength={50}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400"
              />
              <label htmlFor="pack-emoji" className="sr-only">Pack emoji</label>
              <input
                id="pack-emoji"
                type="text"
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                placeholder="🐱"
                maxLength={2}
                className="w-16 text-center bg-white/5 border border-white/10 rounded-xl px-2 py-3 text-lg focus:outline-none focus:border-rose-400"
              />
            </div>
            <motion.button
              type="button"
              onClick={createPack}
              disabled={!newName.trim() || creating}
              whileTap={tapPress}
              className="w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-rose-700/30 flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                  Creating...
                </>
              ) : (
                <>
                  Create Pack
                  <Sparkles className="w-4 h-4" aria-hidden />
                </>
              )}
            </motion.button>
          </div>
        </section>

        {/* Import from Telegram */}
        <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <h2 className="font-semibold text-sm mb-1 flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-rose-400" aria-hidden>
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Import from Telegram
          </h2>
          <p className="text-white/65 text-xs mb-4">
            Paste a <code className="text-rose-300">t.me/addstickers/&lt;name&gt;</code> link.
            Static and video stickers are imported; animated <code>.tgs</code> ones are skipped.
          </p>
          <div className="flex flex-col gap-3">
            <label htmlFor="tg-url" className="sr-only">Telegram sticker pack URL</label>
            <input
              id="tg-url"
              type="text"
              value={tgUrl}
              onChange={(e) => setTgUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && importTelegram()}
              placeholder="https://t.me/addstickers/PackName"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400"
            />
            <motion.button
              type="button"
              onClick={importTelegram}
              disabled={!tgUrl.trim() || importing}
              whileTap={tapPress}
              className="w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-blue-700/30 flex items-center justify-center gap-2"
            >
              {importing ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                  Importing… (may take a minute)
                </>
              ) : (
                "Import Pack"
              )}
            </motion.button>
            <p className="text-white/40 text-[11px]">
              First-time setup: create a Telegram bot via{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-300 hover:underline"
              >
                @BotFather
              </a>
              , then add <code className="text-white/65">TELEGRAM_BOT_TOKEN</code> to your env.
            </p>
          </div>
        </section>

        {/* Existing packs */}
        {!loaded ? (
          <p className="text-white/55 text-sm text-center">Loading packs...</p>
        ) : packs.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8 gap-2">
            <Sparkles className="w-7 h-7 text-rose-400/60 animate-float" aria-hidden />
            <p className="text-white/55 text-sm">No packs yet — create one above</p>
          </div>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {packs.map((pack) => {
              const uploadCount = uploading[pack.id] ?? 0;
              return (
                <motion.section
                  key={pack.id}
                  layout
                  variants={listItem}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30"
                >
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <h3 className="font-semibold text-sm flex items-center gap-2 min-w-0">
                      {pack.emoji && <span className="text-xl shrink-0">{pack.emoji}</span>}
                      <span className="truncate">{pack.name}</span>
                      <span className="text-white/45 text-xs font-normal shrink-0">
                        ({pack.stickers.length})
                      </span>
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        ref={(el) => { fileInputRefs.current[pack.id] = el; }}
                        type="file"
                        multiple
                        accept={STICKER_TYPES}
                        onChange={(e) => {
                          onPickFiles(pack.id, e.target.files);
                          e.currentTarget.value = "";
                        }}
                        className="hidden"
                      />
                      <motion.button
                        type="button"
                        whileTap={tapPress}
                        onClick={() => fileInputRefs.current[pack.id]?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 text-xs font-medium cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <ImagePlus className="w-3.5 h-3.5" aria-hidden />
                        Upload
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={tapPress}
                        onClick={() => deletePack(pack.id, pack.name)}
                        aria-label={`Delete pack ${pack.name}`}
                        className="flex items-center justify-center w-9 h-9 rounded-full text-white/45 hover:text-red-400 hover:bg-red-500/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors"
                      >
                        <Trash className="w-4 h-4" aria-hidden />
                      </motion.button>
                    </div>
                  </div>

                  {pack.stickers.length === 0 && uploadCount === 0 ? (
                    <p className="text-white/45 text-xs text-center py-4">
                      No stickers yet — tap Upload to add some
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      <AnimatePresence initial={false} mode="popLayout">
                        {pack.stickers.map((s) => (
                          <motion.div
                            key={s.id}
                            layout
                            variants={listItem}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="relative group aspect-square rounded-xl overflow-hidden bg-white/[0.04] border border-white/10"
                          >
                            <StickerMedia
                              url={s.url}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => deleteSticker(pack.id, s.id)}
                              aria-label="Delete sticker"
                              className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 hover:bg-red-500/80 text-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Trash className="w-3.5 h-3.5" aria-hidden />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {Array.from({ length: uploadCount }).map((_, i) => (
                        <div
                          key={`up_${i}`}
                          className="aspect-square rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center"
                        >
                          <span
                            className="w-5 h-5 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-orbit"
                            aria-label="Uploading"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </motion.section>
              );
            })}
          </AnimatePresence>
        )}

        <p className="text-white/40 text-xs text-center pb-2">
          Stickers are 2 MB max. JPEG / PNG / WebP / GIF. Deleting a sticker removes it from
          the picker but doesn&apos;t affect already-sent messages.
        </p>
      </div>
    </div>
  );
}
