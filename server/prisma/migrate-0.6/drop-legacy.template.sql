-- Guarded contract-phase drop of the legacy 0.5 annotation models.
--
-- This is a TEMPLATE, not an active migration. It must NOT live under
-- prisma/migrations while the release is 0.6.x: a migration there applies on the
-- next `prisma migrate deploy`, which would drop the legacy tables before the
-- 0.5-to-0.6 copy has run and destroy the very data the copy reads. It ships in
-- the first release after 0.6.x that removes the legacy tables.
--
-- To land it in that release:
--   1. Create the migration directory and copy this file into it verbatim:
--        prisma/migrations/<timestamp>_drop_legacy_annotation_models/migration.sql
--   2. In the same change, delete the five retained models from schema.prisma
--      (Ontology, WorldState, Annotation, Claim, ClaimRelation) and their
--      back-relation fields, so the Prisma schema matches the dropped tables.
--      `prisma migrate deploy` then applies this drop, and the client no longer
--      exposes the legacy delegates.
--   3. Delete server/prisma/migrate-0.6 and its npm scripts and Dockerfile
--      bundle step: the CLI reads the legacy delegates removed in step 2.
--   4. State in that release's CHANGELOG entry and upgrade notes that a 0.5.x
--      deployment must upgrade to 0.6.x and complete the copy first.
--
-- The guard drops the tables when they hold no rows (a fresh install, or one
-- that never had 0.5 data) or when the migration tool recorded a passing verify
-- in `_layers_migration_state`. Otherwise a RAISE aborts the migration
-- transaction, so `prisma migrate deploy` fails and no table is dropped: an
-- operator who installs this release without running the copy is stopped with
-- data intact, not silently emptied.

DO $$
DECLARE
  legacy_rows bigint := 0;
  marker_exists boolean;
  marker_phase text;
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['annotations', 'world_state', 'ontologies', 'claims', 'claim_relations'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = t
    ) THEN
      EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
      legacy_rows := legacy_rows + n;
    END IF;
  END LOOP;

  IF legacy_rows = 0 THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = '_layers_migration_state'
  ) INTO marker_exists;

  IF marker_exists THEN
    SELECT phase INTO marker_phase FROM "_layers_migration_state" WHERE id = 1;
  END IF;

  IF marker_phase IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION
      'Refusing to drop the legacy 0.5 tables: they hold % row(s) and the 0.5-to-0.6 data migration is at phase "%", not "verified". Using the image of the release that contains it, mark this migration rolled back (`npx prisma migrate resolve --rolled-back <migration name>`); then switch back to the 0.6.x image, run `node prisma/migrate-0.6/cli.cjs migrate` until it reports VERIFY OK, and upgrade again. See the "Upgrading 0.5 to 0.6" operations guide.',
      legacy_rows, COALESCE(marker_phase, 'not started');
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
