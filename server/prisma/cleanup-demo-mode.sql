-- Cleanup script for residue left by the v0.4.0 demo-mode build that
-- briefly ran on demo.fovea.video. Idempotent: re-running it is a no-op
-- once the rows are gone. Run AFTER the deploy that flips DEMO_MODE
-- off has rolled (so no new demo-anonymous-* sessions are minted).
--
-- Usage on the server:
--   docker compose exec -T postgres psql -U fovea fovea < cleanup-demo-mode.sql
--
-- What this removes:
--   1. demo-anonymous-* User rows (cascade-removes their sessions,
--      personas, ontologies, world_state, annotations, video_summaries,
--      claims via Prisma onDelete: Cascade).
--   2. Orphaned video_summaries / claims whose createdBy points at a
--      user that no longer exists (idle-reset sweeper deleted the User
--      faster than the row owners could clean up after themselves).
--   3. System-generated personas seeded by the demo plugin (Port Safety
--      Incident Investigator, Ballpark Guest Services Supervisor,
--      Automated — every persona with isSystemGenerated=true). The
--      DELETE cascades to their ontologies + any annotations that were
--      authored against them during the demo window.
--
-- What this preserves:
--   * Real (non-demo) user accounts and everything they own.
--   * The four demo tour video rows themselves (Video table). They are
--     shared, not user-owned; deleting them would break any real user
--     who happened to annotate against them.
--   * nginx rate-limit configs (they were sensible additions for any
--     public deployment, demo or not).
--
-- Run as a single transaction so a half-applied state can never linger
-- in the database.

BEGIN;

-- 1. Audit the state BEFORE the wipe so the operator can see what
--    they're about to remove.
\echo '== Before cleanup =='
SELECT 'demo-anonymous- users'  AS what, COUNT(*) FROM users WHERE username LIKE 'demo-anonymous-%'
UNION ALL
SELECT 'system-generated personas',  COUNT(*) FROM personas WHERE "isSystemGenerated" = true
UNION ALL
SELECT 'orphan video_summaries',     COUNT(*) FROM video_summaries WHERE "createdBy" NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orphan claims',              COUNT(*) FROM claims WHERE "createdBy" NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orphan annotations',         COUNT(*) FROM annotations WHERE "createdByUserId" NOT IN (SELECT id FROM users);

-- 2. Delete every anonymous demo user. ON DELETE CASCADE on the
--    related tables removes their sessions, personas, ontologies,
--    world_state, annotations, video_summaries, claims, user_settings
--    in one shot. A no-op when no rows match.
DELETE FROM users WHERE username LIKE 'demo-anonymous-%';

-- 3. Delete orphan rows whose owner is already gone. Catches anything
--    a prior cascade missed (or whose owner was hard-deleted via a
--    different path that bypassed the cascade).
DELETE FROM video_summaries WHERE "createdBy" NOT IN (SELECT id FROM users);
DELETE FROM claims           WHERE "createdBy" NOT IN (SELECT id FROM users);
DELETE FROM annotations      WHERE "createdByUserId" NOT IN (SELECT id FROM users);

-- 4. Delete the system-generated demo personas. Cascade removes their
--    ontologies and any annotations bound to them. Comment this block
--    out if you want to keep the seeded personas around for testing.
DELETE FROM personas WHERE "isSystemGenerated" = true;

-- 5. Audit AFTER so the operator can confirm.
\echo '== After cleanup =='
SELECT 'demo-anonymous- users (residual)'         AS what, COUNT(*) FROM users WHERE username LIKE 'demo-anonymous-%'
UNION ALL
SELECT 'system-generated personas (residual)',    COUNT(*) FROM personas WHERE "isSystemGenerated" = true
UNION ALL
SELECT 'orphan video_summaries (residual)',       COUNT(*) FROM video_summaries WHERE "createdBy" NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orphan claims (residual)',                COUNT(*) FROM claims WHERE "createdBy" NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'orphan annotations (residual)',           COUNT(*) FROM annotations WHERE "createdByUserId" NOT IN (SELECT id FROM users);

COMMIT;
