-- Add linkType to annotations so object annotations can record whether the
-- `label` references an entity, event, time, or location. NULL is allowed
-- for type annotations and for object annotations created before this
-- column existed (the frontend treats those as entity-linked, matching the
-- previous behavior).
ALTER TABLE "annotations" ADD COLUMN "linkType" TEXT;
