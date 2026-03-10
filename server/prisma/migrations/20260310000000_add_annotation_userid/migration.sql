-- AlterTable
ALTER TABLE "annotations" ADD COLUMN "userId" TEXT;

-- Backfill userId from persona's userId for annotations with a persona
UPDATE "annotations" a
SET "userId" = p."userId"
FROM "personas" p
WHERE a."personaId" = p."id"
  AND a."userId" IS NULL;

-- CreateIndex
CREATE INDEX "annotations_userId_idx" ON "annotations"("userId");

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
