-- 0.5.6 idempotency / identity hardening.
--
-- Adds uniqueness that prevents the duplicate rows the create paths could mint
-- on retry/race. Each constraint is preceded by a dedupe of any rows that
-- already violate it (a no-op on a clean database). Partial unique indexes
-- (ResourceShare, personal WorldState) cannot be expressed in schema.prisma and
-- are created here as raw SQL; the project applies migrations with
-- `prisma migrate deploy`, which leaves these in place.

-- ClaimRelation: a (source, target, type) triple must be unique (BUG-13). Drop
-- duplicates first, keeping one row per triple (ctid breaks ties deterministically).
DELETE FROM "claim_relations" a
USING "claim_relations" b
WHERE a."sourceClaimId" = b."sourceClaimId"
  AND a."targetClaimId" = b."targetClaimId"
  AND a."relationTypeId" = b."relationTypeId"
  AND a.ctid > b.ctid;

-- CreateIndex
CREATE UNIQUE INDEX "claim_relations_sourceClaimId_targetClaimId_relationTypeId_key" ON "claim_relations"("sourceClaimId", "targetClaimId", "relationTypeId");

-- ResourceShare: a grant of the same resource by the same user to the same
-- target must be unique (BUG-12). Postgres treats NULLs as distinct, so a single
-- @@unique cannot constrain the user-share (groupId NULL) and group-share
-- (userId NULL) cases; use two partial unique indexes. Dedupe first, treating
-- NULLs as equal (IS NOT DISTINCT FROM), keeping one row per identity.
DELETE FROM "resource_shares" a
USING "resource_shares" b
WHERE a.ctid > b.ctid
  AND a."resourceType" = b."resourceType"
  AND a."resourceId" = b."resourceId"
  AND a."sharedByUserId" = b."sharedByUserId"
  AND a."sharedWithUserId" IS NOT DISTINCT FROM b."sharedWithUserId"
  AND a."sharedWithGroupId" IS NOT DISTINCT FROM b."sharedWithGroupId";

CREATE UNIQUE INDEX "resource_shares_user_grant_key"
  ON "resource_shares"("resourceType", "resourceId", "sharedByUserId", "sharedWithUserId")
  WHERE "sharedWithGroupId" IS NULL;

CREATE UNIQUE INDEX "resource_shares_group_grant_key"
  ON "resource_shares"("resourceType", "resourceId", "sharedByUserId", "sharedWithGroupId")
  WHERE "sharedWithUserId" IS NULL;

-- WorldState: a user has exactly one PERSONAL world state (projectId NULL), but
-- the compound @@unique([userId, projectId]) does not constrain NULL projectId,
-- so a concurrent first-write could mint duplicates (BUG-14). Add a partial
-- unique index on userId where projectId IS NULL. Dedupe first, keeping the
-- most-recently-updated personal row per user (older duplicates, a rare race
-- artifact, are removed).
DELETE FROM "world_state" a
USING "world_state" b
WHERE a."projectId" IS NULL AND b."projectId" IS NULL
  AND a."userId" = b."userId"
  AND (a."updatedAt" < b."updatedAt" OR (a."updatedAt" = b."updatedAt" AND a.ctid > b.ctid));

CREATE UNIQUE INDEX "world_state_userId_personal_key"
  ON "world_state"("userId") WHERE "projectId" IS NULL;
