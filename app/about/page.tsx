"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppHeader from "../components/AppHeader";
import LoadingScreen from "../components/LoadingScreen";
import { ArrowRight } from "../components/Icons";

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
  ruling: "Mars",
  rulingEmoji: "🔴",
  modality: "Cardinal",
  moonSign: "Leo",
  moonEmoji: "🦁",
  birthdayMoon: { phase: "Waxing Crescent", emoji: "🌒", illumination: "14.64%" },
  traits: ["Intuitive", "Nurturing", "Loyal", "Protective", "Empathetic"],
  desc: "Ruled by the Moon, Cancers feel deeply and love fiercely. Ashish carries a quiet strength — protective of those he loves and deeply in tune with emotions around him.",
  gradient: "from-pink-950 to-rose-950",
  border: "border-pink-500/25",
  accent: "text-pink-300",
  tagBg: "bg-pink-900/40 text-pink-300",
};

const LEENA: Person = {
  name: "Leena",
  birthdate: "October 25, 1999",
  sign: "Scorpio",
  symbol: "♏",
  emoji: "🦂",
  element: "Water",
  elementEmoji: "💧",
  ruling: "Neptune",
  rulingEmoji: "🔵",
  modality: "Fixed",
  moonSign: "Taurus",
  moonEmoji: "🐂",
  birthdayMoon: { phase: "Full Moon", emoji: "🌕", illumination: "98.84%" },
  traits: ["Passionate", "Mysterious", "Loyal", "Determined", "Magnetic"],
  desc: "Scorpios are the most intense and magnetic of the water signs. Leena loves completely and fiercely — her loyalty runs deeper than words, and her presence is impossible to ignore.",
  gradient: "from-rose-950 to-red-950",
  border: "border-rose-600/30",
  accent: "text-rose-300",
  tagBg: "bg-rose-900/40 text-rose-300",
};

const COMPAT = [
  { icon: "💧", label: "Both Water signs", desc: "You share the same emotional language — deep, intuitive, and feeling-first." },
  { icon: "🌊", label: "Tidal pull", desc: "Cancer's gentle waves meet Scorpio's ocean depth. You move each other without even trying." },
  { icon: "🔒", label: "Fierce loyalty", desc: "Neither of you loves halfway. When you're in, you're all in — and you both know it." },
  { icon: "🌙", label: "Moon connection", desc: "Cancer is ruled by the Moon — emotion, cycles, home. Scorpio feels everything the Moon brings." },
];

/* ── Mini rotating planet for cards ── */
function MiniPlanetCanvas({
  fallbackColor,
  textureUrls,
  ambientColor,
  sunColor,
  sunIntensity,
  rotateSpeed,
}: {
  fallbackColor: number;
  textureUrls: string[];
  ambientColor: number;
  sunColor: number;
  sunIntensity: number;
  rotateSpeed: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let animId: number;
    let rendererRef: import("three").WebGLRenderer | null = null;
    let alive = true;

    (async () => {
      const THREE = await import("three");
      if (!alive || !mount) return;

      const scene = new THREE.Scene();

      const W = mount.clientWidth  || 200;
      const H = mount.clientHeight || 200;
      const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
      camera.position.z = 2.4;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      rendererRef = renderer;
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);   // transparent bg — card colour shows through
      mount.appendChild(renderer.domElement);

      const mat = new THREE.MeshPhongMaterial({ color: fallbackColor, shininess: 6 });

      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      function tryLoad(urls: string[]) {
        if (!urls.length) return;
        loader.load(urls[0], (tex) => {
          mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
        }, undefined, () => tryLoad(urls.slice(1)));
      }
      tryLoad(textureUrls);

      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), mat);
      scene.add(sphere);

      scene.add(new THREE.AmbientLight(ambientColor, 2.5));
      const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
      sun.position.set(3, 1, 2);
      scene.add(sun);

      function onResize() {
        if (!mount) return;
        const w = mount.clientWidth, h = mount.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
      window.addEventListener("resize", onResize);

      function animate() {
        if (!alive) return;
        animId = requestAnimationFrame(animate);
        sphere.rotation.y += rotateSpeed;
        renderer.render(scene, camera);
      }
      animate();
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(animId);
      if (rendererRef && mount.contains(rendererRef.domElement)) {
        mount.removeChild(rendererRef.domElement);
        rendererRef.dispose();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="w-full h-full absolute inset-0" />;
}

/* ── Moon meeting animation (horizontal) ── */
function MoonMeetCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    // Scale moon size to fit — max 180px but shrink on narrow screens
    // Each moon takes ~half the width, keep padding on both sides
    const CW = wrap.clientWidth || 300;
    const imgSize = Math.min(180, Math.floor(CW * 0.38));
    const labelPad = 36; // space above for name + below for date
    const CH = imgSize + labelPad * 2;

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

    // Stop when both moons are fully on screen, side by side at center
    const threshold = Math.floor(CW / 2);

    function drawStill() {
      // draw moons at resting (met) position
      ctx.clearRect(0, 0, CW, CH);
      const nameFontSize = Math.max(11, Math.floor(imgSize * 0.1));
      const dateFontSize = Math.max(10, Math.floor(imgSize * 0.085));
      ctx.textAlign = "center";
      for (const item of items) {
        ctx.drawImage(item.img, item.x, item.y, item.width, item.height);
        ctx.font = `bold ${nameFontSize}px Arial`;
        ctx.fillStyle = "white";
        ctx.fillText(item.name, item.x + imgSize / 2, item.y - 10);
        ctx.font = `${dateFontSize}px Arial`;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(item.text, item.x + imgSize / 2, item.y + imgSize + 18);
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
    <div className={`bg-gradient-to-b ${person.gradient} border ${person.border} rounded-2xl overflow-hidden shadow-xl shadow-black/40 flex flex-col transition-transform hover:-translate-y-0.5`}>
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{person.name}</h2>
            <p className="text-white/65 text-xs">{person.birthdate}</p>
          </div>
          <span className="text-4xl animate-float-slow">{person.emoji}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className={`text-4xl font-black ${person.accent}`}>{person.symbol}</div>
          <div>
            <p className={`font-semibold text-sm ${person.accent}`}>{person.sign}</p>
            <p className="text-white/65 text-xs">{person.modality} · {person.element} {person.elementEmoji}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/10 rounded-xl px-3 py-2 border border-white/5">
            <p className="text-white/70 text-[11px] mb-0.5 uppercase tracking-wider">Ruling Planet</p>
            <p className="text-white text-sm font-medium">{person.rulingEmoji} {person.ruling}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2 border border-white/5">
            <p className="text-white/70 text-[11px] mb-0.5 uppercase tracking-wider">Moon Sign</p>
            <p className="text-white text-sm font-medium">{person.moonEmoji} {person.moonSign}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {person.traits.map((t) => (
            <span key={t} className={`text-xs px-2.5 py-1 rounded-full font-medium ${person.tagBg}`}>{t}</span>
          ))}
        </div>

        <p className="text-white/75 text-xs leading-relaxed italic border-t border-white/10 pt-3">
          &ldquo;{person.desc}&rdquo;
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
    return <LoadingScreen message="Reading the stars" />;
  }

  return (
    <div className="min-h-screen bg-[#0a0305] text-white relative">
      <div className="aurora" aria-hidden />

      <AppHeader variant="page" title="About Us 🌌" subtitle="Stars, signs &amp; souls" />

      <div className="relative max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Intro */}
        <div className="text-center py-2 animate-fade-up">
          <p className="text-rose-300/80 text-xs tracking-[0.25em] uppercase">Written in the stars</p>
          <p className="text-white/75 text-sm mt-1.5">Two water signs. One story.</p>
        </div>

        {/* ── Moon meeting animation box ── */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <div className="px-5 pt-5 pb-2 text-center">
            <p className="text-xs text-rose-300/80 uppercase tracking-[0.25em]">Birthday Moons</p>
            <p className="text-white/75 text-sm mt-1.5">Finding each other 🌙</p>
          </div>
          <MoonMeetCanvas />
        </div>

        {/* ── Planet Explorer ── */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <p className="text-xs text-rose-300/80 uppercase tracking-[0.25em] mb-1 text-center">Ruling Planet</p>
          <p className="text-white/65 text-sm text-center mb-5">Tap a planet to explore</p>
          <div className="grid grid-cols-2 gap-3">

            {/* Mars card */}
            <Link href="/mars" className="group block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 rounded-2xl">
              <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 group-hover:border-rose-400/50 group-hover:bg-white/[0.07] group-hover:shadow-lg group-hover:shadow-rose-700/20">
                <div className="h-36 relative pointer-events-none">
                  <MiniPlanetCanvas
                    fallbackColor={0xc1440e}
                    textureUrls={[
                      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/mars_1k_color.jpg",
                      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/OSIRIS_Mars_true_color.jpg/1024px-OSIRIS_Mars_true_color.jpg",
                    ]}
                    ambientColor={0x1a0505}
                    sunColor={0xffe8d0}
                    sunIntensity={3.5}
                    rotateSpeed={0.006}
                  />
                </div>
                <div className="px-4 py-3 border-t border-white/5">
                  <p className="font-semibold text-sm text-white">Ashish</p>
                  <p className="text-white/65 text-xs mt-0.5">Mars 🔴 · The Red Planet</p>
                  <p className="text-rose-300 text-xs mt-2 font-medium flex items-center gap-1 group-hover:text-rose-200 transition-colors">
                    Explore <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </p>
                </div>
              </div>
            </Link>

            {/* Neptune card */}
            <Link href="/neptune" className="group block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-2xl">
              <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 group-hover:border-blue-400/50 group-hover:bg-white/[0.07] group-hover:shadow-lg group-hover:shadow-blue-700/20">
                <div className="h-36 relative pointer-events-none">
                  <MiniPlanetCanvas
                    fallbackColor={0x1a6dcc}
                    textureUrls={[
                      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/neptune_1k_color.jpg",
                      "https://upload.wikimedia.org/wikipedia/commons/5/56/Neptune_Full.jpg",
                    ]}
                    ambientColor={0x050a1a}
                    sunColor={0xc0d8ff}
                    sunIntensity={1.8}
                    rotateSpeed={0.008}
                  />
                </div>
                <div className="px-4 py-3 border-t border-white/5">
                  <p className="font-semibold text-sm text-white">Leena</p>
                  <p className="text-white/65 text-xs mt-0.5">Neptune 🔵 · The Ice Giant</p>
                  <p className="text-blue-300 text-xs mt-2 font-medium flex items-center gap-1 group-hover:text-blue-200 transition-colors">
                    Explore <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </p>
                </div>
              </div>
            </Link>

          </div>
        </div>

        {/* Profile cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger">
          <div className="animate-fade-up"><PersonCard person={ASHISH} /></div>
          <div className="animate-fade-up"><PersonCard person={LEENA} /></div>
        </div>

        {/* Compatibility */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <div className="text-center mb-5">
            <p className="text-xs text-rose-300/80 uppercase tracking-[0.25em] mb-2">Compatibility</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl animate-float">🦀</span>
              <span className="text-rose-400/60 text-lg animate-heart-beat">×</span>
              <span className="text-3xl animate-float" style={{ animationDelay: "1s" }}>🦂</span>
            </div>
            <p className="text-white font-semibold text-sm mt-3">Cancer + Scorpio</p>
            <p className="text-white/65 text-xs mt-0.5">Water + Water · A deeply emotional bond</p>
          </div>
          <ul className="flex flex-col gap-3 stagger">
            {COMPAT.map((c) => (
              <li
                key={c.label}
                className="animate-fade-up flex gap-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 transition-colors"
              >
                <span className="text-xl flex-shrink-0">{c.icon}</span>
                <div>
                  <p className="text-white/90 text-xs font-semibold">{c.label}</p>
                  <p className="text-white/65 text-xs mt-0.5 leading-relaxed">{c.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-white/40 text-xs text-center pb-4 italic">
          ~ Moon signs are approximate without exact birth time &amp; location ~
        </p>
      </div>
    </div>
  );
}
