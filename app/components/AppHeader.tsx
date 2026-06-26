"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  Menu, X, ArrowLeft, LogOut, Settings, Heart, Telescope, Flame, Bell, BellOff, MessageCircle, Image,
} from "./Icons";

interface NavItem {
  href: string;
  label: string;
  icon: (p: { className?: string; "aria-hidden"?: boolean }) => ReactNode;
  tone?: "rose" | "orange" | "muted";
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home",      icon: Heart,         tone: "rose" },
  { href: "/chat",      label: "Chat",      icon: MessageCircle, tone: "rose" },
  { href: "/gallery",   label: "Gallery",   icon: Image,         tone: "rose" },
  { href: "/about",     label: "About Us",  icon: Moon,          tone: "muted" },
  { href: "/pissoff",   label: "😤 Meter",  icon: Flame,         tone: "orange" },
  { href: "/apod",      label: "APOD",      icon: Telescope,     tone: "muted" },
];

function Moon(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

interface Props {
  /** "page" headers show only a back link + title; "main" headers show full nav. */
  variant?: "main" | "page";
  title: string;
  subtitle?: string;
  /** For variant="page" — where back arrow goes. Default /dashboard. */
  backHref?: string;
  /** Notification toggle (only on dashboard). When `supported` is false the
   *  button still renders so the click handler can surface a toast. */
  notifications?: {
    supported: boolean;
    subscribed: boolean;
    onToggle: () => void;
  };
  /** Optional right-aligned controls (e.g. the chat wallpaper picker). */
  actions?: ReactNode;
}

export default function AppHeader({
  variant = "main",
  title,
  subtitle,
  backHref = "/dashboard",
  notifications,
  actions,
}: Props) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  // close drawer on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // lock body scroll when drawer open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  return (
    <>
      <header
        className="sticky top-0 z-30 bg-[#0a0305]/85 backdrop-blur-md border-b border-white/10"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
          {/* Left */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {variant === "page" && (
              <Link
                href={backHref}
                aria-label="Back to dashboard"
                className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden />
              </Link>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-base sm:text-lg text-white truncate flex items-center gap-1.5">
                {title}
              </h1>
              {subtitle && (
                <p className="text-white/55 text-xs truncate">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right — caller-supplied actions (e.g. chat wallpaper picker) */}
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}

          {/* Right — desktop nav */}
          {variant === "main" && (
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              {session?.user?.role === "admin" && (
                <Link
                  href="/admin"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 text-xs font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  <Settings className="w-4 h-4" aria-hidden />
                  Admin
                </Link>
              )}
              {NAV.filter((n) => n.href !== "/dashboard").map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                    n.tone === "orange"
                      ? "text-orange-300 hover:text-orange-200 hover:bg-orange-500/10"
                      : n.tone === "rose"
                      ? "text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
                      : "text-white/65 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <n.icon className="w-4 h-4" aria-hidden />
                  {n.label}
                </Link>
              ))}
              {notifications && (
                <button
                  type="button"
                  onClick={notifications.onToggle}
                  aria-label={
                    !notifications.supported
                      ? "Notifications not supported"
                      : notifications.subscribed
                      ? "Disable notifications"
                      : "Enable notifications"
                  }
                  aria-pressed={notifications.subscribed}
                  title={
                    !notifications.supported
                      ? "Notifications not supported on this browser"
                      : notifications.subscribed
                      ? "Notifications on"
                      : "Notifications off — tap to enable"
                  }
                  className={`flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                    !notifications.supported
                      ? "text-white/35"
                      : notifications.subscribed
                      ? "text-rose-300"
                      : "text-white/70 hover:text-rose-300"
                  }`}
                >
                  {notifications.subscribed ? (
                    <Bell className="w-5 h-5" aria-hidden />
                  ) : (
                    <BellOff className="w-5 h-5" aria-hidden />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                aria-label="Sign out"
                className="flex items-center justify-center w-10 h-10 rounded-full text-white/65 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <LogOut className="w-5 h-5" aria-hidden />
              </button>
            </nav>
          )}

          {/* Right — mobile hamburger (main variant) */}
          {variant === "main" && (
            <div className="flex items-center gap-1 md:hidden">
              {notifications && (
                <button
                  type="button"
                  onClick={notifications.onToggle}
                  aria-label={
                    !notifications.supported
                      ? "Notifications not supported"
                      : notifications.subscribed
                      ? "Disable notifications"
                      : "Enable notifications"
                  }
                  aria-pressed={notifications.subscribed}
                  className={`flex items-center justify-center w-11 h-11 rounded-full active:bg-white/10 transition-colors cursor-pointer ${
                    !notifications.supported
                      ? "text-white/35"
                      : notifications.subscribed
                      ? "text-rose-300"
                      : "text-white/70 hover:text-rose-300"
                  }`}
                >
                  {notifications.subscribed ? (
                    <Bell className="w-5 h-5" aria-hidden />
                  ) : (
                    <BellOff className="w-5 h-5" aria-hidden />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
                aria-expanded={open}
                aria-controls="app-drawer"
                className="flex items-center justify-center w-11 h-11 rounded-full text-white/85 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <Menu className="w-5 h-5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile drawer */}
      {variant === "main" && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity md:hidden ${
              open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
            onClick={() => setOpen(false)}
            aria-hidden={!open}
          />
          <aside
            id="app-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
            className={`fixed top-0 right-0 bottom-0 z-40 w-[78%] max-w-xs bg-[#0c0407] border-l border-white/10 shadow-2xl shadow-black/60 md:hidden transition-transform duration-300 ${
              open ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <p className="text-white/85 font-semibold text-sm flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-400 fill-rose-400" aria-hidden />
                Menu
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex items-center justify-center w-10 h-10 rounded-full text-white/70 hover:bg-white/5 active:bg-white/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>

            {session?.user?.name && (
              <div className="px-5 py-4 border-b border-white/10">
                <p className="text-white/50 text-xs">Signed in as</p>
                <p className="text-white text-sm font-medium truncate">{session.user.name}</p>
              </div>
            )}

            <nav className="flex flex-col gap-1 p-3" aria-label="Mobile primary">
              {session?.user?.role === "admin" && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-rose-300 hover:bg-rose-500/10 active:bg-rose-500/15 text-sm font-medium transition-colors cursor-pointer"
                >
                  <Settings className="w-5 h-5" aria-hidden />
                  Admin Panel
                </Link>
              )}
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    n.tone === "orange"
                      ? "text-orange-300 hover:bg-orange-500/10 active:bg-orange-500/15"
                      : n.tone === "rose"
                      ? "text-rose-300 hover:bg-rose-500/10 active:bg-rose-500/15"
                      : "text-white/80 hover:bg-white/5 active:bg-white/10"
                  }`}
                >
                  <n.icon className="w-5 h-5" aria-hidden />
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="absolute left-3 right-3 bottom-4">
              <button
                type="button"
                onClick={() => { setOpen(false); signOut({ callbackUrl: "/login" }); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl bg-white/5 hover:bg-red-500/10 hover:text-red-300 text-white/80 text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <LogOut className="w-4 h-4" aria-hidden />
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
