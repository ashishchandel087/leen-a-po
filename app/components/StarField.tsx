"use client";

import { useEffect, useState } from "react";

interface Star {
  width: string;
  height: string;
  top: string;
  left: string;
  opacity: number;
  animation: string;
  animationDelay: string;
}

export default function StarField({ count = 60, className = "" }: { count?: number; className?: string }) {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    const generated = Array.from({ length: count }).map(() => ({
      width: Math.random() * 2 + 1 + "px",
      height: Math.random() * 2 + 1 + "px",
      top: Math.random() * 100 + "%",
      left: Math.random() * 100 + "%",
      opacity: Math.random() * 0.7 + 0.3,
      animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
      animationDelay: Math.random() * 3 + "s",
    }));
    setStars(generated);
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
