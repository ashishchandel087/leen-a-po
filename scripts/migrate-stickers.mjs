// One-off: create the StickerPack and Sticker tables on Neon.
// Prisma's CLI keeps hitting Neon's cold-start with P1017 (handshake drop),
// so we apply the same DDL through `pg` directly — its retry/connect behavior
// handles the wake-up cleanly.
//
// Run from project root with:
//   node --env-file=.env scripts/migrate-stickers.mjs
//
// Idempotent: safe to re-run. Uses CREATE TABLE IF NOT EXISTS and a guarded
// FK constraint check.
import pg from "pg";

const { Client } = pg;

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  process.exit(1);
}

const SQL = `
CREATE TABLE IF NOT EXISTS "StickerPack" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "emoji" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "StickerPack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Sticker" (
  "id" TEXT NOT NULL,
  "packId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Sticker_packId_idx" ON "Sticker"("packId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sticker_packId_fkey') THEN
    ALTER TABLE "Sticker"
      ADD CONSTRAINT "Sticker_packId_fkey"
      FOREIGN KEY ("packId") REFERENCES "StickerPack"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
`;

async function connectWithRetry(c, maxAttempts = 5) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await c.connect();
      return;
    } catch (err) {
      console.warn(`[attempt ${i}/${maxAttempts}] connect failed:`, err.message);
      if (i === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

const client = new Client({ connectionString: url });

try {
  await connectWithRetry(client);
  await client.query(SQL);

  // Verify
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename IN ('StickerPack', 'Sticker')
       ORDER BY tablename`
  );
  const found = rows.map((r) => r.tablename);
  console.log("✓ Migration complete. Tables present:", found);
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
