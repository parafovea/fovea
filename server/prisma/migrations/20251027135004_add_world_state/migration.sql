/*
  Warnings:

  - Made the column `userId` on table `world_state` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "world_state" ALTER COLUMN "userId" SET NOT NULL;
