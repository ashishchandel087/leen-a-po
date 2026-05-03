"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Wrong email or password 💔");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0305] flex items-center justify-center px-4">
      {/* Stars */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: "2px", height: "2px",
              top: `${(i * 37) % 100}%`,
              left: `${(i * 61) % 100}%`,
              opacity: 0.3 + (i % 5) * 0.1,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">leen-a-po</h1>
          <p className="text-white/40 text-sm mt-1">our little universe 🌌</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
          <div>
            <label className="text-white/60 text-xs mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@leen-a-po.com"
              required
              className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-rose-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {loading ? "Signing in..." : "Sign In ✨"}
          </button>
        </form>
      </div>
    </div>
  );
}
