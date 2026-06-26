"use client";

import { useEffect, useRef } from "react";
import AppHeader from "../components/AppHeader";

const MARS_FACTS = [
  { label: "Distance from Sun", value: "227.9M km" },
  { label: "Day length",        value: "24h 37m" },
  { label: "Year length",       value: "687 Earth days" },
  { label: "Avg temperature",   value: "−60°C" },
  { label: "Gravity",           value: "3.72 m/s² (38% Earth)" },
  { label: "Diameter",          value: "6,779 km" },
  { label: "Atmosphere",        value: "95% CO₂" },
  { label: "Moons",             value: "2 (Phobos & Deimos)" },
];

const MARS_MOONS = [
  {
    name: "Phobos",
    orbit: "9,376 km",
    period: "7h 39m",
    diameter: "~22 km",
    note: "Closest moon to any planet — will crash into Mars in ~50M years",
    color: "text-orange-300",
    dot: "bg-orange-400",
  },
  {
    name: "Deimos",
    orbit: "23,463 km",
    period: "30h 18m",
    diameter: "~12 km",
    note: "Slowest of Mars's moons — takes longer than a Martian day to orbit",
    color: "text-amber-300",
    dot: "bg-amber-400",
  },
];

export default function MarsPage() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Lighter scene on phones: fewer pixels, fewer polygons, no MSAA. Keeps
    // memory/GPU load down and avoids exhausting the WebGL context budget.
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const PIXEL_CAP = isMobile ? 1.5 : 2;
    const PLANET_SEG = isMobile ? 48 : 64;
    const STAR_COUNT = isMobile ? 1500 : 3000;

    let animId = 0;
    let alive = true;
    // Hoisted so the cleanup function can fully tear everything down.
    let renderer: import("three").WebGLRenderer | null = null;
    let scene: import("three").Scene | null = null;
    let controls: { update: () => void; dispose: () => void } | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let onResize: (() => void) | null = null;
    let onDown: (() => void) | null = null;
    let onUp: (() => void) | null = null;
    let canvas: HTMLCanvasElement | null = null;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (!alive || !mount) return;

      /* ── Scene ── */
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0305);

      /* ── Camera ── */
      const W = mount.clientWidth;
      const H = mount.clientHeight;
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
      camera.position.z = 3.5;

      /* ── Renderer ── */
      renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
      const r = renderer;
      const s = scene;
      r.setSize(W, H);
      r.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_CAP));
      canvas = r.domElement;
      mount.appendChild(r.domElement);

      /* ── Stars ── */
      const starVerts = new Float32Array(STAR_COUNT * 3);
      for (let i = 0; i < starVerts.length; i++) starVerts[i] = (Math.random() - 0.5) * 400;
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starVerts, 3));
      s.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 })));

      /* ── Mars ── */
      const marsMat = new THREE.MeshPhongMaterial({
        color: 0xc1440e,
        shininess: 4,
        specular: new THREE.Color(0x330a00),
      });
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      function tryLoad(urls: string[]) {
        if (!urls.length || !alive) return;
        loader.load(urls[0], (tex) => {
          if (!alive) { tex.dispose(); return; }
          marsMat.map = tex; marsMat.color.set(0xffffff); marsMat.needsUpdate = true;
        }, undefined, () => tryLoad(urls.slice(1)));
      }
      tryLoad([
        "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/mars_1k_color.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/OSIRIS_Mars_true_color.jpg/1024px-OSIRIS_Mars_true_color.jpg",
      ]);
      const mars = new THREE.Mesh(new THREE.SphereGeometry(1, PLANET_SEG, PLANET_SEG), marsMat);
      s.add(mars);

      /* ── Lighting ── */
      s.add(new THREE.AmbientLight(0x1a0505, 3));
      const sun = new THREE.DirectionalLight(0xffe8d0, 3.5);
      sun.position.set(5, 2, 4);
      s.add(sun);

      /* ── Helper: faint orbit ring ── */
      function makeOrbitRing(orbitR: number, incl: number) {
        const pts = [];
        for (let i = 0; i <= 128; i++) {
          const a = (i / 128) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * orbitR, 0, Math.sin(a) * orbitR));
        }
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 })
        );
        line.rotation.x = incl;
        return line;
      }

      /* ── Helper: moon pivot ── */
      function makeMoon(opts: {
        radius: number; orbitR: number; incl: number;
        startAngle: number; color: number;
      }) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(opts.radius, 12, 12),
          new THREE.MeshPhongMaterial({ color: opts.color, shininess: 2 })
        );
        mesh.position.x = opts.orbitR;
        const pivot = new THREE.Object3D();
        pivot.rotation.x = opts.incl;
        pivot.rotation.y = opts.startAngle;
        pivot.add(mesh);
        return pivot;
      }

      /* ── Phobos ── */
      const phobosOrbitR = 1.65;
      const phobosIncl   = 0.017;   // ~1° real inclination
      s.add(makeOrbitRing(phobosOrbitR, phobosIncl));
      const phobosPivot = makeMoon({ radius: 0.04, orbitR: phobosOrbitR, incl: phobosIncl, startAngle: 0,    color: 0x8a7060 });
      s.add(phobosPivot);

      /* ── Deimos ── */
      const deimosOrbitR = 2.15;
      const deimosIncl   = 0.035;   // ~2° real inclination
      s.add(makeOrbitRing(deimosOrbitR, deimosIncl));
      const deimosPivot = makeMoon({ radius: 0.027, orbitR: deimosOrbitR, incl: deimosIncl, startAngle: Math.PI * 0.75, color: 0x9a8878 });
      s.add(deimosPivot);

      /* ── Controls ── */
      const orbit = new OrbitControls(camera, r.domElement);
      controls = orbit;
      orbit.enableDamping   = true;
      orbit.dampingFactor   = 0.06;
      orbit.minDistance     = 1.8;
      orbit.maxDistance     = 7;
      orbit.autoRotate      = true;
      orbit.autoRotateSpeed = 0.45;

      onDown = () => { orbit.autoRotate = false; if (idleTimer) clearTimeout(idleTimer); };
      onUp   = () => { idleTimer = setTimeout(() => { orbit.autoRotate = true; }, 3000); };
      r.domElement.addEventListener("pointerdown", onDown);
      r.domElement.addEventListener("pointerup",   onUp);

      /* ── Resize ── */
      onResize = () => {
        if (!mount) return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        r.setSize(mount.clientWidth, mount.clientHeight);
      };
      window.addEventListener("resize", onResize);

      /* ── Loop ── */
      function animate() {
        if (!alive) return;
        animId = requestAnimationFrame(animate);
        phobosPivot.rotation.y += 0.024;   // fast — Phobos orbits in ~7.6h
        deimosPivot.rotation.y += 0.008;   // slower — Deimos takes ~30h
        orbit.update();
        r.render(s, camera);
      }
      animate();
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(animId);
      if (idleTimer) clearTimeout(idleTimer);
      if (onResize) window.removeEventListener("resize", onResize);
      if (canvas) {
        if (onDown) canvas.removeEventListener("pointerdown", onDown);
        if (onUp) canvas.removeEventListener("pointerup", onUp);
      }
      controls?.dispose();
      // Free every geometry / material / texture so the GPU memory is released.
      scene?.traverse((obj) => {
        const o = obj as unknown as {
          geometry?: { dispose?: () => void };
          material?: unknown;
        };
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats as Array<{ map?: { dispose?: () => void }; dispose?: () => void }>) {
          m.map?.dispose?.();
          m.dispose?.();
        }
      });
      if (renderer) {
        renderer.dispose();
        // forceContextLoss releases the underlying WebGL context immediately —
        // dispose() alone often doesn't on mobile, leaking contexts until the
        // browser's per-tab cap is hit and the page crashes.
        renderer.forceContextLoss();
        if (canvas && mount.contains(canvas)) mount.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0305] text-white flex flex-col">
      <AppHeader variant="page" title="Mars 🔴" subtitle="The Red Planet · drag & scroll to explore" backHref="/about" />

      <div ref={mountRef} className="w-full" style={{ height: "60vh", minHeight: 320 }} />

      <div className="max-w-lg mx-auto w-full px-4 pb-10 pt-2 flex flex-col gap-4">

        {/* Planet facts */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <p className="text-xs text-rose-300/80 uppercase tracking-[0.25em] mb-4 text-center">Mars at a Glance</p>
          <div className="grid grid-cols-2 gap-2 stagger">
            {MARS_FACTS.map((f) => (
              <div key={f.label} className="animate-fade-up bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded-xl px-3 py-2.5 transition-colors">
                <p className="text-white/65 text-xs">{f.label}</p>
                <p className="text-white text-sm font-medium mt-0.5">{f.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Moons */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <p className="text-xs text-rose-300/80 uppercase tracking-[0.25em] mb-4 text-center">Moons of Mars 🌑</p>
          <div className="flex flex-col gap-3 stagger">
            {MARS_MOONS.map((m) => (
              <div key={m.name} className="animate-fade-up bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded-xl px-4 py-3 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
                  <p className={`font-semibold text-sm ${m.color}`}>{m.name}</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  <div>
                    <p className="text-white/55 text-xs">Orbit</p>
                    <p className="text-white/90 text-xs font-medium">{m.orbit}</p>
                  </div>
                  <div>
                    <p className="text-white/55 text-xs">Period</p>
                    <p className="text-white/90 text-xs font-medium">{m.period}</p>
                  </div>
                  <div>
                    <p className="text-white/55 text-xs">Diameter</p>
                    <p className="text-white/90 text-xs font-medium">{m.diameter}</p>
                  </div>
                </div>
                <p className="text-white/65 text-xs italic">{m.note}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/45 text-xs text-center pb-2">Data: NASA Mars Exploration Program</p>
      </div>
    </div>
  );
}
