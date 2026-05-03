"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

const NEPTUNE_FACTS = [
  { label: "Distance from Sun", value: "4.495B km" },
  { label: "Day length",        value: "16h 6m" },
  { label: "Year length",       value: "165 Earth years" },
  { label: "Avg temperature",   value: "−214°C" },
  { label: "Gravity",           value: "11.15 m/s² (114% Earth)" },
  { label: "Diameter",          value: "49,528 km" },
  { label: "Atmosphere",        value: "H₂, He, CH₄" },
  { label: "Moons",             value: "16 known" },
];

const NEPTUNE_MOONS = [
  {
    name: "Triton",
    orbit: "354,759 km",
    period: "5.88 days",
    diameter: "2,707 km",
    note: "Only large moon with a retrograde orbit — it orbits backwards. Slowly spiralling inward.",
    color: "text-cyan-300",
    dot: "bg-cyan-400",
    extra: "Retrograde ↺",
  },
  {
    name: "Proteus",
    orbit: "117,647 km",
    period: "1.12 days",
    diameter: "~420 km",
    note: "One of the darkest objects in the solar system — reflects only 10% of sunlight.",
    color: "text-blue-300",
    dot: "bg-blue-400",
    extra: null,
  },
  {
    name: "Nereid",
    orbit: "5,513,818 km",
    period: "360 days",
    diameter: "~340 km",
    note: "Has the most eccentric orbit of any moon — almost comet-like in its elliptical path.",
    color: "text-indigo-300",
    dot: "bg-indigo-400",
    extra: "Highly elliptical",
  },
];

export default function NeptunePage() {
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
      camera.position.z = 3.8;

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

      /* ── Neptune ── */
      const neptuneMat = new THREE.MeshPhongMaterial({
        color: 0x1a6dcc,
        shininess: 10,
        specular: new THREE.Color(0x0a1a4d),
      });
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      function tryLoad(urls: string[]) {
        if (!urls.length) return;
        loader.load(urls[0], (tex) => {
          neptuneMat.map = tex; neptuneMat.color.set(0xffffff); neptuneMat.needsUpdate = true;
        }, undefined, () => tryLoad(urls.slice(1)));
      }
      tryLoad([
        "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/neptune_1k_color.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/5/56/Neptune_Full.jpg",
      ]);
      const neptune = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), neptuneMat);
      scene.add(neptune);

      /* ── Lighting — distant, cool sun ── */
      scene.add(new THREE.AmbientLight(0x050a1a, 4));
      const sun = new THREE.DirectionalLight(0xc0d8ff, 1.8);
      sun.position.set(5, 2, 4);
      scene.add(sun);

      /* ── Helper: faint orbit ring ── */
      function makeOrbitRing(orbitR: number, inclX: number, inclZ = 0) {
        const pts = [];
        for (let i = 0; i <= 128; i++) {
          const a = (i / 128) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * orbitR, 0, Math.sin(a) * orbitR));
        }
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.12 })
        );
        line.rotation.x = inclX;
        line.rotation.z = inclZ;
        return line;
      }

      /* ── Helper: moon pivot ── */
      function makeMoon(opts: {
        radius: number; orbitR: number; inclX: number;
        startAngle: number; color: number;
      }) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(opts.radius, 14, 14),
          new THREE.MeshPhongMaterial({ color: opts.color, shininess: 3 })
        );
        mesh.position.x = opts.orbitR;
        const pivot = new THREE.Object3D();
        pivot.rotation.x = opts.inclX;
        pivot.rotation.y = opts.startAngle;
        pivot.add(mesh);
        return pivot;
      }

      /* ── Triton — retrograde, highly inclined (~157°) ── */
      // Retrograde = negative speed; inclination ~2.74 rad (157°) makes it orbit "upside-down"
      const tritonOrbitR = 1.7;
      const tritonInclX  = 2.74;  // 157° — retrograde inclination
      scene.add(makeOrbitRing(tritonOrbitR, tritonInclX));
      const tritonPivot = makeMoon({ radius: 0.065, orbitR: tritonOrbitR, inclX: tritonInclX, startAngle: 0.5, color: 0x8ab8cc });
      scene.add(tritonPivot);

      /* ── Proteus — prograde, near equatorial ── */
      const proteusOrbitR = 2.1;
      const proteusInclX  = 0.03;
      scene.add(makeOrbitRing(proteusOrbitR, proteusInclX));
      const proteusPivot = makeMoon({ radius: 0.038, orbitR: proteusOrbitR, inclX: proteusInclX, startAngle: Math.PI * 0.6, color: 0x4a4a5a });
      scene.add(proteusPivot);

      /* ── Nereid — distant, highly inclined eccentric orbit ── */
      const nereidOrbitR = 2.7;
      const nereidInclX  = 0.95;  // ~55° inclination
      scene.add(makeOrbitRing(nereidOrbitR, nereidInclX));
      const nereidPivot = makeMoon({ radius: 0.022, orbitR: nereidOrbitR, inclX: nereidInclX, startAngle: Math.PI * 1.3, color: 0x7a8899 });
      scene.add(nereidPivot);

      /* ── Controls ── */
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping   = true;
      controls.dampingFactor   = 0.06;
      controls.minDistance     = 1.8;
      controls.maxDistance     = 8;
      controls.autoRotate      = true;
      controls.autoRotateSpeed = 0.35;

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
        tritonPivot.rotation.y  -= 0.014;   // retrograde — negative direction ↺
        proteusPivot.rotation.y += 0.02;    // fast prograde
        nereidPivot.rotation.y  += 0.003;   // very slow — 360-day orbit
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
          <h1 className="font-bold">Neptune 🔵</h1>
          <p className="text-white/40 text-xs">The Ice Giant · drag &amp; scroll to explore</p>
        </div>
        <Link href="/dashboard" className="text-white/40 text-xs hover:text-white/60">← Dashboard</Link>
      </header>

      <div ref={mountRef} className="w-full" style={{ height: "60vh", minHeight: 320 }} />

      <div className="max-w-lg mx-auto w-full px-4 pb-10 pt-2 flex flex-col gap-4">

        {/* Planet facts */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p className="text-xs text-white/30 uppercase tracking-widest mb-4 text-center">Neptune at a Glance</p>
          <div className="grid grid-cols-2 gap-2">
            {NEPTUNE_FACTS.map((f) => (
              <div key={f.label} className="bg-white/5 rounded-xl px-3 py-2.5">
                <p className="text-white/40 text-xs">{f.label}</p>
                <p className="text-white text-sm font-medium mt-0.5">{f.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Moons */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p className="text-xs text-white/30 uppercase tracking-widest mb-4 text-center">Major Moons of Neptune 🌑</p>
          <div className="flex flex-col gap-3">
            {NEPTUNE_MOONS.map((m) => (
              <div key={m.name} className="bg-white/5 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
                  <p className={`font-semibold text-sm ${m.color}`}>{m.name}</p>
                  {m.extra && (
                    <span className="ml-auto text-xs bg-white/10 text-white/50 px-2 py-0.5 rounded-full">{m.extra}</span>
                  )}
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

        <p className="text-white/20 text-xs text-center pb-2">Data: NASA Solar System Exploration</p>
      </div>
    </div>
  );
}
