// Chat event bus backed by Postgres LISTEN/NOTIFY so messages fan out across
// every server instance (Vercel Functions, multiple regions, dev hot-reloads).
//
// How the wires connect:
//   • Each Node process opens ONE direct (non-pooled) Postgres connection
//     and runs `LISTEN chat_events` on it. The connection stays open;
//     incoming `pg_notify` payloads are pushed over it instantly.
//   • publishMessage / publishDelete fire `pg_notify(...)` through the
//     existing (pooled) Prisma connection — pooled is fine for a one-shot
//     statement, only LISTEN needs a sticky direct connection.
//   • Every listener that receives a NOTIFY re-emits on a per-process
//     EventEmitter; SSE handlers in /api/chat/stream subscribe to that.
//
// Why a direct (unpooled) URL:
//   Neon's pooled URL (PgBouncer in transaction mode) hands out a different
//   physical socket per query — `LISTEN` registered on one query is gone the
//   next. Direct connections are sticky, so LISTEN survives.
//   Set DATABASE_URL_UNPOOLED in env, or this falls back to DATABASE_URL with
//   `-pooler.` stripped (Neon's standard direct URL format).

import { EventEmitter } from "events";
import { Client } from "pg";
import { prisma } from "./prisma";

const CHANNEL = "chat_events";

type ChatEvent =
  | { type: "message"; payload: unknown }
  | { type: "delete"; id: string };

type GlobalState = {
  chatBus?: EventEmitter;
  chatListener?: { started: boolean };
};
const g = globalThis as unknown as GlobalState;

export const chatBus: EventEmitter = g.chatBus ?? new EventEmitter();
chatBus.setMaxListeners(50);
if (!g.chatBus) g.chatBus = chatBus;

function directDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED;
  const u = process.env.DATABASE_URL;
  if (!u) return undefined;
  // Neon convention: pooled URL has "-pooler." in the host; remove for direct.
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
          const event = JSON.parse(msg.payload) as ChatEvent;
          if (event.type === "message") chatBus.emit("message", event.payload);
          else if (event.type === "delete") chatBus.emit("delete", event.id);
        } catch {
          /* malformed payload — ignore */
        }
      });

      client.on("error", (err) => {
        console.warn("[chat-bus] listener error:", err.message);
        scheduleReconnect();
      });

      client.on("end", () => {
        scheduleReconnect();
      });

      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      backoff = 1000; // reset on success
      // eslint-disable-next-line no-console
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

// Auto-start on import — but only on the server.
if (typeof window === "undefined") {
  startListener();
}

// ── Publishers ───────────────────────────────────────────────────────────

async function broadcast(event: ChatEvent) {
  const json = JSON.stringify(event);
  // pg_notify is parameter-safe (no string interpolation into SQL).
  try {
    await prisma.$queryRaw`SELECT pg_notify(${CHANNEL}, ${json})`;
  } catch (err) {
    console.warn("[chat-bus] pg_notify failed:", err instanceof Error ? err.message : err);
  }
  // Also emit locally so this instance's SSE clients see it without waiting
  // for the DB roundtrip. The React client dedupes incoming events by id,
  // so the duplicate that comes back via LISTEN is harmless.
  if (event.type === "message") chatBus.emit("message", event.payload);
  else if (event.type === "delete") chatBus.emit("delete", event.id);
}

export function publishMessage(payload: unknown) {
  void broadcast({ type: "message", payload });
}

export function publishDelete(id: string) {
  void broadcast({ type: "delete", id });
}

// ── Subscribers (used by /api/chat/stream) ───────────────────────────────

type Handlers = {
  message?: (payload: unknown) => void;
  delete?: (id: string) => void;
};

export function subscribe(on: Handlers) {
  if (on.message) chatBus.on("message", on.message);
  if (on.delete) chatBus.on("delete", on.delete);
  return () => {
    if (on.message) chatBus.off("message", on.message);
    if (on.delete) chatBus.off("delete", on.delete);
  };
}
