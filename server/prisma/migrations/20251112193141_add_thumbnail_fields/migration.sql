-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "lastMetadataSync" TIMESTAMP(3),
ADD COLUMN     "localThumbnailPath" TEXT,
ADD COLUMN     "metadataSyncStatus" TEXT,
ADD COLUMN     "platformVideoId" TEXT,
ADD COLUMN     "sourcePlatform" TEXT;
