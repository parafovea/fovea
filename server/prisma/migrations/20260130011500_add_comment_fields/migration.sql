-- Add comment fields for annotator notes
-- VideoSummary: video-level comments
ALTER TABLE "video_summaries" ADD COLUMN "comment" TEXT;

-- Claim: claim-level comments
ALTER TABLE "claims" ADD COLUMN "comment" TEXT;
