-- 0.6.0 expand/migrate/contract: the destructive DROP of the legacy annotation
-- models is intentionally deferred out of 0.6.0. The legacy tables
-- (annotations, claims, claim_relations, ontologies, world_state) are RETAINED
-- through 0.6.0 so the one-time 0.5->0.6 data migration (server/prisma/migrate-0.6)
-- can copy their rows into the layers store while both schemas coexist. The drop
-- runs in 0.6.1 via the guarded migration, which refuses unless the migration
-- tool has recorded a passing verify in _layers_migration_state.
--
-- This migration is intentionally a no-op. Do not add DROP statements here.
SELECT 1;
