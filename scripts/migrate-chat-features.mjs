// One-off: add chat feature columns and tables.
//   - Message.replyToId
//   - MessageReaction table
//   - User.lastSeenAt + User.lastReadAt
// Run with: node --env-file=.env scripts/migrate-chat-features.mjs
import pg from "pg";
const { Client } = pg;

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  process.exit(1);
}

const SQL = `
-- User: add lastSeenAt + lastReadAt for presence and read receipts
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);

-- Message: add replyToId + index
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;
CREATE INDEX IF NOT EXISTS "Message_replyToId_idx" ON "Message"("replyToId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_replyToId_fkey') THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_replyToId_fkey"
      FOREIGN KEY ("replyToId") REFERENCES "Message"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- MessageReaction table
CREATE TABLE IF NOT EXISTS "MessageReaction" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MessageReaction_messageId_userId_emoji_key"
  ON "MessageReaction"("messageId", "userId", "emoji");
CREATE INDEX IF NOT EXISTS "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageReaction_messageId_fkey') THEN
    ALTER TABLE "MessageReaction"
      ADD CONSTRAINT "MessageReaction_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "Message"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageReaction_userId_fkey') THEN
    ALTER TABLE "MessageReaction"
      ADD CONSTRAINT "MessageReaction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
`;

async function connectWithRetry(c, n = 5) {
  for (let i = 1; i <= n; i++) {
    try { await c.connect(); return; }
    catch (e) {
      console.warn(`[attempt ${i}/${n}] connect failed:`, e.message);
      if (i === n) throw e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

const client = new Client({ connectionString: url });
try {
  await connectWithRetry(client);
  await client.query(SQL);
  const verify = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='lastSeenAt') AS user_lastseen,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='lastReadAt') AS user_lastread,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Message' AND column_name='replyToId') AS msg_reply,
      EXISTS (SELECT 1 FROM pg_tables WHERE tablename='MessageReaction') AS reactions_table
  `);
  console.log("✓ Migration complete:", verify.rows[0]);
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
