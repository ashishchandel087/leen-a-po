"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
        setEvtSuccess("✅ Event added!");
        setTimeout(() => setEvtSuccess(""), 3000);
      } else {
        setEvtError(data.error || "Failed to add event");
      }
    } catch {
      setEvtError("Network error — check console");
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
      setUserSuccess(`✅ ${data.name} added!`);
    } else {
      setUserError(data.error || "Something went wrong");
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
    return <div className="min-h-screen bg-black flex items-center justify-center text-white/40">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/10 px-5 py-4 flex items-center justify-between">
        <h1 className="font-bold">Admin Panel 🔐</h1>
        <Link href="/dashboard" className="text-white/40 text-xs hover:text-white/60">← Dashboard</Link>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Timeline Events */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="font-semibold text-sm mb-1">Relationship Timeline 💫</h2>
          <p className="text-white/40 text-xs mb-4">Add events — start, breaks, reunions, milestones</p>

          <form onSubmit={addEvent} className="flex flex-col gap-3 mb-5">
            <select
              value={evtType} onChange={(e) => { setEvtType(e.target.value); setEvtEndDate(""); }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
            >
              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val} className="bg-black">{label}</option>
              ))}
            </select>

            <input
              type="text" value={evtTitle} onChange={(e) => setEvtTitle(e.target.value)}
              placeholder="Title (e.g. We started dating 💚)" required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
            />

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-white/40 text-xs mb-1 block">
                  {evtType === "break" ? "Break started" : "Date"}
                </label>
                <input
                  type="date" value={evtDate} onChange={(e) => setEvtDate(e.target.value)} required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 [color-scheme:dark]"
                />
              </div>
              {evtType === "break" && (
                <div className="flex-1">
                  <label className="text-white/40 text-xs mb-1 block">Break ended</label>
                  <input
                    type="date" value={evtEndDate} onChange={(e) => setEvtEndDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 [color-scheme:dark]"
                  />
                </div>
              )}
            </div>

            <input
              type="text" value={evtReason} onChange={(e) => setEvtReason(e.target.value)}
              placeholder="Reason / note (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
            />

            {evtError && <p className="text-red-400 text-xs">{evtError}</p>}
            {evtSuccess && <p className="text-green-400 text-xs">{evtSuccess}</p>}

            <button
              type="submit" disabled={evtLoading}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-sm font-semibold transition-colors"
            >
              {evtLoading ? "Adding..." : "Add to Timeline ✨"}
            </button>
          </form>

          {timelineEvents.length > 0 ? (
            <div className="space-y-2">
              <p className="text-white/40 text-xs">Existing events ({timelineEvents.length})</p>
              {timelineEvents.map((evt) => (
                <div key={evt.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white/80 truncate">{TYPE_LABELS[evt.type]} — {evt.title}</p>
                    <p className="text-xs text-white/30">
                      {evt.date}{evt.endDate ? ` → ${evt.endDate}` : ""}
                      {evt.reason ? ` · "${evt.reason}"` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteEvent(evt.id)}
                    className="text-white/30 hover:text-red-400 text-xs transition-colors flex-shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/20 text-xs text-center py-2">No events yet</p>
          )}
        </div>

        {/* Add User */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="font-semibold text-sm mb-4">Add User</h2>
          <form onSubmit={addUser} className="flex flex-col gap-3">
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Name" required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
            />
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email" required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
            />
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
            />
            <select
              value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
            >
              <option value="user" className="bg-black">User</option>
              <option value="admin" className="bg-black">Admin</option>
            </select>
            {userError && <p className="text-red-400 text-xs">{userError}</p>}
            {userSuccess && <p className="text-green-400 text-xs">{userSuccess}</p>}
            <button
              type="submit" disabled={userLoading}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-sm font-semibold transition-colors"
            >
              {userLoading ? "Adding..." : "Add User ✨"}
            </button>
          </form>
        </div>

        {/* Users List */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="font-semibold text-sm mb-4">Users ({users.length})</h2>
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-white/40 text-xs">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-purple-600/30 text-purple-300" : "bg-white/10 text-white/50"}`}>
                    {u.role}
                  </span>
                  {u.id !== session?.user?.id && (
                    <button
                      onClick={() => deleteUser(u.id, u.name)}
                      className="text-white/30 hover:text-red-400 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
