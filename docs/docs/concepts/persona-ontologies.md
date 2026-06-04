# Persona-scoped ontologies

A persona is the unit of analytic viewpoint. Two analysts watching
the same video frame describe it differently because they care
about different things; Fovea makes that difference first-class
by binding the ontology to the persona, not to the project or to
the video.

## Why per-persona

A project-scoped ontology forces every analyst on a project into
a single shared vocabulary. That works when the analysts agree;
when they disagree, the shared vocabulary either pleases nobody
or accumulates all four disagreeing definitions of "Pass" as
near-duplicate types.

Per-persona ontologies sidestep the disagreement. Each analyst
constructs the vocabulary that fits their information need; the
same physical video can host parallel annotation sets under
different personas without cross-talk.

## What scopes to a persona

The four ontology lists are persona-scoped:

```text
entityTypes      Persona.ontology.entityTypes
eventTypes       Persona.ontology.eventTypes
roleTypes        Persona.ontology.roleTypes
relationTypes    Persona.ontology.relationTypes
```

Annotations carry `personaId` (for type annotations) or are
linked to world objects (for object annotations). Summaries carry
`(videoId, personaId)`. Claims hang off summaries.

## What does not scope to a persona

World state is per-user, not per-persona:

```text
WorldState.userId @unique
```

This is intentional. A user studying a soccer match under a
"Coach" persona and a "Referee" persona is studying the same
real-world objects. The named instances (`Player 9`, the specific
match, the home stadium) are shared across the user's personas
even though the type vocabulary differs.

## Implications for ontology change

Editing an ontology does not invalidate existing annotations;
labels are stored as plain ids. If a typeId is renamed, existing
annotations keep their old id. The ontology becomes the
authoritative lookup at render time; missing ids show as
unresolved.

## Cross-persona linking

The relations layer (claim relations, world relations) lets a
user assert links across persona boundaries: a claim under
persona A can target a claim under persona B if both belong to
the same user. The frontend filters by persona for the per-persona
views; the API responses include the foreign claim text where
ownership permits.
