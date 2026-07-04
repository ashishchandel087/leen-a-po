"use client";

import { useMemo } from "react";

interface Star {
  width: string;
  height: string;
  top: string;
  left: string;
  opacity: number;
  animation: string;
  animationDelay: string;
}

// Deterministic PRNG (mulberry32) — same star layout on server and client,
// so we can generate during render without a hydration mismatch.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function StarField({ count = 60, className = "" }: { count?: number; className?: string }) {
  const stars = useMemo<Star[]>(() => {
    const rand = mulberry32(count * 2654435761);
    return Array.from({ length: count }).map(() => ({
      width: rand() * 2 + 1 + "px",
      height: rand() * 2 + 1 + "px",
      top: rand() * 100 + "%",
      left: rand() * 100 + "%",
      opacity: rand() * 0.7 + 0.3,
      animation: `twinkle ${rand() * 3 + 2}s ease-in-out infinite`,
      animationDelay: rand() * 3 + "s",
    }));
  }, [count]);

  return (
    <div
      aria-hidden
      className={`fixed inset-0 overflow-hidden pointer-events-none z-0 ${className}`}
    >
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
