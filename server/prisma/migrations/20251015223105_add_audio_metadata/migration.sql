/*
  Warnings:

  - Made the column `userId` on table `personas` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."personas" DROP CONSTRAINT "personas_userId_fkey";

-- AlterTable
ALTER TABLE "personas" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "video_summaries" ADD COLUMN     "audioLanguage" TEXT,
ADD COLUMN     "audioModelUsed" TEXT,
ADD COLUMN     "fusionStrategy" TEXT,
ADD COLUMN     "processedAtAudio" TIMESTAMP(3),
ADD COLUMN     "processedAtFusion" TIMESTAMP(3),
ADD COLUMN     "processedAtVisual" TIMESTAMP(3),
ADD COLUMN     "processingTimeAudio" DOUBLE PRECISION,
ADD COLUMN     "processingTimeFusion" DOUBLE PRECISION,
ADD COLUMN     "processingTimeVisual" DOUBLE PRECISION,
ADD COLUMN     "speakerCount" INTEGER,
ADD COLUMN     "transcriptJson" JSONB,
ADD COLUMN     "visualModelUsed" TEXT;

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
