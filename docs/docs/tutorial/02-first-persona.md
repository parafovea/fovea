# First persona

A persona is a named role plus an information need. Each persona
owns a private ontology with four lists: entity types, event types,
role types, and relation types. Every annotation, summary, and
claim is scoped to a persona. The persona is the unit of analytic
viewpoint.

This chapter creates the persona used by every later chapter:
"Soccer Match Analyst", whose information need is to study pitcher
mechanics on a soccer field.

## Create the persona

The frontend exposes the persona builder under "Personas" in the
top navigation. The equivalent API call:

```bash
curl -s -X POST http://localhost:3001/api/personas \
  -H 'Content-Type: application/json' \
  --cookie cookies.txt \
  -d '{
    "name": "Soccer Match Analyst",
    "role": "sports analyst",
    "informationNeed": "Identify pitcher mechanics, throwing form, and field positioning during live match play."
  }'
# {"id":"<persona-uuid>","name":"Soccer Match Analyst",...}
```

Save the returned `id` as `PERSONA_ID`. The persona's ontology row
is created lazily the first time the ontology is read.

## Seed the ontology

The persona starts with an empty ontology. Populate the four lists
through `PUT /api/personas/:id/ontology` (the full ontology
document, not a diff):

```bash
curl -s -X PUT http://localhost:3001/api/personas/$PERSONA_ID/ontology \
  -H 'Content-Type: application/json' \
  --cookie cookies.txt \
  -d '{
    "entities":     [{"id":"player","name":"Player"},
                     {"id":"ball","name":"Ball"},
                     {"id":"field","name":"Field"}],
    "events":       [{"id":"pass","name":"Pass"},
                     {"id":"shot","name":"Shot"},
                     {"id":"foul","name":"Foul"}],
    "roles":        [{"id":"passer","name":"Passer"},
                     {"id":"receiver","name":"Receiver"}],
    "relationTypes":[{"id":"causes","name":"causes"}]
  }'
```

The full type schema (sub-properties, descriptions, attributes) is
documented in [Guide > Ontologies](../guide/ontologies.md).

## Why personas?

A second persona on the same instance gets its own ontology and its
own world state. Annotations and summaries written under one
persona are never shown to another. The same physical video can
host parallel annotation sets from different personas (a referee
analyst, a coach, an opposition scout) without cross-talk. See
[Concepts > Persona-scoped ontologies](../concepts/persona-ontologies.md)
for the rationale.

## Next

Continue to [Annotate a video](03-annotate-a-video.md) to add the
first bounding-box sequence.
