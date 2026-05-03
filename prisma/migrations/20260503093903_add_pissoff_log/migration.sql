-- CreateTable
CREATE TABLE "PissOffLog" (
    "id" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PissOffLog_pkey" PRIMARY KEY ("id")
);
