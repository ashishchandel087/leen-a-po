"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

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

    let animId: number;
    let rendererRef: import("three").WebGLRenderer | null = null;
    let alive = true;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (!alive || !mount) return;

      /* ── Scene ── */
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0305);

      /* ── Camera ── */
      const W = mount.clientWidth;
      const H = mount.clientHeight;
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
      camera.position.z = 3.5;

      /* ── Renderer ── */
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      rendererRef = renderer;
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mount.appendChild(renderer.domElement);

      /* ── Stars ── */
      const starVerts = new Float32Array(3000 * 3);
      for (let i = 0; i < starVerts.length; i++) starVerts[i] = (Math.random() - 0.5) * 400;
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starVerts, 3));
      scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 })));

      /* ── Mars ── */
      const marsMat = new THREE.MeshPhongMaterial({
        color: 0xc1440e,
        shininess: 4,
        specular: new THREE.Color(0x330a00),
      });
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      function tryLoad(urls: string[]) {
        if (!urls.length) return;
        loader.load(urls[0], (tex) => {
          marsMat.map = tex; marsMat.color.set(0xffffff); marsMat.needsUpdate = true;
        }, undefined, () => tryLoad(urls.slice(1)));
      }
      tryLoad([
        "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/mars_1k_color.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/OSIRIS_Mars_true_color.jpg/1024px-OSIRIS_Mars_true_color.jpg",
      ]);
      const mars = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), marsMat);
      scene.add(mars);

      /* ── Lighting ── */
      scene.add(new THREE.AmbientLight(0x1a0505, 3));
      const sun = new THREE.DirectionalLight(0xffe8d0, 3.5);
      sun.position.set(5, 2, 4);
      scene.add(sun);

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
      scene.add(makeOrbitRing(phobosOrbitR, phobosIncl));
      const phobosPivot = makeMoon({ radius: 0.04, orbitR: phobosOrbitR, incl: phobosIncl, startAngle: 0,    color: 0x8a7060 });
      scene.add(phobosPivot);

      /* ── Deimos ── */
      const deimosOrbitR = 2.15;
      const deimosIncl   = 0.035;   // ~2° real inclination
      scene.add(makeOrbitRing(deimosOrbitR, deimosIncl));
      const deimosPivot = makeMoon({ radius: 0.027, orbitR: deimosOrbitR, incl: deimosIncl, startAngle: Math.PI * 0.75, color: 0x9a8878 });
      scene.add(deimosPivot);

      /* ── Controls ── */
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping   = true;
      controls.dampingFactor   = 0.06;
      controls.minDistance     = 1.8;
      controls.maxDistance     = 7;
      controls.autoRotate      = true;
      controls.autoRotateSpeed = 0.45;

      let idleTimer: ReturnType<typeof setTimeout>;
      renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate = false; clearTimeout(idleTimer); });
      renderer.domElement.addEventListener("pointerup",   () => { idleTimer = setTimeout(() => { controls.autoRotate = true; }, 3000); });

      /* ── Resize ── */
      function onResize() {
        if (!mount) return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
      }
      window.addEventListener("resize", onResize);

      /* ── Loop ── */
      function animate() {
        if (!alive) return;
        animId = requestAnimationFrame(animate);
        phobosPivot.rotation.y += 0.024;   // fast — Phobos orbits in ~7.6h
        deimosPivot.rotation.y += 0.008;   // slower — Deimos takes ~30h
        controls.update();
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
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0305] text-white flex flex-col">
      <header className="sticky top-0 z-20 bg-[#0a0305]/80 backdrop-blur border-b border-white/10 px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold">Mars 🔴</h1>
          <p className="text-white/40 text-xs">The Red Planet · drag &amp; scroll to explore</p>
        </div>
        <Link href="/dashboard" className="text-white/40 text-xs hover:text-white/60">← Dashboard</Link>
      </header>

      <div ref={mountRef} className="w-full" style={{ height: "60vh", minHeight: 320 }} />

      <div className="max-w-lg mx-auto w-full px-4 pb-10 pt-2 flex flex-col gap-4">

        {/* Planet facts */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p className="text-xs text-white/30 uppercase tracking-widest mb-4 text-center">Mars at a Glance</p>
          <div className="grid grid-cols-2 gap-2">
            {MARS_FACTS.map((f) => (
              <div key={f.label} className="bg-white/5 rounded-xl px-3 py-2.5">
                <p className="text-white/40 text-xs">{f.label}</p>
                <p className="text-white text-sm font-medium mt-0.5">{f.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Moons */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p className="text-xs text-white/30 uppercase tracking-widest mb-4 text-center">Moons of Mars 🌑</p>
          <div className="flex flex-col gap-3">
            {MARS_MOONS.map((m) => (
              <div key={m.name} className="bg-white/5 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
                  <p className={`font-semibold text-sm ${m.color}`}>{m.name}</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  <div>
                    <p className="text-white/30 text-xs">Orbit</p>
                    <p className="text-white/80 text-xs font-medium">{m.orbit}</p>
                  </div>
                  <div>
                    <p className="text-white/30 text-xs">Period</p>
                    <p className="text-white/80 text-xs font-medium">{m.period}</p>
                  </div>
                  <div>
                    <p className="text-white/30 text-xs">Diameter</p>
                    <p className="text-white/80 text-xs font-medium">{m.diameter}</p>
                  </div>
                </div>
                <p className="text-white/40 text-xs italic">{m.note}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/20 text-xs text-center pb-2">Data: NASA Mars Exploration Program</p>
      </div>
    </div>
  );
}
