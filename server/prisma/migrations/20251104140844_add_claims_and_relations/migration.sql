-- AlterTable
ALTER TABLE "video_summaries" ADD COLUMN     "claimsExtractedAt" TIMESTAMP(3),
ADD COLUMN     "claimsJson" JSONB,
ADD COLUMN     "claimsVersion" TEXT;

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "summaryId" TEXT NOT NULL,
    "summaryType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "gloss" JSONB NOT NULL DEFAULT '[]',
    "parentClaimId" TEXT,
    "textSpans" JSONB,
    "claimerType" TEXT,
    "claimerGloss" JSONB,
    "claimRelation" JSONB,
    "claimEventId" TEXT,
    "claimTimeId" TEXT,
    "claimLocationId" TEXT,
    "confidence" DOUBLE PRECISION,
    "modelUsed" TEXT,
    "extractionStrategy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_relations" (
    "id" TEXT NOT NULL,
    "sourceClaimId" TEXT NOT NULL,
    "targetClaimId" TEXT NOT NULL,
    "relationTypeId" TEXT NOT NULL,
    "sourceSpans" JSONB,
    "targetSpans" JSONB,
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claims_summaryId_summaryType_idx" ON "claims"("summaryId", "summaryType");

-- CreateIndex
CREATE INDEX "claims_parentClaimId_idx" ON "claims"("parentClaimId");

-- CreateIndex
CREATE INDEX "claim_relations_sourceClaimId_idx" ON "claim_relations"("sourceClaimId");

-- CreateIndex
CREATE INDEX "claim_relations_targetClaimId_idx" ON "claim_relations"("targetClaimId");

-- CreateIndex
CREATE INDEX "claim_relations_relationTypeId_idx" ON "claim_relations"("relationTypeId");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "video_summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_parentClaimId_fkey" FOREIGN KEY ("parentClaimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_relations" ADD CONSTRAINT "claim_relations_sourceClaimId_fkey" FOREIGN KEY ("sourceClaimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_relations" ADD CONSTRAINT "claim_relations_targetClaimId_fkey" FOREIGN KEY ("targetClaimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
