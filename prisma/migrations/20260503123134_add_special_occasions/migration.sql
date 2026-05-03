-- CreateTable
CREATE TABLE "SpecialOccasion" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🎉',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialOccasion_pkey" PRIMARY KEY ("id")
);
