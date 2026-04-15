-- Backfill createdByUserId on annotations from the legacy userId field.
-- Required so CASL ability conditions ({ createdByUserId: userId }) match
-- pre-existing rows. Without this, every annotator loses access to their
-- own historical annotations when row-level enforcement is turned on.
UPDATE "annotations"
SET "createdByUserId" = "userId"
WHERE "createdByUserId" IS NULL AND "userId" IS NOT NULL;

-- Backfill video summary ownership from the owning persona's user.
UPDATE "video_summaries" vs
SET "createdBy" = p."userId"
FROM "personas" p
WHERE vs."personaId" = p."id"
  AND vs."createdBy" IS NULL;

-- Backfill claim ownership from the summary's persona's user.
UPDATE "claims" c
SET "createdBy" = p."userId"
FROM "video_summaries" vs
JOIN "personas" p ON vs."personaId" = p."id"
WHERE c."summaryId" = vs."id"
  AND c."createdBy" IS NULL;
