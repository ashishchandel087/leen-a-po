-- Catch-up migration: records schema changes that were applied to the live
-- Neon DB outside of prisma migrate, via:
--   scripts/migrate-memories.mjs
--   scripts/migrate-stickers.mjs
--   scripts/migrate-chat-features.mjs
-- plus the base Message table (created directly on the live DB before those
-- scripts). SQL matches those scripts exactly; everything is idempotent so a
-- fresh database replays cleanly too.
--
-- On the live DB this must be marked as already applied (do NOT run it):
--   npx prisma migrate resolve --applied 20260503190000_catchup_chat_stickers_memories

-- ── Message (base table — predates the scripts on the live DB) ─────────
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "text" TEXT NOT NULL DEFAULT '',
  "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_senderId_fkey') THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_senderId_fkey"
      FOREIGN KEY ("senderId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Chat features (scripts/migrate-chat-features.mjs) ──────────────────
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

-- ── Stickers (scripts/migrate-stickers.mjs) ────────────────────────────
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

-- ── Memories (scripts/migrate-memories.mjs) ────────────────────────────
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
