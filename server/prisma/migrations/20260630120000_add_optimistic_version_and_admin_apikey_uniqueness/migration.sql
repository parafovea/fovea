-- 0.5.9 backend correctness hardening.
--
-- (1) Adds a monotonic `version` column to world_state and ontologies so the
-- optimistic-concurrency guard can compare-and-swap on a value that always
-- advances. The prior guard matched on `updatedAt`, which two writes landing in
-- the same millisecond can share, letting the second silently clobber the first.
-- Existing rows start at version 0; the guard increments on every write.
--
-- (2) Adds a partial unique index enforcing one admin API key per provider
-- (userId IS NULL). The compound @@unique([userId, provider]) does not constrain
-- admin keys because Postgres treats NULL userIds as distinct, so the advertised
-- 409 never fired and duplicate admin keys could accumulate. Dedupe first.
--
-- The partial unique index cannot be expressed in schema.prisma and is created
-- here as raw SQL; the project applies migrations with `prisma migrate deploy`,
-- which leaves it in place.

-- AlterTable: optimistic-concurrency version tokens.
ALTER TABLE "world_state" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ontologies" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- ApiKey: an admin key (userId NULL) must be unique per provider (BUG-15).
-- Dedupe first, treating NULL userIds as equal (IS NOT DISTINCT FROM via the
-- explicit NULL guard), keeping the most-recently-updated admin key per provider
-- (older duplicates, a rare artifact of the unconstrained path, are removed).
DELETE FROM "api_keys" a
USING "api_keys" b
WHERE a."userId" IS NULL AND b."userId" IS NULL
  AND a."provider" = b."provider"
  AND (a."updatedAt" < b."updatedAt" OR (a."updatedAt" = b."updatedAt" AND a.ctid > b.ctid));

CREATE UNIQUE INDEX "api_keys_admin_provider_key"
  ON "api_keys"("provider") WHERE "userId" IS NULL;
