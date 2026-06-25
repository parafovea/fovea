-- Backfill project scope onto summaries and claims that were created before
-- projectId was stamped on write. Such rows were born projectId = NULL even
-- when they belonged to a project persona, so project collaborators/managers
-- (whose read rule is { projectId IN (...) }) could not see them and were
-- 403'd when adding claims under them.
--
-- A video summary inherits its persona's project; a video claim inherits its
-- (now-healed) parent summary's project. Rows whose persona/summary is personal
-- (projectId NULL) are intentionally left NULL. Only NULL rows are touched, so
-- this is safe to re-run and never overwrites an existing scope.

-- 1) Summaries inherit their persona's project.
UPDATE "video_summaries" AS s
SET "projectId" = p."projectId"
FROM "personas" AS p
WHERE s."personaId" = p."id"
  AND s."projectId" IS NULL
  AND p."projectId" IS NOT NULL;

-- 2) Video claims inherit their parent summary's (now-backfilled) project.
UPDATE "claims" AS c
SET "projectId" = s."projectId"
FROM "video_summaries" AS s
WHERE c."summaryType" = 'video'
  AND c."summaryId" = s."id"
  AND c."projectId" IS NULL
  AND s."projectId" IS NOT NULL;
