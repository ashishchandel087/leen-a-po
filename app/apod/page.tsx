"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ApodData {
  title: string;
  date: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: string;
  copyright?: string;
}

interface Star {
  width: string;
  height: string;
  top: string;
  left: string;
  opacity: number;
  animation: string;
  animationDelay: string;
}

function StarField() {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    const generated = Array.from({ length: 80 }).map(() => ({
      width: Math.random() * 2 + 1 + "px",
      height: Math.random() * 2 + 1 + "px",
      top: Math.random() * 100 + "%",
      left: Math.random() * 100 + "%",
      opacity: Math.random() * 0.7 + 0.3,
      animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
      animationDelay: Math.random() * 3 + "s",
    }));
    setStars(generated);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={star}
        />
      ))}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0a0305] flex flex-col items-center justify-center gap-6">
      <StarField />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="text-5xl animate-pulse">🔭</div>
        <p className="text-white/60 text-sm tracking-widest uppercase animate-pulse">
          Scanning the universe...
        </p>
        <div className="flex gap-1 mt-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-rose-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<ApodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/apod")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Couldn't reach the stars today 🌌");
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingScreen />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0305] flex items-center justify-center">
        <StarField />
        <p className="text-white/60 text-center z-10">{error}</p>
      </div>
    );
  }

  // NASA APOD date is a plain date string (e.g. "2025-05-03"), parse as UTC noon
  // to avoid date shifting, then display in IST
  const formattedDate = new Date(data.date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const shortExplanation =
    data.explanation.length > 300
      ? data.explanation.slice(0, 300) + "..."
      : data.explanation;

  return (
    <div className="min-h-screen bg-[#0a0305] text-white">
      <StarField />

      {/* Header */}
      <header className="relative z-10 pt-12 pb-4 px-5">
        <div className="flex items-center justify-between mb-1">
          <Link
            href="/dashboard"
            className="text-xs text-rose-400 hover:text-rose-300 transition-colors font-medium"
          >
            ← Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white text-center">
          Picture of the Day
        </h1>
        <p className="text-white/40 text-xs mt-1 text-center">{formattedDate}</p>
      </header>

      {/* Image / Video */}
      <div className="relative z-10 mx-4 mt-3 rounded-2xl overflow-hidden shadow-2xl shadow-rose-900/30 border border-white/5">
        {data.media_type === "video" ? (
          <div className="aspect-video w-full">
            <iframe
              src={data.url}
              className="w-full h-full"
              allowFullScreen
              title={data.title}
            />
          </div>
        ) : (
          <div className="relative w-full">
            {!imgLoaded && (
              <div className="w-full h-64 bg-white/5 animate-pulse rounded-2xl" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.hdurl ?? data.url}
              alt={data.title}
              className={`w-full h-auto transition-opacity duration-700 ${
                imgLoaded ? "opacity-100" : "opacity-0 absolute inset-0"
              }`}
              onLoad={() => setImgLoaded(true)}
            />
          </div>
        )}
      </div>

      {/* Title + copyright */}
      <div className="relative z-10 px-5 mt-5">
        <h2 className="text-xl font-bold leading-snug text-white">{data.title}</h2>
        {data.copyright && (
          <p className="text-white/30 text-xs mt-1">
            © {data.copyright.trim()}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="relative z-10 px-5 mt-4 pb-16">
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <p className="text-white/70 text-sm leading-relaxed">
            {expanded ? data.explanation : shortExplanation}
          </p>
          {data.explanation.length > 300 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-3 text-rose-400 text-xs font-semibold tracking-wide hover:text-rose-300 transition-colors"
            >
              {expanded ? "Show less ↑" : "Read more ↓"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
