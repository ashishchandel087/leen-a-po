"use client";

import { useEffect, useState } from "react";
import StarField from "../components/StarField";
import LoadingScreen from "../components/LoadingScreen";
import AppHeader from "../components/AppHeader";

interface ApodData {
  title: string;
  date: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: string;
  copyright?: string;
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

  if (loading) return <LoadingScreen message="Scanning the universe" />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0305] flex items-center justify-center">
        <StarField count={50} />
        <p className="text-white/75 text-center z-10 px-6">{error}</p>
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
    <div className="min-h-screen bg-[#0a0305] text-white relative">
      <StarField count={70} />

      <AppHeader variant="page" title="Picture of the Day" subtitle={formattedDate} />

      <div className="relative max-w-2xl mx-auto pb-16">
        {/* Image / Video */}
        <div className="relative z-10 mx-4 mt-5 rounded-2xl overflow-hidden shadow-2xl shadow-rose-900/30 border border-white/10 animate-fade-up">
          {data.media_type === "video" ? (
            <div className="aspect-video w-full">
              {/\.(mp4|webm|ogg)(\?.*)?$/i.test(data.url) ? (
                <video
                  src={data.url}
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  title={data.title}
                />
              ) : (
                <iframe
                  src={data.url}
                  className="w-full h-full"
                  allowFullScreen
                  title={data.title}
                />
              )}
            </div>
          ) : (
            <div className="relative w-full">
              {!imgLoaded && (
                <div className="w-full h-64 skeleton rounded-2xl" />
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
        <div className="relative z-10 px-5 mt-5 animate-fade-up">
          <h2 className="text-xl font-bold leading-snug text-white">{data.title}</h2>
          {data.copyright && (
            <p className="text-white/55 text-xs mt-1">
              © {data.copyright.trim()}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="relative z-10 px-5 mt-4 animate-fade-up">
          <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-5 border border-white/10 shadow-xl shadow-black/30">
            <p className="text-white/85 text-sm leading-relaxed">
              {expanded ? data.explanation : shortExplanation}
            </p>
            {data.explanation.length > 300 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-3 px-3 py-2 -mx-1 text-rose-300 text-xs font-semibold tracking-wide hover:text-rose-200 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 rounded-lg"
              >
                {expanded ? "Show less ↑" : "Read more ↓"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
