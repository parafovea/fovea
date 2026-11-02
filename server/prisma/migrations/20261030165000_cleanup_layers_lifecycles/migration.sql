-- Match the UUIDv5 derivations in services/layers-id-map.ts.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Project-world records must not become personal records when their project is deleted.
ALTER TABLE "graph_nodes" DROP CONSTRAINT "graph_nodes_projectId_fkey";
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "graph_edges" DROP CONSTRAINT "graph_edges_projectId_fkey";
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_collections" DROP CONSTRAINT "catalog_collections_projectId_fkey";
ALTER TABLE "catalog_collections" ADD CONSTRAINT "catalog_collections_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_memberships" DROP CONSTRAINT "catalog_memberships_projectId_fkey";
ALTER TABLE "catalog_memberships" ADD CONSTRAINT "catalog_memberships_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Claims refer to summaries through native argumentRefs. Clean that dependent
-- graph for explicit summary deletion and for persona/video FK cascades alike.
CREATE FUNCTION cleanup_summary_layers() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  claim_ids TEXT[];
  claim_layer_id TEXT := uuid_generate_v5('b6f0a3d2-3c2b-4e5a-9f1c-7d8e5a2b1c00'::uuid,
    'layer:claim-span|' || OLD.id)::text;
  edge_ids TEXT[];
BEGIN
  -- Argument refs are user-editable: they cannot authorize deleting another
  -- layer or node. Select only primary bearers in this summary's derived layer.
  SELECT array_agg(DISTINCT "denotesNodeId") INTO claim_ids
  FROM layers_annotations
  WHERE "layerId" = claim_layer_id
    AND id = uuid_generate_v5('b6f0a3d2-3c2b-4e5a-9f1c-7d8e5a2b1c00'::uuid,
      'ann:claim|' || "denotesNodeId")::text;
  SELECT array_agg(id) INTO edge_ids FROM graph_edges
  WHERE "sourceLocalId" = ANY(claim_ids) OR "targetLocalId" = ANY(claim_ids);
  DELETE FROM layers_annotations a WHERE a.label = 'relation-span' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.arguments) = 'array' THEN a.arguments ELSE '[]'::jsonb END) arg
    WHERE arg->>'role' = 'relation-of' AND arg->'target'->'localId'->>'value' = ANY(edge_ids));
  DELETE FROM graph_edges WHERE id = ANY(edge_ids);
  DELETE FROM annotation_layers WHERE id = claim_layer_id;
  DELETE FROM graph_nodes WHERE id = ANY(claim_ids);
  DELETE FROM expressions WHERE id = uuid_generate_v5(
    'b6f0a3d2-3c2b-4e5a-9f1c-7d8e5a2b1c00'::uuid, 'expr:transcript|' || OLD.id)::text;
  RETURN OLD;
END;
$$;
CREATE TRIGGER delete_summary_layers BEFORE DELETE ON video_summaries
  FOR EACH ROW EXECUTE FUNCTION cleanup_summary_layers();

-- World scaffold rows and soft ownership columns have no parent FK cascade.
CREATE FUNCTION cleanup_user_layers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM video_summaries WHERE "createdBy" = OLD.id;
  DELETE FROM graph_edges WHERE "createdByUserId" = OLD.id
    OR "sourceLocalId" IN (SELECT id FROM graph_nodes WHERE "createdByUserId" = OLD.id)
    OR "targetLocalId" IN (SELECT id FROM graph_nodes WHERE "createdByUserId" = OLD.id);
  DELETE FROM catalog_memberships WHERE "createdByUserId" = OLD.id;
  DELETE FROM catalog_collections WHERE "createdByUserId" = OLD.id;
  DELETE FROM layers_annotations WHERE "createdByUserId" = OLD.id;
  DELETE FROM expressions WHERE "sourceKind" = 'world-model' AND "createdByUserId" = OLD.id;
  DELETE FROM graph_nodes WHERE "createdByUserId" = OLD.id;
  -- Shared video grouping layers may still contain other users' annotations.
  UPDATE annotation_layers SET "createdByUserId" = NULL WHERE "createdByUserId" = OLD.id;
  UPDATE cluster_sets SET "createdByUserId" = NULL WHERE "createdByUserId" = OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER delete_user_layers BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION cleanup_user_layers();

CREATE FUNCTION cleanup_project_world_scaffolds() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM expressions WHERE "sourceKind" = 'world-model' AND "projectId" = OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER delete_project_world_scaffolds BEFORE DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION cleanup_project_world_scaffolds();

-- Run summary cleanup before other cascades remove its bearer annotations.
CREATE FUNCTION cleanup_video_summaries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM video_summaries WHERE "videoId" = OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER delete_video_summaries BEFORE DELETE ON videos
  FOR EACH ROW EXECUTE FUNCTION cleanup_video_summaries();
CREATE FUNCTION cleanup_persona_summaries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM video_summaries WHERE "personaId" = OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER delete_persona_summaries BEFORE DELETE ON personas
  FOR EACH ROW EXECUTE FUNCTION cleanup_persona_summaries();
