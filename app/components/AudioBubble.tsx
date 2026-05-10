"use client";

// Compact audio player rendered inside chat bubbles for voice notes.
// Single play/pause button + progress bar + timer. No waveform — keeps it
// dependency-free and fast.

import { useEffect, useRef, useState } from "react";

interface Props {
  url: string;
  /** Bubble tone — affects accent color of the play button + progress bar. */
  mine?: boolean;
}

function fmtSec(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function AudioBubble({ url, mine }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onLoaded = () => setDuration(a.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const v = Number(e.target.value);
    a.currentTime = v;
    setTime(v);
  };

  const accent = mine ? "white" : "#fb7185"; // rose-400 on partner bubbles
  const trackBg = mine ? "rgba(255,255,255,0.25)" : "rgba(244,114,182,0.18)";

  return (
    <div className="flex items-center gap-2.5 min-w-[200px] max-w-xs">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-label={playing ? "Pause" : "Play"}
        className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 ${
          mine
            ? "bg-white/20 hover:bg-white/30 text-white focus-visible:ring-white"
            : "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 focus-visible:ring-rose-400"
        }`}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 ml-0.5" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={time}
          onChange={seek}
          onClick={(e) => e.stopPropagation()}
          aria-label="Seek"
          className="w-full h-1.5 appearance-none rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${accent} ${duration ? (time / duration) * 100 : 0}%, ${trackBg} ${duration ? (time / duration) * 100 : 0}%)`,
          }}
        />
        <p className={`text-[11px] mt-1 ${mine ? "text-white/85" : "text-white/65"}`}>
          {fmtSec(playing || time > 0 ? time : duration)}
        </p>
      </div>
      <audio ref={audioRef} src={url} preload="metadata" />
    </div>
  );
}
