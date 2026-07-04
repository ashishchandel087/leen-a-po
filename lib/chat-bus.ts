// Chat event bus backed by Postgres LISTEN/NOTIFY so events fan out across
// every server instance (Vercel Functions, multiple regions, dev hot-reloads).
//
// How the wires connect:
//   • Each Node process opens ONE direct (non-pooled) Postgres connection
//     (lazily, on first subscribe) and runs `LISTEN chat_events` on it.
//     Incoming pg_notify payloads are pushed over the open socket instantly.
//   • publishX() functions fire `pg_notify(...)` through the existing pooled
//     Prisma connection — pooled is fine for one-shot statements; only
//     LISTEN needs a sticky direct connection.
//   • Subscribers register on a per-process EventEmitter; SSE handlers in
//     /api/chat/stream subscribe to it.
//
// Why a direct (unpooled) URL:
//   Neon's pooled URL (PgBouncer in transaction mode) hands out a different
//   physical socket per query — `LISTEN` registered on one query is gone
//   the next. Direct connections are sticky.

import { EventEmitter } from "events";
import { Client } from "pg";
import { prisma } from "./prisma";

const CHANNEL = "chat_events";

export type BusEvent =
  | { type: "message"; payload: unknown }
  | { type: "delete"; id: string }
  | { type: "reaction"; messageId: string; userId: string; userName: string; emoji: string; action: "add" | "remove" }
  | { type: "read"; userId: string; lastReadAt: string }
  | { type: "typing"; userId: string; userName: string; isTyping: boolean }
  | { type: "presence"; userId: string; userName: string; lastSeenAt: string }
  | { type: "wallpaper"; preset: string; imageUrl: string | null };

type GlobalState = {
  chatBus?: EventEmitter;
  chatListener?: { started: boolean };
};
const g = globalThis as unknown as GlobalState;

export const chatBus: EventEmitter = g.chatBus ?? new EventEmitter();
// 0 = unlimited — each SSE stream registers one listener per event type
// (~7), so any fixed cap starts warning after a handful of open tabs.
chatBus.setMaxListeners(0);
if (!g.chatBus) g.chatBus = chatBus;

// Per-process tag added to every broadcast payload. The notification handler
// uses it to skip our own pg_notify echo — the local emit in broadcast()
// already delivered the event, so replaying the echo would double-deliver
// to every SSE client on the publishing instance.
const INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function directDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED;
  const u = process.env.DATABASE_URL;
  if (!u) return undefined;
  return u.replace("-pooler.", ".");
}

function startListener() {
  if (g.chatListener?.started) return;
  g.chatListener = { started: true };

  const url = directDatabaseUrl();
  if (!url) {
    console.warn("[chat-bus] DATABASE_URL not set — listener disabled");
    return;
  }

  let backoff = 1000;
  let client: Client | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      backoff = Math.min(backoff * 2, 30_000);
      connect();
    }, backoff);
  };

  const connect = async () => {
    try {
      client = new Client({ connectionString: url });
      client.on("notification", (msg) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;
        try {
          const event = JSON.parse(msg.payload) as BusEvent & { _src?: string };
          if (event._src === INSTANCE_ID) return; // our own echo — already emitted locally
          delete event._src; // strip the tag so consumers only ever see BusEvent
          chatBus.emit(event.type, event);
        } catch {
          /* malformed — ignore */
        }
      });
      client.on("error", (err) => {
        console.warn("[chat-bus] listener error:", err.message);
        scheduleReconnect();
      });
      client.on("end", () => scheduleReconnect());

      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      backoff = 1000;
      console.log(`[chat-bus] LISTEN ${CHANNEL}`);
    } catch (err) {
      console.warn("[chat-bus] connect failed:", err instanceof Error ? err.message : err);
      try { await client?.end(); } catch { /* ignore */ }
      client = null;
      scheduleReconnect();
    }
  };
  connect();
}

// ── Generic broadcast helper ──────────────────────────────────────────
async function broadcast(event: BusEvent) {
  // Tag with our instance id so the LISTEN handler skips the echo.
  const json = JSON.stringify({ ...event, _src: INSTANCE_ID });
  try {
    // $executeRaw (not $queryRaw) — pg_notify returns void, which $queryRaw
    // can't deserialize. $executeRaw doesn't try to read columns back.
    await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${json})`;
  } catch (err) {
    console.warn("[chat-bus] pg_notify failed:", err instanceof Error ? err.message : err);
  }
  // Local emit so this instance's SSE clients see it without DB roundtrip.
  chatBus.emit(event.type, event);
}

// ── Specific publishers ──────────────────────────────────────────────
export function publishMessage(payload: unknown) {
  void broadcast({ type: "message", payload });
}
export function publishDelete(id: string) {
  void broadcast({ type: "delete", id });
}
export function publishReaction(args: {
  messageId: string;
  userId: string;
  userName: string;
  emoji: string;
  action: "add" | "remove";
}) {
  void broadcast({ type: "reaction", ...args });
}
export function publishRead(args: { userId: string; lastReadAt: string }) {
  void broadcast({ type: "read", ...args });
}
export function publishTyping(args: { userId: string; userName: string; isTyping: boolean }) {
  void broadcast({ type: "typing", ...args });
}
export function publishPresence(args: { userId: string; userName: string; lastSeenAt: string }) {
  void broadcast({ type: "presence", ...args });
}
export function publishWallpaper(args: { preset: string; imageUrl: string | null }) {
  void broadcast({ type: "wallpaper", ...args });
}

// ── Subscribers ──────────────────────────────────────────────────────
type Handlers = {
  message?: (e: BusEvent & { type: "message" }) => void;
  delete?: (e: BusEvent & { type: "delete" }) => void;
  reaction?: (e: BusEvent & { type: "reaction" }) => void;
  read?: (e: BusEvent & { type: "read" }) => void;
  typing?: (e: BusEvent & { type: "typing" }) => void;
  presence?: (e: BusEvent & { type: "presence" }) => void;
  wallpaper?: (e: BusEvent & { type: "wallpaper" }) => void;
};

export function subscribe(on: Handlers) {
  // Lazy-start the LISTEN connection on first subscriber — publish-only
  // lambdas and `next build` never need (or should open) the direct socket.
  startListener();
  const entries = (Object.entries(on) as [keyof Handlers, (...a: unknown[]) => void][]);
  entries.forEach(([k, fn]) => chatBus.on(k as string, fn));
  return () => entries.forEach(([k, fn]) => chatBus.off(k as string, fn));
}
