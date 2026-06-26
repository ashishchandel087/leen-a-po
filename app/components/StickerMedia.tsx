"use client";

// Render a sticker either as <img> (WebP/PNG/JPEG/GIF) or <video> (WebM video
// stickers from Telegram). We detect by URL path extension before the query
// string — signed URLs keep the original key path.
//
// Video stickers are the #1 cause of mobile crashes: a pack (or a long chat
// history) can mount 100+ <video autoPlay loop> elements at once, and mobile
// browsers — iOS Safari especially — run out of memory / video decoders and
// kill the tab. To avoid that, video stickers only decode and play while
// actually on-screen (via IntersectionObserver) and pause + release otherwise.

import { useEffect, useRef } from "react";

interface Props {
  url: string;
  alt?: string;
  className?: string;
  /** Whether to defer loading/playing until on-screen. Default true. */
  lazy?: boolean;
}

export function isVideoStickerUrl(url: string): boolean {
  const path = url.split("?")[0];
  return /\.webm$/i.test(path);
}

export default function StickerMedia({ url, alt = "sticker", className = "", lazy = true }: Props) {
  if (isVideoStickerUrl(url)) {
    return <VideoSticker url={url} alt={alt} className={className} lazy={lazy} />;
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={alt}
      loading={lazy ? "lazy" : "eager"}
      className={className}
    />
  );
}

function VideoSticker({ url, alt, className, lazy }: Required<Props>) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (ancient browser) → just play; nothing to gate on.
    if (typeof IntersectionObserver === "undefined") {
      el.play?.().catch(() => {});
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // play() may reject (autoplay policy) — ignore. With preload="none" the
        // browser only fetches/decodes once we actually call play() here, so
        // off-screen stickers never allocate a video decoder.
        if (entry.isIntersecting) el.play?.().catch(() => {});
        else el.pause?.();
      },
      { rootMargin: "200px" }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      el.pause?.();
    };
  }, []);

  return (
    <video
      ref={ref}
      src={url}
      // No autoplay attribute — playback is driven by the observer above so
      // only on-screen stickers ever decode/play. preload="none" keeps the
      // bytes from being fetched until then.
      loop
      muted
      playsInline
      preload={lazy ? "none" : "auto"}
      className={className}
      aria-label={alt}
    />
  );
}
