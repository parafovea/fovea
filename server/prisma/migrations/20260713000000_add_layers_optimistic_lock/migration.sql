-- Optimistic-concurrency counters on the layers graph + ontology tables.
-- Guarded updates compare-and-swap on "lockVersion" so a concurrent writer
-- cannot silently clobber a same-object edit (the layers re-homing of the
-- 0.5.9 WorldState/Ontology version-guard hardening).
ALTER TABLE "graph_nodes" ADD COLUMN "lockVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "graph_edges" ADD COLUMN "lockVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "layers_ontologies" ADD COLUMN "lockVersion" INTEGER NOT NULL DEFAULT 0;
