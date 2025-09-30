-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "personas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "informationNeed" TEXT NOT NULL,
    "details" TEXT,
    "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ontologies" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "entityTypes" JSONB NOT NULL DEFAULT '[]',
    "eventTypes" JSONB NOT NULL DEFAULT '[]',
    "roleTypes" JSONB NOT NULL DEFAULT '[]',
    "relationTypes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ontologies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "duration" DOUBLE PRECISION,
    "frameRate" DOUBLE PRECISION,
    "resolution" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_summaries" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "visualAnalysis" TEXT,
    "audioTranscript" TEXT,
    "keyFrames" JSONB,
    "confidence" DOUBLE PRECISION,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotations" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "frames" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ontologies_personaId_key" ON "ontologies"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "videos_filename_key" ON "videos"("filename");

-- CreateIndex
CREATE UNIQUE INDEX "video_summaries_videoId_personaId_key" ON "video_summaries"("videoId", "personaId");

-- AddForeignKey
ALTER TABLE "ontologies" ADD CONSTRAINT "ontologies_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_summaries" ADD CONSTRAINT "video_summaries_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_summaries" ADD CONSTRAINT "video_summaries_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
