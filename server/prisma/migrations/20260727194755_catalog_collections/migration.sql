-- CreateTable
CREATE TABLE "catalog_collections" (
    "id" TEXT NOT NULL,
    "localId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "kindUri" TEXT,
    "description" TEXT,
    "parentRef" TEXT,
    "rootRef" TEXT,
    "depth" INTEGER,
    "version" TEXT,
    "access" TEXT,
    "stability" TEXT,
    "pinPolicy" TEXT,
    "contents" JSONB,
    "citation" JSONB,
    "languageRefs" JSONB,
    "knowledgeRefs" JSONB,
    "licensing" JSONB,
    "reproducibility" JSONB,
    "features" JSONB,
    "metadata" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_memberships" (
    "id" TEXT NOT NULL,
    "catalogRef" TEXT NOT NULL,
    "member" JSONB NOT NULL,
    "role" TEXT NOT NULL,
    "roleUri" TEXT,
    "ordinal" INTEGER,
    "pinPolicy" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "selfAsserted" BOOLEAN,
    "notes" TEXT,
    "knowledgeRefs" JSONB,
    "features" JSONB,
    "metadata" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_collections_parentRef_idx" ON "catalog_collections"("parentRef");

-- CreateIndex
CREATE INDEX "catalog_collections_projectId_idx" ON "catalog_collections"("projectId");

-- CreateIndex
CREATE INDEX "catalog_collections_createdByUserId_idx" ON "catalog_collections"("createdByUserId");

-- CreateIndex
CREATE INDEX "catalog_memberships_catalogRef_idx" ON "catalog_memberships"("catalogRef");

-- CreateIndex
CREATE INDEX "catalog_memberships_projectId_idx" ON "catalog_memberships"("projectId");

-- CreateIndex
CREATE INDEX "catalog_memberships_createdByUserId_idx" ON "catalog_memberships"("createdByUserId");

-- AddForeignKey
ALTER TABLE "catalog_collections" ADD CONSTRAINT "catalog_collections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_memberships" ADD CONSTRAINT "catalog_memberships_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
