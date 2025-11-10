/*
  Warnings:

  - The `summary` column on the `video_summaries` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "video_summaries" DROP COLUMN "summary",
ADD COLUMN     "summary" JSONB NOT NULL DEFAULT '[]';
