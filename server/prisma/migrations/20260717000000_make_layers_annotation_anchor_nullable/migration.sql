-- Make the layers annotation anchor nullable so a world-denoting annotation can
-- attach to a GraphNode via "denotesNodeId" (carrying a temporal/spatial value
-- or a type assignment) without a media/text anchor: calendar-only Times,
-- abstract spatial Locations, and world-level type/interpretation annotations.
-- Additive and nullable — existing rows keep their anchor and need no backfill.
ALTER TABLE "layers_annotations" ALTER COLUMN "anchor" DROP NOT NULL;
