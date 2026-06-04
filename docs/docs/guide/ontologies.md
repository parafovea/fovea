# Ontologies

Use the ontology API to read and replace the four type lists that
back a persona: `entityTypes`, `eventTypes`, `roleTypes`, and
`relationTypes`. The ontology is a single document, not a graph
of independent rows; `PUT /api/ontology` replaces the whole
document for one persona.

## Endpoints

```text
GET  /api/ontology?personaId=<id>
PUT  /api/ontology
POST /api/ontology/augment
```

Per-type detail endpoints expose individual entity / event / role /
relation types under the persona namespace:

```text
GET    /api/personas/:personaId/entity-types/:typeId
DELETE /api/personas/:personaId/entity-types/:typeId
GET    /api/personas/:personaId/event-types/:typeId
DELETE /api/personas/:personaId/event-types/:typeId
GET    /api/personas/:personaId/role-types/:typeId
DELETE /api/personas/:personaId/role-types/:typeId
GET    /api/personas/:personaId/relation-types/:typeId
DELETE /api/personas/:personaId/relation-types/:typeId
```

## Document shape

Each list holds objects with at least an `id` and a `name`.
Entity, event, and relation types may also carry properties,
attribute schemas, and descriptions. The full TypeBox shape is
defined in `server/src/routes/schemas.ts`; the canonical reference
is `server/src/routes/ontology.ts`.

```json
{
  "personaId": "<persona-uuid>",
  "entityTypes":   [{"id":"player","name":"Player","description":"..."}],
  "eventTypes":    [{"id":"pass","name":"Pass","roles":["passer","receiver"]}],
  "roleTypes":     [{"id":"passer","name":"Passer"}],
  "relationTypes": [{"id":"causes","name":"causes"}]
}
```

## Replace the ontology

```bash
curl -X PUT http://localhost:3001/api/ontology \
  -H 'Content-Type: application/json' --cookie cookies.txt \
  -d @ontology.json
```

`PUT /api/ontology` refuses to upsert a persona id or ontology id
whose existing row belongs to a different user, returning 404.

## Augment with AI

`POST /api/ontology/augment` posts the current ontology plus a
free-text prompt to the model service and returns suggested
additions for the four type lists. The route requires
authentication and an owned `personaId`.

```bash
curl -X POST http://localhost:3001/api/ontology/augment \
  -H 'Content-Type: application/json' --cookie cookies.txt \
  -d '{"personaId":"<id>","prompt":"Add types for set pieces."}'
```

The selected augmentation model is `model-service/config/models.yaml`
under `ontology_augmentation`; see
[Reference > Model config](../reference/model-config.md).
