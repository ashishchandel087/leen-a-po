// Render a sticker either as <img> (WebP/PNG/JPEG/GIF) or <video> (WebM video
// stickers from Telegram). We detect by URL path extension before the query
// string — signed URLs keep the original key path.

interface Props {
  url: string;
  alt?: string;
  className?: string;
  /** Whether to lazy-load the underlying media. Default true. */
  lazy?: boolean;
}

export function isVideoStickerUrl(url: string): boolean {
  const path = url.split("?")[0];
  return /\.webm$/i.test(path);
}

export default function StickerMedia({ url, alt = "sticker", className = "", lazy = true }: Props) {
  if (isVideoStickerUrl(url)) {
    return (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        preload={lazy ? "metadata" : "auto"}
        className={className}
        aria-label={alt}
      />
    );
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
