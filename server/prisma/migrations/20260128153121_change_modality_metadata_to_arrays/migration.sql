-- Convert modality metadata from single values to arrays
-- Step 1: Add new JSONB columns
ALTER TABLE "claims" 
  ADD COLUMN "audio_new" JSONB,
  ADD COLUMN "video_new" JSONB,
  ADD COLUMN "metadata_new" JSONB;

-- Step 2: Migrate existing data
-- Convert audio: "speech" -> ["speech"], "non-speech" -> ["non-speech"], null -> null
UPDATE "claims" 
SET "audio_new" = CASE 
  WHEN "audio" = 'speech' THEN '["speech"]'::jsonb
  WHEN "audio" = 'non-speech' THEN '["non-speech"]'::jsonb
  ELSE NULL
END;

-- Convert video: "text" -> ["text"], "non-text" -> ["non-text"], null -> null
UPDATE "claims" 
SET "video_new" = CASE 
  WHEN "video" = 'text' THEN '["text"]'::jsonb
  WHEN "video" = 'non-text' THEN '["non-text"]'::jsonb
  ELSE NULL
END;

-- Convert metadata: true -> ["text"] (assume caption metadata), false/null -> null
UPDATE "claims" 
SET "metadata_new" = CASE 
  WHEN "metadata" = true THEN '["text"]'::jsonb
  ELSE NULL
END;

-- Step 3: Drop old columns
ALTER TABLE "claims" 
  DROP COLUMN "audio",
  DROP COLUMN "video",
  DROP COLUMN "metadata";

-- Step 4: Rename new columns
ALTER TABLE "claims" 
  RENAME COLUMN "audio_new" TO "audio";
ALTER TABLE "claims" 
  RENAME COLUMN "video_new" TO "video";
ALTER TABLE "claims" 
  RENAME COLUMN "metadata_new" TO "metadata";
