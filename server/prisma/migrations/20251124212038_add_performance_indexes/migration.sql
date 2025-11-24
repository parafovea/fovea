-- CreateIndex
CREATE INDEX "annotations_videoId_idx" ON "annotations"("videoId");

-- CreateIndex
CREATE INDEX "annotations_personaId_idx" ON "annotations"("personaId");

-- CreateIndex
CREATE INDEX "annotations_videoId_personaId_idx" ON "annotations"("videoId", "personaId");

-- CreateIndex
CREATE INDEX "annotations_createdAt_idx" ON "annotations"("createdAt");

-- CreateIndex
CREATE INDEX "video_summaries_videoId_idx" ON "video_summaries"("videoId");

-- CreateIndex
CREATE INDEX "video_summaries_personaId_idx" ON "video_summaries"("personaId");

-- CreateIndex
CREATE INDEX "video_summaries_createdAt_idx" ON "video_summaries"("createdAt");

-- CreateIndex
CREATE INDEX "video_summaries_videoId_personaId_idx" ON "video_summaries"("videoId", "personaId");
