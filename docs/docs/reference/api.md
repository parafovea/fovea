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
POST   /api/videos/:videoId/transcribe body { language?, enableDiarization?,
                                              numSpeakers?, minSpeakers?,
                                              maxSpeakers? }
```

`POST /api/videos/:videoId/transcribe` forwards to the model-service
`/api/transcribe` route, and when `enableDiarization=true` also to
`/api/diarize`, merging speaker labels onto every transcript segment
by per-second overlap. See
[Guide > Transcribe and diarize](../guide/transcribe-and-diarize.md).
Status codes: 400 (bad body), 404 (no such video), 500 (model error),
502 (model service unreachable), 504 (timed out).

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

## Projects

```text
GET    /api/projects
POST   /api/projects                       body { name, description?, slug,
                                                  ownerUserId?, ownerGroupId?,
                                                  settings? }
GET    /api/projects/:projectId
PUT    /api/projects/:projectId
DELETE /api/projects/:projectId
GET    /api/projects/:projectId/members
POST   /api/projects/:projectId/members            body { userId, role }
PUT    /api/projects/:projectId/members/:userId    body { role }
DELETE /api/projects/:projectId/members/:userId
GET    /api/projects/:projectId/personas
GET    /api/projects/:projectId/world
PUT    /api/projects/:projectId/world
```

Roles: `project_owner | project_manager | annotator | reviewer | viewer`.

## Groups

```text
GET    /api/groups
POST   /api/groups                                 body { name, description?, slug }
GET    /api/groups/:groupId
PUT    /api/groups/:groupId
DELETE /api/groups/:groupId
GET    /api/groups/:groupId/members
POST   /api/groups/:groupId/members                body { userId, role }
PUT    /api/groups/:groupId/members/:userId        body { role }
DELETE /api/groups/:groupId/members/:userId

GET    /api/admin/groups                           admin only
POST   /api/admin/groups
PUT    /api/admin/groups/:groupId
DELETE /api/admin/groups/:groupId
GET    /api/admin/groups/:groupId/members
```

Group roles: `group_owner | group_admin | group_member`.

## Video assignments

```text
GET    /api/projects/:projectId/videos                              list assignments
POST   /api/projects/:projectId/videos                              body { videoId, assignedUserId? }
DELETE /api/projects/:projectId/videos/:videoId

POST   /api/admin/video-assignments/bulk                            admin only
GET    /api/admin/video-assignments/rules                           admin only
POST   /api/admin/video-assignments/rules                           admin only
PUT    /api/admin/video-assignments/rules/:ruleId                   admin only
DELETE /api/admin/video-assignments/rules/:ruleId                   admin only
POST   /api/admin/video-assignments/rules/:ruleId/evaluate          admin only
POST   /api/admin/video-assignments/rules/evaluate-all              admin only
```

## Sharing

```text
POST   /api/sharing                  body { resourceType, resourceId,
                                            sharedWithUserId? | sharedWithGroupId?,
                                            permissionLevel, expiresAt? }
GET    /api/sharing/received
GET    /api/sharing/sent
DELETE /api/sharing/:shareId
POST   /api/sharing/:shareId/fork
```

`resourceType` is one of `annotation | summary | claim | persona | world_state`.
`permissionLevel` is `read_only` or `forkable`.

## Admin permissions

```text
GET    /api/admin/permissions
POST   /api/admin/permissions       body { scope, role, resourceType, action, ownOnly? }
PATCH  /api/admin/permissions/:id   body { ownOnly }
DELETE /api/admin/permissions/:id
```

All require `systemRole = 'system_admin'`. Mutations invalidate the
per-user ability cache.

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

Backend proxy endpoints (mounted under `/api`):

```text
GET    /api/models/config
GET    /api/models/status
POST   /api/models/validate
GET    /api/models/defaults                  per-task default knobs
GET    /api/models/frameworks                framework metadata for UI
```

## Model service (FastAPI, `:8000`)

The model service is not authenticated at the HTTP layer; the
backend is the only client and gates every call. Routes are
defined under
`model-service/src/infrastructure/adapters/inbound/fastapi/routes/`.

```text
GET    /models/config
GET    /models/status
POST   /models/select
POST   /models/validate
POST   /models/load/{task_type}
POST   /models/unload/{task_type}
GET    /models/task-ready/{task_type}
POST   /detection/detect             body: DetectionRequest schema
POST   /tracking/track                body: TrackingRequest schema
POST   /summarize                     body: SummarizationRequest;
                                      response carries optional ReasonedText
POST   /ontology/augment              body: OntologyAugmentRequest
POST   /extract-claims                body: ClaimExtractionRequest
POST   /synthesize-summary            body: SummarySynthesisRequest
POST   /thumbnails/generate           body: ThumbnailRequest;
                                      writes to THUMBNAIL_OUTPUT_ROOT
POST   /admin/reconfigure             gated by MODEL_SERVICE_ADMIN_TOKEN
POST   /transcribe                    body { audio_path, language? };
                                      returns { text, segments, language,
                                      duration, processing_time, model_used }
POST   /diarize                       body { audio_path, num_speakers?,
                                      min_speakers?, max_speakers? };
                                      returns { segments, speakers,
                                      processing_time, model_used }
```

`POST /transcribe` and `POST /diarize` are the standalone audio
endpoints. The backend
`/api/videos/:videoId/transcribe` route calls both and merges them;
direct callers can hit them independently.

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
