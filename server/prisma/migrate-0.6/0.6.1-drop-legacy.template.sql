-- Guarded contract-phase drop of the legacy 0.5 annotation models.
--
-- This is a TEMPLATE, not an active migration. It must NOT live under
-- prisma/migrations while the release is 0.6.0: a migration there applies on the
-- next `prisma migrate deploy`, which would drop the legacy tables before the
-- 0.5-to-0.6 copy has run and destroy the very data the copy reads. It ships in
-- the 0.6.1 release, where the copy has already run against every upgraded
-- deployment.
--
-- To land it in 0.6.1:
--   1. Create the migration directory and copy this file into it verbatim:
--        prisma/migrations/<timestamp>_drop_legacy_annotation_models_0_6_1/migration.sql
--   2. In the same 0.6.1 change, delete the five retained models from
--      schema.prisma (Ontology, WorldState, Annotation, Claim, ClaimRelation)
--      and their back-relation fields, so the Prisma schema matches the dropped
--      tables. `prisma migrate deploy` then applies this drop, and the client no
--      longer exposes the legacy delegates.
--
-- The guard makes the drop refuse to run unless the migration tool recorded a
-- passing verify in `_layers_migration_state`. A RAISE aborts the migration
-- transaction, so `prisma migrate deploy` fails and no table is dropped: an
-- operator who upgrades straight to 0.6.1 without running the copy is stopped
-- with data intact, not silently emptied.

DO $$
DECLARE
  marker_exists boolean;
  marker_phase text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = '_layers_migration_state'
  ) INTO marker_exists;

  IF NOT marker_exists THEN
    RAISE EXCEPTION
      'Refusing to drop the legacy 0.5 tables: the 0.5-to-0.6 data migration has not run (no _layers_migration_state marker). In the server package, run `npm run migrate:0.6:migrate` and confirm it reports VERIFY OK before upgrading to 0.6.1.';
  END IF;

  SELECT phase INTO marker_phase FROM "_layers_migration_state" WHERE id = 1;

  IF marker_phase IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION
      'Refusing to drop the legacy 0.5 tables: migration phase is "%", expected "verified". Re-run `npm run migrate:0.6:migrate` until the verifier passes with zero mismatches, then upgrade to 0.6.1.',
      COALESCE(marker_phase, 'not started');
  END IF;
END $$;

-- claim_relations references claims, so it drops first; the remaining tables are
-- referenced only by surviving tables' Prisma-level relations, not by database
-- foreign keys pointing into them, so CASCADE cleans up their own constraints.
DROP TABLE IF EXISTS "claim_relations" CASCADE;
DROP TABLE IF EXISTS "claims" CASCADE;
DROP TABLE IF EXISTS "annotations" CASCADE;
DROP TABLE IF EXISTS "ontologies" CASCADE;
DROP TABLE IF EXISTS "world_state" CASCADE;
