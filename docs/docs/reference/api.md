# API

Every REST endpoint grouped by resource. All paths are mounted
under `/api`. Authentication is cookie-based; see
[Guide > Authentication](../guide/authentication.md). Routes
marked `requireAuth` reject unauthenticated requests with 401.
Routes marked `optionalAuth` accept anonymous requests but return
a reduced view.

## Auth

```text
POST   /api/auth/login             body { username, password }
POST   /api/auth/logout
POST   /api/auth/register          body { username, password, email, displayName }
GET    /api/auth/me
GET    /api/auth/session-status
POST   /api/auth/extend-session
```

`POST /api/auth/register` returns 403 when `ALLOW_REGISTRATION=false`.

## Users (admin)

```text
GET    /api/user/profile
PUT    /api/user/profile
GET    /api/admin/users            admin only
POST   /api/admin/users            admin only
```

## Sessions

```text
GET    /api/sessions               requester's sessions
GET    /api/admin/sessions         admin only, all sessions
```

## API keys

```text
GET    /api/api-keys               requester's keys
POST   /api/api-keys               body { provider, keyName, key }
GET    /api/admin/api-keys         admin only, shared pool
POST   /api/admin/api-keys         admin only, add to shared pool
```

## Personas

```text
GET    /api/personas
POST   /api/personas               body { name, role, informationNeed, details? }
GET    /api/personas/:id
PUT    /api/personas/:id
DELETE /api/personas/:id
GET    /api/personas/:id/deletion-preview
GET    /api/personas/:id/ontology
PUT    /api/personas/:id/ontology
GET    /api/personas/:personaId/entity-types/:typeId
DELETE /api/personas/:personaId/entity-types/:typeId
GET    /api/personas/:personaId/event-types/:typeId
DELETE /api/personas/:personaId/event-types/:typeId
GET    /api/personas/:personaId/role-types/:typeId
DELETE /api/personas/:personaId/role-types/:typeId
GET    /api/personas/:personaId/relation-types/:typeId
DELETE /api/personas/:personaId/relation-types/:typeId
```

`POST` and `PUT` silently coerce `isSystemGenerated` to `false`
for non-admin requesters.

## Ontology

```text
GET    /api/ontology               query personaId
PUT    /api/ontology               body { personaId, entityTypes, eventTypes,
                                          roleTypes, relationTypes }
POST   /api/ontology/augment       requireAuth; body { personaId, prompt }
```

## World

```text
GET    /api/world
PUT    /api/world                  body { entities, events, times,
                                          entityCollections, eventCollections,
                                          timeCollections, relations }
DELETE /api/admin/world/:userId    admin only
```

## Videos

```text
GET    /api/videos
GET    /api/videos/:videoId
GET    /api/videos/:videoId/url
GET    /api/videos/:videoId/stream
GET    /api/videos/:videoId/thumbnail
POST   /api/videos/sync
POST   /api/videos/:videoId/detect body { personaId, frame }
```

## Annotations

```text
GET    /api/annotations/:videoId
POST   /api/annotations            body { videoId, type, label, frames,
                                          personaId?, linkType? }
PUT    /api/annotations/:id
DELETE /api/annotations/:videoId/:id
```

## Summaries

```text
GET    /api/videos/:videoId/summaries
GET    /api/videos/:videoId/summaries/:personaId
POST   /api/summaries                              hand-write a summary row
PUT    /api/videos/:videoId/summaries/:summaryId
DELETE /api/videos/:videoId/summaries/:personaId
POST   /api/videos/summaries/generate              enqueue VLM job
GET    /api/jobs/:jobId                            poll the VLM job
```

## Claims

```text
GET    /api/summaries/:summaryId/claims
GET    /api/summaries/:summaryId/claims/:claimId
POST   /api/summaries/:summaryId/claims
PUT    /api/summaries/:summaryId/claims/:claimId
DELETE /api/summaries/:summaryId/claims/:claimId
POST   /api/summaries/:summaryId/claims/generate
GET    /api/jobs/claims/:jobId
POST   /api/summaries/:summaryId/synthesize
GET    /api/jobs/synthesis/:jobId
GET    /api/videos/:videoId/personas/:personaId/claims
```

## Claim relations

```text
POST   /api/summaries/:summaryId/claims/:claimId/relations
GET    /api/summaries/:summaryId/claims/:claimId/relations
DELETE /api/summaries/:summaryId/claims/relations/:relationId
```

## Import / Export

```text
GET    /api/export                 full export
GET    /api/export/personas
GET    /api/export/world
GET    /api/export/summaries
GET    /api/export/stats
POST   /api/import                 multipart upload; returns 4xx (typically
                                   413) on FST_*_LIMIT
POST   /api/import/preview         dry-run, returns conflict report
GET    /api/import/history         requester's prior imports
```

## Models

```text
GET    /api/models/config
GET    /api/models/status
POST   /api/models/validate
```

## Config and telemetry

```text
GET    /api/config
POST   /api/telemetry/traces
```

## Status codes

```text
200   ok
201   created
204   no content (deletes)
400   validation failed
401   unauthenticated (requireAuth routes)
403   forbidden (e.g. registration disabled, non-admin admin route)
404   not found OR foreign-owned (ownership helpers throw NotFoundError)
413   request too large (multipart upload)
429   too many requests (LoginAttempt-driven lockout)
500   unhandled error
```
