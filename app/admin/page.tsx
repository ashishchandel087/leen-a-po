"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppHeader from "../components/AppHeader";
import LoadingScreen from "../components/LoadingScreen";
import { useToast } from "../components/Toast";
import { Trash, Plus, Sparkles, User as UserIcon } from "../components/Icons";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

interface TimelineEvent {
  id: string;
  type: string;
  date: string;
  endDate: string | null;
  title: string;
  reason: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  start:     "💚 Start of relationship",
  break:     "💔 Break / Breakup",
  reunion:   "💜 Back Together",
  milestone: "⭐ Milestone",
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");

  // Timeline
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [evtType, setEvtType] = useState("start");
  const [evtDate, setEvtDate] = useState("");
  const [evtEndDate, setEvtEndDate] = useState("");
  const [evtTitle, setEvtTitle] = useState("");
  const [evtReason, setEvtReason] = useState("");
  const [evtLoading, setEvtLoading] = useState(false);
  const [evtError, setEvtError] = useState("");
  const [evtSuccess, setEvtSuccess] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "admin") {
      fetch("/api/users").then((r) => r.ok ? r.json() : []).then(setUsers);
      fetch("/api/timeline").then((r) => r.ok ? r.json() : []).then(setTimelineEvents);
    }
  }, [status, session]);

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    setEvtLoading(true);
    setEvtError("");
    setEvtSuccess("");
    try {
      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: evtType,
          date: evtDate,
          endDate: evtEndDate || null,
          title: evtTitle,
          reason: evtReason || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTimelineEvents((prev) =>
          [...prev, data].sort((a, b) => a.date.localeCompare(b.date))
        );
        setEvtDate(""); setEvtEndDate(""); setEvtTitle(""); setEvtReason(""); setEvtType("start");
        setEvtSuccess("Event added");
        toast.show("Event added to timeline ✨", "love");
        setTimeout(() => setEvtSuccess(""), 3000);
      } else {
        setEvtError(data.error || "Failed to add event");
        toast.show("Couldn't add event", "error");
      }
    } catch {
      setEvtError("Network error — check console");
      toast.show("Network error", "error");
    }
    setEvtLoading(false);
  }

  async function deleteEvent(id: string) {
    await fetch("/api/timeline", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTimelineEvents((prev) => prev.filter((ev) => ev.id !== id));
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setUserLoading(true);
    setUserError("");
    setUserSuccess("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const data = await res.json();
    if (res.ok) {
      setUsers((prev) => [...prev, data]);
      setName(""); setEmail(""); setPassword(""); setRole("user");
      setUserSuccess(`${data.name} added`);
      toast.show(`${data.name} added`, "success");
    } else {
      setUserError(data.error || "Something went wrong");
      toast.show("Couldn't add user", "error");
    }
    setUserLoading(false);
  }

  async function deleteUser(id: string, userName: string) {
    if (!confirm(`Remove ${userName}?`)) return;
    await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  if (status === "loading") {
    return <LoadingScreen message="Unlocking admin" />;
  }

  return (
    <div className="min-h-screen bg-[#0a0305] text-white relative">
      <div className="aurora" aria-hidden />

      <AppHeader variant="page" title="Admin Panel 🔐" subtitle="Manage timeline & users" />

      <div className="relative max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Timeline Events */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <h2 className="font-semibold text-sm mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-rose-400" aria-hidden />
            Relationship Timeline
          </h2>
          <p className="text-white/65 text-xs mb-4">Add events — start, breaks, reunions, milestones</p>

          <form onSubmit={addEvent} className="flex flex-col gap-3 mb-5">
            <label htmlFor="evt-type" className="sr-only">Event type</label>
            <select
              id="evt-type"
              value={evtType} onChange={(e) => { setEvtType(e.target.value); setEvtEndDate(""); }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-400 cursor-pointer"
            >
              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val} className="bg-[#0a0305]">{label}</option>
              ))}
            </select>

            <label htmlFor="evt-title" className="sr-only">Title</label>
            <input
              id="evt-title"
              type="text" value={evtTitle} onChange={(e) => setEvtTitle(e.target.value)}
              placeholder="Title (e.g. We started dating 💚)" required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400 focus:bg-white/[0.07] transition-colors"
            />

            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="evt-date" className="text-white/70 text-xs mb-1 block font-medium">
                  {evtType === "break" ? "Break started" : "Date"}
                </label>
                <input
                  id="evt-date"
                  type="date" value={evtDate} onChange={(e) => setEvtDate(e.target.value)} required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-rose-400"
                />
              </div>
              {evtType === "break" && (
                <div className="flex-1 animate-slide-down">
                  <label htmlFor="evt-end-date" className="text-white/70 text-xs mb-1 block font-medium">Break ended</label>
                  <input
                    id="evt-end-date"
                    type="date" value={evtEndDate} onChange={(e) => setEvtEndDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-rose-400"
                  />
                </div>
              )}
            </div>

            <label htmlFor="evt-reason" className="sr-only">Reason / note</label>
            <input
              id="evt-reason"
              type="text" value={evtReason} onChange={(e) => setEvtReason(e.target.value)}
              placeholder="Reason / note (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400 focus:bg-white/[0.07] transition-colors"
            />

            {evtError && (
              <p role="alert" className="text-red-300 text-xs bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">{evtError}</p>
            )}
            {evtSuccess && (
              <p className="text-green-300 text-xs bg-green-500/10 border border-green-400/20 rounded-lg px-3 py-2 animate-fade-in">{evtSuccess}</p>
            )}

            <button
              type="submit" disabled={evtLoading}
              className="w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-rose-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 flex items-center justify-center gap-2"
            >
              {evtLoading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                  Adding...
                </>
              ) : (
                <>
                  Add to Timeline
                  <Sparkles className="w-4 h-4" aria-hidden />
                </>
              )}
            </button>
          </form>

          {timelineEvents.length > 0 ? (
            <div className="space-y-2">
              <p className="text-white/65 text-xs font-medium uppercase tracking-wider">Existing events ({timelineEvents.length})</p>
              <ul className="space-y-2 stagger">
                {timelineEvents.map((evt) => (
                  <li key={evt.id} className="animate-fade-up flex items-center justify-between bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-xl px-3 py-2.5 gap-2 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm text-white/90 truncate">{TYPE_LABELS[evt.type]} — {evt.title}</p>
                      <p className="text-xs text-white/55 truncate">
                        {evt.date}{evt.endDate ? ` → ${evt.endDate}` : ""}
                        {evt.reason ? ` · "${evt.reason}"` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteEvent(evt.id)}
                      aria-label={`Delete event "${evt.title}"`}
                      className="flex items-center justify-center w-10 h-10 rounded-full text-white/50 hover:text-red-400 hover:bg-red-500/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash className="w-4 h-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-white/55 text-xs text-center py-3">No events yet</p>
          )}
        </div>

        {/* Add User */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-rose-400" aria-hidden />
            Add User
          </h2>
          <form onSubmit={addUser} className="flex flex-col gap-3">
            <label htmlFor="user-name" className="sr-only">Name</label>
            <input
              id="user-name"
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Name" required autoComplete="name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400 focus:bg-white/[0.07] transition-colors"
            />
            <label htmlFor="user-email" className="sr-only">Email</label>
            <input
              id="user-email"
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email" required autoComplete="off"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400 focus:bg-white/[0.07] transition-colors"
            />
            <label htmlFor="user-password" className="sr-only">Password</label>
            <input
              id="user-password"
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" required autoComplete="new-password"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 focus:outline-none focus:border-rose-400 focus:bg-white/[0.07] transition-colors"
            />
            <label htmlFor="user-role" className="sr-only">Role</label>
            <select
              id="user-role"
              value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-400 cursor-pointer"
            >
              <option value="user" className="bg-[#0a0305]">User</option>
              <option value="admin" className="bg-[#0a0305]">Admin</option>
            </select>
            {userError && (
              <p role="alert" className="text-red-300 text-xs bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">{userError}</p>
            )}
            {userSuccess && (
              <p className="text-green-300 text-xs bg-green-500/10 border border-green-400/20 rounded-lg px-3 py-2 animate-fade-in">{userSuccess}</p>
            )}
            <button
              type="submit" disabled={userLoading}
              className="w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-rose-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 flex items-center justify-center gap-2"
            >
              {userLoading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
                  Adding...
                </>
              ) : (
                <>
                  Add User
                  <Sparkles className="w-4 h-4" aria-hidden />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Users List */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl shadow-black/30 animate-fade-up">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-rose-400" aria-hidden />
            Users ({users.length})
          </h2>
          <ul className="space-y-2 stagger">
            {users.map((u) => (
              <li key={u.id} className="animate-fade-up flex items-center justify-between bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.name}</p>
                  <p className="text-white/65 text-xs truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${u.role === "admin" ? "bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/30" : "bg-white/10 text-white/70"}`}>
                    {u.role}
                  </span>
                  {u.id !== session?.user?.id && (
                    <button
                      type="button"
                      onClick={() => deleteUser(u.id, u.name)}
                      aria-label={`Remove user ${u.name}`}
                      className="flex items-center justify-center w-10 h-10 rounded-full text-white/50 hover:text-red-400 hover:bg-red-500/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors"
                    >
                      <Trash className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
