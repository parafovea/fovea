# Personas

Use the personas API to create, update, and delete the named roles
that scope every annotation, summary, and claim. A persona has a
`name`, a `role`, an `informationNeed`, and an optional `details`
field. Each persona owns exactly one ontology document.

## Endpoints

```text
GET    /api/personas
POST   /api/personas
GET    /api/personas/:id
PUT    /api/personas/:id
DELETE /api/personas/:id
GET    /api/personas/:id/deletion-preview
GET    /api/personas/:id/ontology
PUT    /api/personas/:id/ontology
```

`GET /api/personas` returns the requester's personas plus any
persona with `isSystemGenerated = true`. Anonymous requests get
only the system-generated personas. Multi-user mode never leaks a
non-system persona to a foreign user.

## Create

```bash
curl -X POST http://localhost:3001/api/personas \
  -H 'Content-Type: application/json' --cookie cookies.txt \
  -d '{"name":"Soccer Match Analyst","role":"sports analyst",
       "informationNeed":"Identify pitcher mechanics."}'
```

`POST /api/personas` rejects an `isSystemGenerated: true` field on
non-admin requests; the route silently coerces it to `false` so a
regular user cannot publish their persona to anonymous visitors.
The same coercion applies to `PUT /api/personas/:id`.

## Deletion preview

`GET /api/personas/:id/deletion-preview` returns a count of
dependent rows (annotations, summaries, claims) that would be
removed by `DELETE /api/personas/:id`. The frontend uses this to
warn before a destructive action.

## Ontology endpoints

`GET /api/personas/:id/ontology` returns the four type lists.
Since v0.1.8 the route enforces ownership for non-system personas;
an anonymous or foreign request returns 404, not 403. See
[Guide > Ontologies](ontologies.md) for the document shape.

## System-generated personas

A persona with `isSystemGenerated = true` is visible to anonymous
visitors and across users. Only an admin can set the flag. Use
this for shared starter personas; do not use it as an alternative
to actual sharing.
