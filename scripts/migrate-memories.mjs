// One-off: create the Memory table on Neon.
// Run from project root with:
//   node --env-file=.env scripts/migrate-memories.mjs
// Idempotent — safe to re-run.
import pg from "pg";
const { Client } = pg;

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  process.exit(1);
}

const SQL = `
CREATE TABLE IF NOT EXISTS "Memory" (
  "id" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "caption" TEXT NOT NULL DEFAULT '',
  "location" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Memory_date_idx" ON "Memory"("date");
CREATE INDEX IF NOT EXISTS "Memory_uploadedById_idx" ON "Memory"("uploadedById");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Memory_uploadedById_fkey') THEN
    ALTER TABLE "Memory"
      ADD CONSTRAINT "Memory_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
`;

async function connectWithRetry(c, maxAttempts = 5) {
  for (let i = 1; i <= maxAttempts; i++) {
    try { await c.connect(); return; }
    catch (err) {
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
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='Memory'`
  );
  console.log("✓ Migration complete. Memory table:", rows.length === 1 ? "present" : "missing");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
