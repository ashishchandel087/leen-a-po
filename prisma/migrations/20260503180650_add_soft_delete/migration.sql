-- AlterTable
ALTER TABLE "BucketItem" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PissOffLog" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SpecialOccasion" ADD COLUMN     "deletedAt" TIMESTAMP(3);
