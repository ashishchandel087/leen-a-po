import StarField from "./StarField";

export default function LoadingScreen({ message = "Aligning the stars" }: { message?: string }) {
  return (
    <div className="min-h-screen bg-[#0a0305] flex flex-col items-center justify-center gap-6 relative">
      <StarField count={40} />
      <div className="aurora" aria-hidden />
      <div className="relative z-10 flex flex-col items-center gap-4 animate-fade-in">
        <div
          className="w-14 h-14 rounded-full border-2 border-rose-500/20 border-t-rose-400 animate-orbit"
          aria-hidden
        />
        <p className="text-white/70 text-xs tracking-[0.25em] uppercase">{message}</p>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-rose-400/80"
              style={{
                animation: "float 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
