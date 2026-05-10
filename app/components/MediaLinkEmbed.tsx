"use client";

// Detect music/video links inside chat text and render an inline embed.
// Recognised:
//   - YouTube (youtube.com/watch?v=, youtu.be/, youtube.com/shorts/)
//   - Spotify (open.spotify.com/{track,album,playlist,episode}/<id>)
//   - SoundCloud (soundcloud.com/<artist>/<track>)
//
// We render the plain text first (so the URL stays selectable), then a
// compact embed card below. Embeds are iframes — no scripts, no extra deps.

interface ParsedLink {
  kind: "youtube" | "spotify" | "soundcloud";
  src: string;
}

const YT_RE =
  /https?:\/\/(?:(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/)([\w-]{11})|youtu\.be\/([\w-]{11}))(?:[?&][^\s]*)?/i;
const SPOTIFY_RE =
  /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/([A-Za-z0-9]+)(?:\?[^\s]*)?/i;
const SOUNDCLOUD_RE =
  /https?:\/\/soundcloud\.com\/[\w-]+\/[\w-]+(?:\?[^\s]*)?/i;

export function detectMediaLink(text: string): ParsedLink | null {
  if (!text) return null;
  const yt = text.match(YT_RE);
  if (yt) {
    const id = yt[1] || yt[2];
    if (id) {
      return {
        kind: "youtube",
        src: `https://www.youtube-nocookie.com/embed/${id}`,
      };
    }
  }
  const sp = text.match(SPOTIFY_RE);
  if (sp) {
    const [, kind, id] = sp;
    return {
      kind: "spotify",
      src: `https://open.spotify.com/embed/${kind}/${id}`,
    };
  }
  const sc = text.match(SOUNDCLOUD_RE);
  if (sc) {
    const url = sc[0];
    return {
      kind: "soundcloud",
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        url
      )}&color=%23f43f5e&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false`,
    };
  }
  return null;
}

interface Props {
  text: string;
}

export default function MediaLinkEmbed({ text }: Props) {
  const link = detectMediaLink(text);
  if (!link) return null;

  if (link.kind === "youtube") {
    return (
      <div
        className="mt-2 rounded-xl overflow-hidden border border-white/10 bg-black/30"
        style={{ aspectRatio: "16 / 9", maxWidth: 360 }}
      >
        <iframe
          src={link.src}
          title="YouTube preview"
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }
  if (link.kind === "spotify") {
    return (
      <div className="mt-2 rounded-xl overflow-hidden bg-black/30" style={{ maxWidth: 360 }}>
        <iframe
          src={link.src}
          title="Spotify preview"
          className="w-full"
          height={152}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      </div>
    );
  }
  // soundcloud
  return (
    <div className="mt-2 rounded-xl overflow-hidden bg-black/30" style={{ maxWidth: 360 }}>
      <iframe
        src={link.src}
        title="SoundCloud preview"
        className="w-full"
        height={166}
        allow="autoplay"
        loading="lazy"
      />
    </div>
  );
}
