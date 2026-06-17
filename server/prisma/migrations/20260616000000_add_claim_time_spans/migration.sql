-- Add timeSpans to claims so a claim can record the video time span(s)
-- (seconds) it is grounded in. The column is a JSON array of
-- {start, end, source, annotationIds?} objects supporting discontiguous spans.
-- NULL is allowed for claims created before this column existed and for
-- untimed claims.
ALTER TABLE "claims" ADD COLUMN "timeSpans" JSONB;
