# Data isolation

Multi-user mode (`FOVEA_MODE=multi-user`) gives each user private
ontologies, world state, annotations, summaries, claims, API keys,
sessions, and import history. v0.1.8 closed a multi-user data
isolation bug class by making every list and every mutation
endpoint user-scoped through `lib/ownership.ts` helpers.

## The ownership scheme

Every owned row carries a user-id column:

```text
Persona.userId
WorldState.userId @unique
Annotation.personaId | Annotation.userId
VideoSummary owned via VideoSummary.personaId -> Persona.userId
Claim       owned via Claim.summaryId         -> VideoSummary -> Persona
ImportHistory.importedBy
ApiKey.userId (NULL for admin shared-pool keys)
Session.userId
```

The ownership check resolves through these relations to the user
id and compares against `request.user.id`.

## The helpers

`server/src/lib/ownership.ts` exposes:

```text
getUserPersonaIds(userId)             -> string[]
assertPersonaOwned(userId, personaId)
assertAnnotationOwned(userId, annotationId)
assertSummaryOwned(userId, summaryId)
assertSummaryByKeyOwned(userId, videoId, personaId)
assertClaimOwned(userId, claimId)
assertClaimRelationOwned(userId, relationId)
```

Every helper throws `NotFoundError`, not `ForbiddenError`. The
deliberate choice avoids confirming the existence of records the
requester cannot see; an attacker probing for a known summaryId
gets the same response whether the id exists under another user
or does not exist at all.

## The matrix

`test/integration/multi-user-isolation.test.ts` is a forward
protection test. It enumerates every user-scoped GET endpoint,
seeds parallel data for two users, and asserts each user's
response excludes the other's records. Adding a new listing route
to the matrix is the documented protection against the next
missed-scoping regression.

The matrix grew during v0.1.8 to include
`GET /api/annotations/:videoId`,
`GET /api/videos/:videoId/summaries`,
`GET /api/personas/:id/ontology`,
`GET /api/import/history`,
`GET /api/summaries/:summaryId/claims`,
`GET /api/summaries/:summaryId/claims/:claimId`, and the three
job-status endpoints
(`GET /api/jobs/:jobId`, `GET /api/jobs/claims/:jobId`,
`GET /api/jobs/synthesis/:jobId`).

## What v0.1.8 fixed

The full list is in
[Project > Changelog](../project/changelog.md). The headline items:

- `PUT /api/ontology` no longer accepts a foreign personaId or
  ontology id. The pre-fix upsert silently overwrote the foreign
  user's persona name, role, informationNeed, and entire ontology.
- `POST /api/ontology/augment` is now `requireAuth` and
  ownership-checked. It was previously `optionalAuth`, letting any
  visitor consume model-service quota under another user's
  persona context.
- `POST /api/videos/:videoId/detect` checks ownership of the
  `personaId` body field before reading the persona's ontology.
- `POST /api/summaries/:summaryId/claims/:claimId/relations`
  checks ownership of both source and target claims.
- `POST /api/personas` and `PUT /api/personas/:id` silently coerce
  `isSystemGenerated` to `false` for non-admin requests.
- `ImportHandler.importAnnotation` writes
  `userId = this.userId` on every imported annotation row, so the
  user-scoped listing surfaces them correctly.
- `POST /api/import` writes `importedBy = request.user.id` so
  `GET /api/import/history` returns the importer's rows.

## Single-user mode

In single-user mode the seeded default user owns everything and
the ownership check is a tautology. The same code path runs; the
helpers accept the single user id and the assertions pass.
Migration to multi-user mode is therefore not a code change but a
configuration change plus user provisioning.
