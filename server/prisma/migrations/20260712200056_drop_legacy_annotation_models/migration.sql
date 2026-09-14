/*
  Warnings:

  - You are about to drop the `annotations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `claim_relations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `claims` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ontologies` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `world_state` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "annotations" DROP CONSTRAINT "annotations_personaId_fkey";

-- DropForeignKey
ALTER TABLE "annotations" DROP CONSTRAINT "annotations_projectId_fkey";

-- DropForeignKey
ALTER TABLE "annotations" DROP CONSTRAINT "annotations_userId_fkey";

-- DropForeignKey
ALTER TABLE "annotations" DROP CONSTRAINT "annotations_videoId_fkey";

-- DropForeignKey
ALTER TABLE "claim_relations" DROP CONSTRAINT "claim_relations_sourceClaimId_fkey";

-- DropForeignKey
ALTER TABLE "claim_relations" DROP CONSTRAINT "claim_relations_targetClaimId_fkey";

-- DropForeignKey
ALTER TABLE "claims" DROP CONSTRAINT "claims_parentClaimId_fkey";

-- DropForeignKey
ALTER TABLE "claims" DROP CONSTRAINT "claims_projectId_fkey";

-- DropForeignKey
ALTER TABLE "claims" DROP CONSTRAINT "claims_summaryId_fkey";

-- DropForeignKey
ALTER TABLE "ontologies" DROP CONSTRAINT "ontologies_personaId_fkey";

-- DropForeignKey
ALTER TABLE "world_state" DROP CONSTRAINT "world_state_projectId_fkey";

-- DropForeignKey
ALTER TABLE "world_state" DROP CONSTRAINT "world_state_userId_fkey";

-- DropTable
DROP TABLE "annotations";

-- DropTable
DROP TABLE "claim_relations";

-- DropTable
DROP TABLE "claims";

-- DropTable
DROP TABLE "ontologies";

-- DropTable
DROP TABLE "world_state";
