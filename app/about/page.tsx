"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Person {
  name: string;
  birthdate: string;
  sign: string;
  symbol: string;
  emoji: string;
  element: string;
  elementEmoji: string;
  ruling: string;
  rulingEmoji: string;
  modality: string;
  moonSign: string;
  moonEmoji: string;
  birthdayMoon: { phase: string; emoji: string; illumination: string };
  traits: string[];
  desc: string;
  gradient: string;
  border: string;
  accent: string;
  tagBg: string;
}

const ASHISH: Person = {
  name: "Ashish",
  birthdate: "June 27, 1998",
  sign: "Cancer",
  symbol: "♋",
  emoji: "🦀",
  element: "Water",
  elementEmoji: "💧",
  ruling: "Moon",
  rulingEmoji: "🌙",
  modality: "Cardinal",
  moonSign: "Leo",
  moonEmoji: "🦁",
  birthdayMoon: { phase: "Waxing Crescent", emoji: "🌒", illumination: "14.64%" },
  traits: ["Intuitive", "Nurturing", "Loyal", "Protective", "Empathetic"],
  desc: "Ruled by the Moon, Cancers feel deeply and love fiercely. Ashish carries a quiet strength — protective of those he loves and deeply in tune with emotions around him.",
  gradient: "from-sky-950 to-blue-950",
  border: "border-sky-500/25",
  accent: "text-sky-300",
  tagBg: "bg-sky-900/40 text-sky-300",
};

const LEENA: Person = {
  name: "Leena",
  birthdate: "October 25, 1999",
  sign: "Scorpio",
  symbol: "♏",
  emoji: "🦂",
  element: "Water",
  elementEmoji: "💧",
  ruling: "Pluto & Mars",
  rulingEmoji: "♇",
  modality: "Fixed",
  moonSign: "Taurus",
  moonEmoji: "🐂",
  birthdayMoon: { phase: "Full Moon", emoji: "🌕", illumination: "98.84%" },
  traits: ["Passionate", "Mysterious", "Loyal", "Determined", "Magnetic"],
  desc: "Scorpios are the most intense and magnetic of the water signs. Leena loves completely and fiercely — her loyalty runs deeper than words, and her presence is impossible to ignore.",
  gradient: "from-purple-950 to-rose-950",
  border: "border-purple-500/25",
  accent: "text-purple-300",
  tagBg: "bg-purple-900/40 text-purple-300",
};

const COMPAT = [
  { icon: "💧", label: "Both Water signs", desc: "You share the same emotional language — deep, intuitive, and feeling-first." },
  { icon: "🌊", label: "Tidal pull", desc: "Cancer's gentle waves meet Scorpio's ocean depth. You move each other without even trying." },
  { icon: "🔒", label: "Fierce loyalty", desc: "Neither of you loves halfway. When you're in, you're all in — and you both know it." },
  { icon: "🌙", label: "Moon connection", desc: "Cancer is ruled by the Moon — emotion, cycles, home. Scorpio feels everything the Moon brings." },
];

/* ── Moon meeting animation (horizontal) ── */
function MoonMeetCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    const imgSize = 180;
    const CH = imgSize + 60; // a bit of room above/below for the date labels
    const CW = Math.max(wrap.clientWidth, imgSize * 2 + 40);

    canvas.width  = CW;
    canvas.height = CH;

    const midY = CH / 2 - imgSize / 2;

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    type Item = {
      url: string; text: string; name: string;
      x: number; y: number;
      width: number; height: number;
      fromLeft: boolean; img: HTMLImageElement;
    };

    const items: Item[] = [
      { url: "https://phasesmoon.com//moonpng/trans160/lunarphase4.png",  text: "27.06.1998", name: "Ashish", x: -imgSize, y: midY, width: imgSize, height: imgSize, fromLeft: true,  img: new window.Image() },
      { url: "https://phasesmoon.com//moonpng/trans160/lunarphase28.png", text: "25.10.1999", name: "Leena",  x: CW,       y: midY, width: imgSize, height: imgSize, fromLeft: false, img: new window.Image() },
    ];

    let rafId: number;
    let pos = 0;
    let alive = true;
    let played = false;

    const threshold = CW / 2 - imgSize / 2;

    function drawStill() {
      // draw moons at resting (met) position
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.font = "bold 15px Arial";
      for (const item of items) {
        ctx.drawImage(item.img, item.x, item.y, item.width, item.height);
        ctx.fillText(item.name, item.x + imgSize / 2, item.y - 20);
        ctx.font = "13px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(item.text, item.x + imgSize / 2, item.y + imgSize + 18);
        ctx.font = "bold 15px Arial";
        ctx.fillStyle = "white";
      }
    }

    function animate() {
      if (!alive) return;
      ctx.clearRect(0, 0, CW, CH);
      pos++;
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.font = "bold 15px Arial";
      for (const item of items) {
        item.x += item.fromLeft ? 1 : -1;
        ctx.drawImage(item.img, item.x, item.y, item.width, item.height);
        ctx.fillText(item.name, item.x + imgSize / 2, item.y - 20);
        ctx.font = "13px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(item.text, item.x + imgSize / 2, item.y + imgSize + 18);
        ctx.font = "bold 15px Arial";
        ctx.fillStyle = "white";
      }
      if (pos < threshold) {
        rafId = requestAnimationFrame(animate);
      } else {
        drawStill(); // lock in final position, stop forever
      }
    }

    function startOnce() {
      if (played) { drawStill(); return; }
      played = true;
      animate();
    }

    let loaded = 0;
    let imagesReady = false;

    // Use IntersectionObserver — play only when visible, only once
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && imagesReady) startOnce();
      },
      { threshold: 0.3 }
    );
    observer.observe(canvas);

    for (const item of items) {
      item.img.onload = () => {
        if (++loaded === items.length) {
          imagesReady = true;
          // if already visible, start immediately
          const rect = canvas.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) startOnce();
        }
      };
      item.img.src = item.url;
    }

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="w-full">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}

/* ── Person card ── */
function PersonCard({ person }: { person: Person }) {
  return (
    <div className={`bg-gradient-to-b ${person.gradient} border ${person.border} rounded-2xl overflow-hidden shadow-xl flex flex-col`}>
      {/* Details */}
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{person.name}</h2>
            <p className="text-white/40 text-xs">{person.birthdate}</p>
          </div>
          <span className="text-4xl">{person.emoji}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className={`text-4xl font-black ${person.accent}`}>{person.symbol}</div>
          <div>
            <p className={`font-semibold text-sm ${person.accent}`}>{person.sign}</p>
            <p className="text-white/40 text-xs">{person.modality} · {person.element} {person.elementEmoji}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/5 rounded-xl px-3 py-2">
            <p className="text-white/40 text-xs mb-0.5">Ruling Planet</p>
            <p className="text-white text-sm font-medium">{person.rulingEmoji} {person.ruling}</p>
          </div>
          <div className="bg-white/5 rounded-xl px-3 py-2">
            <p className="text-white/40 text-xs mb-0.5">Moon Sign ~</p>
            <p className="text-white text-sm font-medium">{person.moonEmoji} {person.moonSign}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {person.traits.map((t) => (
            <span key={t} className={`text-xs px-2.5 py-1 rounded-full ${person.tagBg}`}>{t}</span>
          ))}
        </div>

        <p className="text-white/50 text-xs leading-relaxed italic border-t border-white/10 pt-3">
          "{person.desc}"
        </p>
      </div>
    </div>
  );
}

/* ── Page ── */
export default function AboutPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading") {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white/40 animate-pulse">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/10 px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold">About Us 🌌</h1>
          <p className="text-white/40 text-xs">Stars, signs &amp; souls</p>
        </div>
        <Link href="/dashboard" className="text-white/40 text-xs hover:text-white/60">← Dashboard</Link>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Intro */}
        <div className="text-center py-2">
          <p className="text-white/30 text-xs tracking-widest uppercase">Written in the stars</p>
          <p className="text-white/60 text-sm mt-1">Two water signs. One story.</p>
        </div>

        {/* ── Moon meeting animation box ── */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-2 text-center">
            <p className="text-xs text-white/30 uppercase tracking-widest">Birthday Moons</p>
            <p className="text-white/60 text-sm mt-1">Finding each other 🌙</p>
          </div>
          <MoonMeetCanvas />
        </div>

        {/* Profile cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PersonCard person={ASHISH} />
          <PersonCard person={LEENA} />
        </div>

        {/* Compatibility */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="text-center mb-5">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-1">Compatibility</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl">🦀</span>
              <span className="text-white/30 text-lg">×</span>
              <span className="text-2xl">🦂</span>
            </div>
            <p className="text-white font-semibold text-sm mt-2">Cancer + Scorpio</p>
            <p className="text-white/40 text-xs">Water + Water · A deeply emotional bond</p>
          </div>
          <div className="flex flex-col gap-3">
            {COMPAT.map((c) => (
              <div key={c.label} className="flex gap-3 bg-white/5 rounded-xl px-4 py-3">
                <span className="text-xl flex-shrink-0">{c.icon}</span>
                <div>
                  <p className="text-white/80 text-xs font-semibold">{c.label}</p>
                  <p className="text-white/40 text-xs mt-0.5">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/20 text-xs text-center pb-4">
          ~ Moon signs are approximate without exact birth time &amp; location ~
        </p>
      </div>
    </div>
  );
}
