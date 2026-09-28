-- AlterTable
ALTER TABLE "personas" ADD COLUMN     "domain" TEXT,
ADD COLUMN     "guidelines" TEXT,
ADD COLUMN     "guidelinesFormat" TEXT,
ADD COLUMN     "kind" TEXT;

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "externalUri" TEXT,
    "blobPath" TEXT,
    "mimeType" TEXT,
    "durationMs" INTEGER,
    "parentMediaId" TEXT,
    "startOffsetMs" INTEGER,
    "audio" JSONB,
    "video" JSONB,
    "document" JSONB,
    "knowledgeRefs" JSONB,
    "metadata" JSONB,
    "features" JSONB,
    "languages" TEXT[],
    "videoId" TEXT,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expressions" (
    "id" TEXT NOT NULL,
    "layersId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "sourceDigest" TEXT,
    "parentExpressionId" TEXT,
    "anchor" JSONB,
    "sourceKind" TEXT NOT NULL,
    "mediaId" TEXT,
    "videoId" TEXT,
    "videoSummaryId" TEXT,
    "corpusId" TEXT,
    "metadata" JSONB,
    "features" JSONB,
    "languages" TEXT[],
    "sourceUrl" TEXT,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segmentations" (
    "id" TEXT NOT NULL,
    "expressionId" TEXT NOT NULL,
    "metadata" JSONB,
    "features" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segmentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokenizations" (
    "id" TEXT NOT NULL,
    "segmentationId" TEXT NOT NULL,
    "expressionId" TEXT,
    "kind" TEXT NOT NULL,
    "isCanonical" BOOLEAN NOT NULL DEFAULT true,
    "tokens" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokenizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotation_layers" (
    "id" TEXT NOT NULL,
    "expressionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subkind" TEXT,
    "formalism" TEXT,
    "sourceMethod" TEXT NOT NULL DEFAULT 'manual-native',
    "labelSet" TEXT,
    "tokenizationId" TEXT,
    "ontologyId" TEXT,
    "parentLayerId" TEXT,
    "personaId" TEXT,
    "metadata" JSONB,
    "features" JSONB,
    "languages" TEXT[],
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annotation_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layers_annotations" (
    "id" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "tokenizationId" TEXT,
    "anchor" JSONB NOT NULL,
    "tokenIndex" INTEGER,
    "label" TEXT,
    "value" TEXT,
    "text" TEXT,
    "parentAnnotationId" TEXT,
    "childIds" JSONB,
    "headIndex" INTEGER,
    "targetIndex" INTEGER,
    "arguments" JSONB,
    "confidence" INTEGER,
    "ontologyTypeRefId" TEXT,
    "denotesNodeId" TEXT,
    "knowledgeRefs" JSONB,
    "temporal" JSONB,
    "spatial" JSONB,
    "features" JSONB,
    "startMs" INTEGER,
    "endMs" INTEGER,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layers_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_annotation_relations" (
    "id" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "sourceAnnotationId" TEXT NOT NULL,
    "targetAnnotationId" TEXT NOT NULL,
    "relationTypeRef" JSONB NOT NULL,
    "label" TEXT,
    "features" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_annotation_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_nodes" (
    "id" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "label" TEXT,
    "properties" JSONB,
    "knowledgeRefs" JSONB,
    "metadata" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_edges" (
    "id" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "target" JSONB NOT NULL,
    "sourceLocalId" TEXT,
    "targetLocalId" TEXT,
    "edgeType" TEXT NOT NULL,
    "label" TEXT,
    "ordinal" INTEGER,
    "confidence" INTEGER,
    "properties" JSONB,
    "metadata" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layers_ontologies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "domain" TEXT,
    "parentOntologyId" TEXT,
    "personaId" TEXT,
    "knowledgeRefs" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layers_ontologies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "type_defs" (
    "id" TEXT NOT NULL,
    "ontologyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeKind" TEXT NOT NULL,
    "gloss" TEXT,
    "parentTypeId" TEXT,
    "allowedRoles" JSONB,
    "allowedValues" JSONB,
    "knowledgeRefs" JSONB,
    "features" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "type_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpora" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "domain" TEXT,
    "ontologyRefs" JSONB,
    "languages" TEXT[],
    "metadata" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corpora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_memberships" (
    "id" TEXT NOT NULL,
    "corpusId" TEXT NOT NULL,
    "expressionId" TEXT NOT NULL,
    "split" TEXT,
    "ordinal" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corpus_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cluster_sets" (
    "id" TEXT NOT NULL,
    "expressionId" TEXT,
    "corpusId" TEXT,
    "kind" TEXT NOT NULL,
    "layerId" TEXT,
    "clusters" JSONB NOT NULL,
    "metadata" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cluster_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alignments" (
    "id" TEXT NOT NULL,
    "expressionId" TEXT,
    "kind" TEXT NOT NULL,
    "subkind" TEXT,
    "source" JSONB NOT NULL,
    "target" JSONB NOT NULL,
    "sourceLang" TEXT,
    "targetLang" TEXT,
    "links" JSONB NOT NULL,
    "metadata" JSONB,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "layersUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_videoId_idx" ON "media"("videoId");

-- CreateIndex
CREATE INDEX "media_parentMediaId_idx" ON "media"("parentMediaId");

-- CreateIndex
CREATE INDEX "media_projectId_idx" ON "media"("projectId");

-- CreateIndex
CREATE INDEX "media_createdByUserId_idx" ON "media"("createdByUserId");

-- CreateIndex
CREATE INDEX "expressions_parentExpressionId_idx" ON "expressions"("parentExpressionId");

-- CreateIndex
CREATE INDEX "expressions_videoId_idx" ON "expressions"("videoId");

-- CreateIndex
CREATE INDEX "expressions_videoSummaryId_idx" ON "expressions"("videoSummaryId");

-- CreateIndex
CREATE INDEX "expressions_mediaId_idx" ON "expressions"("mediaId");

-- CreateIndex
CREATE INDEX "expressions_corpusId_idx" ON "expressions"("corpusId");

-- CreateIndex
CREATE INDEX "expressions_sourceKind_idx" ON "expressions"("sourceKind");

-- CreateIndex
CREATE INDEX "expressions_projectId_idx" ON "expressions"("projectId");

-- CreateIndex
CREATE INDEX "expressions_createdByUserId_idx" ON "expressions"("createdByUserId");

-- CreateIndex
CREATE INDEX "segmentations_expressionId_idx" ON "segmentations"("expressionId");

-- CreateIndex
CREATE INDEX "tokenizations_segmentationId_idx" ON "tokenizations"("segmentationId");

-- CreateIndex
CREATE INDEX "tokenizations_expressionId_idx" ON "tokenizations"("expressionId");

-- CreateIndex
CREATE INDEX "annotation_layers_expressionId_kind_idx" ON "annotation_layers"("expressionId", "kind");

-- CreateIndex
CREATE INDEX "annotation_layers_personaId_idx" ON "annotation_layers"("personaId");

-- CreateIndex
CREATE INDEX "annotation_layers_ontologyId_idx" ON "annotation_layers"("ontologyId");

-- CreateIndex
CREATE INDEX "annotation_layers_parentLayerId_idx" ON "annotation_layers"("parentLayerId");

-- CreateIndex
CREATE INDEX "annotation_layers_projectId_idx" ON "annotation_layers"("projectId");

-- CreateIndex
CREATE INDEX "annotation_layers_createdByUserId_idx" ON "annotation_layers"("createdByUserId");

-- CreateIndex
CREATE INDEX "layers_annotations_layerId_idx" ON "layers_annotations"("layerId");

-- CreateIndex
CREATE INDEX "layers_annotations_tokenizationId_idx" ON "layers_annotations"("tokenizationId");

-- CreateIndex
CREATE INDEX "layers_annotations_startMs_endMs_idx" ON "layers_annotations"("startMs", "endMs");

-- CreateIndex
CREATE INDEX "layers_annotations_denotesNodeId_idx" ON "layers_annotations"("denotesNodeId");

-- CreateIndex
CREATE INDEX "layers_annotations_ontologyTypeRefId_idx" ON "layers_annotations"("ontologyTypeRefId");

-- CreateIndex
CREATE INDEX "layers_annotations_projectId_idx" ON "layers_annotations"("projectId");

-- CreateIndex
CREATE INDEX "layers_annotations_createdByUserId_idx" ON "layers_annotations"("createdByUserId");

-- CreateIndex
CREATE INDEX "text_annotation_relations_layerId_idx" ON "text_annotation_relations"("layerId");

-- CreateIndex
CREATE INDEX "text_annotation_relations_sourceAnnotationId_idx" ON "text_annotation_relations"("sourceAnnotationId");

-- CreateIndex
CREATE INDEX "text_annotation_relations_targetAnnotationId_idx" ON "text_annotation_relations"("targetAnnotationId");

-- CreateIndex
CREATE INDEX "graph_nodes_nodeType_idx" ON "graph_nodes"("nodeType");

-- CreateIndex
CREATE INDEX "graph_nodes_projectId_idx" ON "graph_nodes"("projectId");

-- CreateIndex
CREATE INDEX "graph_nodes_createdByUserId_idx" ON "graph_nodes"("createdByUserId");

-- CreateIndex
CREATE INDEX "graph_edges_sourceLocalId_idx" ON "graph_edges"("sourceLocalId");

-- CreateIndex
CREATE INDEX "graph_edges_targetLocalId_idx" ON "graph_edges"("targetLocalId");

-- CreateIndex
CREATE INDEX "graph_edges_edgeType_idx" ON "graph_edges"("edgeType");

-- CreateIndex
CREATE INDEX "graph_edges_projectId_idx" ON "graph_edges"("projectId");

-- CreateIndex
CREATE INDEX "graph_edges_createdByUserId_idx" ON "graph_edges"("createdByUserId");

-- CreateIndex
CREATE INDEX "layers_ontologies_personaId_idx" ON "layers_ontologies"("personaId");

-- CreateIndex
CREATE INDEX "layers_ontologies_projectId_idx" ON "layers_ontologies"("projectId");

-- CreateIndex
CREATE INDEX "layers_ontologies_createdByUserId_idx" ON "layers_ontologies"("createdByUserId");

-- CreateIndex
CREATE INDEX "type_defs_ontologyId_idx" ON "type_defs"("ontologyId");

-- CreateIndex
CREATE INDEX "type_defs_typeKind_idx" ON "type_defs"("typeKind");

-- CreateIndex
CREATE INDEX "type_defs_projectId_idx" ON "type_defs"("projectId");

-- CreateIndex
CREATE INDEX "type_defs_createdByUserId_idx" ON "type_defs"("createdByUserId");

-- CreateIndex
CREATE INDEX "corpora_projectId_idx" ON "corpora"("projectId");

-- CreateIndex
CREATE INDEX "corpora_createdByUserId_idx" ON "corpora"("createdByUserId");

-- CreateIndex
CREATE INDEX "corpus_memberships_corpusId_idx" ON "corpus_memberships"("corpusId");

-- CreateIndex
CREATE INDEX "corpus_memberships_expressionId_idx" ON "corpus_memberships"("expressionId");

-- CreateIndex
CREATE UNIQUE INDEX "corpus_memberships_corpusId_expressionId_key" ON "corpus_memberships"("corpusId", "expressionId");

-- CreateIndex
CREATE INDEX "cluster_sets_expressionId_idx" ON "cluster_sets"("expressionId");

-- CreateIndex
CREATE INDEX "cluster_sets_corpusId_idx" ON "cluster_sets"("corpusId");

-- CreateIndex
CREATE INDEX "cluster_sets_projectId_idx" ON "cluster_sets"("projectId");

-- CreateIndex
CREATE INDEX "cluster_sets_createdByUserId_idx" ON "cluster_sets"("createdByUserId");

-- CreateIndex
CREATE INDEX "alignments_expressionId_idx" ON "alignments"("expressionId");

-- CreateIndex
CREATE INDEX "alignments_projectId_idx" ON "alignments"("projectId");

-- CreateIndex
CREATE INDEX "alignments_createdByUserId_idx" ON "alignments"("createdByUserId");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_parentMediaId_fkey" FOREIGN KEY ("parentMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_parentExpressionId_fkey" FOREIGN KEY ("parentExpressionId") REFERENCES "expressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_videoSummaryId_fkey" FOREIGN KEY ("videoSummaryId") REFERENCES "video_summaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_corpusId_fkey" FOREIGN KEY ("corpusId") REFERENCES "corpora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segmentations" ADD CONSTRAINT "segmentations_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "expressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segmentations" ADD CONSTRAINT "segmentations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokenizations" ADD CONSTRAINT "tokenizations_segmentationId_fkey" FOREIGN KEY ("segmentationId") REFERENCES "segmentations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokenizations" ADD CONSTRAINT "tokenizations_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "expressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_layers" ADD CONSTRAINT "annotation_layers_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "expressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_layers" ADD CONSTRAINT "annotation_layers_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "layers_ontologies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_layers" ADD CONSTRAINT "annotation_layers_parentLayerId_fkey" FOREIGN KEY ("parentLayerId") REFERENCES "annotation_layers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_layers" ADD CONSTRAINT "annotation_layers_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_layers" ADD CONSTRAINT "annotation_layers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layers_annotations" ADD CONSTRAINT "layers_annotations_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "annotation_layers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layers_annotations" ADD CONSTRAINT "layers_annotations_parentAnnotationId_fkey" FOREIGN KEY ("parentAnnotationId") REFERENCES "layers_annotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layers_annotations" ADD CONSTRAINT "layers_annotations_denotesNodeId_fkey" FOREIGN KEY ("denotesNodeId") REFERENCES "graph_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layers_annotations" ADD CONSTRAINT "layers_annotations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_annotation_relations" ADD CONSTRAINT "text_annotation_relations_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "annotation_layers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_annotation_relations" ADD CONSTRAINT "text_annotation_relations_sourceAnnotationId_fkey" FOREIGN KEY ("sourceAnnotationId") REFERENCES "layers_annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_annotation_relations" ADD CONSTRAINT "text_annotation_relations_targetAnnotationId_fkey" FOREIGN KEY ("targetAnnotationId") REFERENCES "layers_annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_annotation_relations" ADD CONSTRAINT "text_annotation_relations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layers_ontologies" ADD CONSTRAINT "layers_ontologies_parentOntologyId_fkey" FOREIGN KEY ("parentOntologyId") REFERENCES "layers_ontologies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layers_ontologies" ADD CONSTRAINT "layers_ontologies_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layers_ontologies" ADD CONSTRAINT "layers_ontologies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "type_defs" ADD CONSTRAINT "type_defs_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "layers_ontologies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "type_defs" ADD CONSTRAINT "type_defs_parentTypeId_fkey" FOREIGN KEY ("parentTypeId") REFERENCES "type_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "type_defs" ADD CONSTRAINT "type_defs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpora" ADD CONSTRAINT "corpora_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_memberships" ADD CONSTRAINT "corpus_memberships_corpusId_fkey" FOREIGN KEY ("corpusId") REFERENCES "corpora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_memberships" ADD CONSTRAINT "corpus_memberships_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "expressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_sets" ADD CONSTRAINT "cluster_sets_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "expressions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_sets" ADD CONSTRAINT "cluster_sets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alignments" ADD CONSTRAINT "alignments_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "expressions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alignments" ADD CONSTRAINT "alignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
