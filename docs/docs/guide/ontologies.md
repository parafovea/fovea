# Ontologies

Use the ontology API to read and replace the four type lists that
back a persona: `entities`, `events`, `roles`, and `relationTypes`.
The ontology is a single document, not a graph of independent rows;
`PUT /api/ontology` replaces the whole document for one persona.
(The underlying Prisma columns are named `entityTypes`, `eventTypes`,
`roleTypes`, and `relationTypes`, but the HTTP API drops the `Types`
suffix for the first three.)

## Endpoints

```text
GET  /api/ontology
PUT  /api/ontology
POST /api/ontology/augment
```

`GET /api/ontology` returns `{ personas, personaOntologies, world }`
for the authenticated user; there is no per-persona filter parameter.

Deletion endpoints under the persona namespace remove individual
entity, event, role, and relation types, with a companion preview
endpoint that reports what the deletion would cascade:

```text
DELETE /api/personas/:personaId/ontology/entities/:typeId
DELETE /api/personas/:personaId/ontology/events/:typeId
DELETE /api/personas/:personaId/ontology/roles/:typeId
DELETE /api/personas/:personaId/ontology/relation-types/:typeId
GET    /api/personas/:personaId/ontology/entities/:typeId/deletion-preview
GET    /api/personas/:personaId/ontology/events/:typeId/deletion-preview
GET    /api/personas/:personaId/ontology/roles/:typeId/deletion-preview
GET    /api/personas/:personaId/ontology/relation-types/:typeId/deletion-preview
```

## Document shape

Each list holds objects with at least an `id` and a `name`.
Entity, event, and relation types may also carry properties,
attribute schemas, and descriptions. The TypeBox shape (including
`PersonaOntologySchema`, `PersonaSchema`, and `WorldSchema`) is
defined inline in `server/src/routes/ontology.ts`.

```json
{
  "personaId": "<persona-uuid>",
  "entities":      [{"id":"player","name":"Player","description":"..."}],
  "events":        [{"id":"pass","name":"Pass","roles":["passer","receiver"]}],
  "roles":         [{"id":"passer","name":"Passer"}],
  "relationTypes": [{"id":"causes","name":"causes"}]
}
```

## Replace the ontology

```bash
curl -X PUT http://localhost:3001/api/ontology \
  -H 'Content-Type: application/json' --cookie cookies.txt \
  -d @ontology.json
```

`PUT /api/ontology` refuses to upsert a persona or ontology whose
owning persona belongs to a different user, returning 403. A 404 is
returned only when the ontology's referenced `personaId` does not
exist at all.

## Augment with AI

`POST /api/ontology/augment` posts a domain string plus a target
category (and optionally a list of existing type names to avoid
duplicates) to the model service and returns suggested types. The
route requires authentication and an owned `personaId`. The
`targetCategory` field selects which list the suggestions are for
(`entity`, `event`, `role`, or `relation`).

```bash
curl -X POST http://localhost:3001/api/ontology/augment \
  -H 'Content-Type: application/json' --cookie cookies.txt \
  -d '{"personaId":"<id>","domain":"soccer set pieces","targetCategory":"event"}'
```

The augmentation model is selected by the `ontology_augmentation`
task block in `model-service/config/models.yaml`; see
[Reference > Model config](../reference/model-config.md).
