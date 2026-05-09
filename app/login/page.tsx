"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import StarField from "../components/StarField";
import { Heart, Sparkles } from "../components/Icons";

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
    <div className="min-h-screen bg-[#0a0305] flex items-center justify-center px-4 relative overflow-hidden">
      <StarField count={50} />
      <div className="aurora" aria-hidden />

      <div className="relative z-10 w-full max-w-sm animate-fade-up-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-rose-500/30 to-pink-700/30 border border-rose-400/30 mb-4 animate-float shadow-xl shadow-rose-700/20">
            <Heart className="w-7 h-7 text-rose-300 fill-rose-400" aria-hidden />
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-white via-rose-200 to-pink-300 bg-clip-text text-transparent">
            leen-a-po
          </h1>
          <p className="text-white/60 text-sm mt-2 flex items-center justify-center gap-1.5">
            our little universe
            <Sparkles className="w-3.5 h-3.5 text-rose-300" aria-hidden />
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl shadow-black/40"
        >
          <div>
            <label htmlFor="email" className="text-white/75 text-xs mb-1.5 block font-medium">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@leen-a-po.com"
              required
              autoComplete="email"
              className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/45 text-sm focus:outline-none focus:border-rose-400 focus:bg-white/[0.1] transition-colors"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-white/75 text-xs mb-1.5 block font-medium">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/45 text-sm focus:outline-none focus:border-rose-400 focus:bg-white/[0.1] transition-colors"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-rose-300 text-sm text-center bg-rose-500/10 border border-rose-400/25 rounded-xl px-3 py-2 animate-shake"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all cursor-pointer shadow-lg shadow-rose-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                Signing in...
              </>
            ) : (
              <>
                Sign In
                <Sparkles className="w-4 h-4" aria-hidden />
              </>
            )}
          </button>
        </form>

        <p className="text-white/35 text-[11px] text-center mt-6 tracking-widest uppercase">
          Made with <Heart className="inline w-3 h-3 text-rose-400 fill-rose-400 -mt-0.5" aria-hidden /> in the stars
        </p>
      </div>
    </div>
  );
}
