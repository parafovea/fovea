# Summaries

Use the summaries API to generate, read, and edit VLM-derived
summaries of a video against a specific persona. A summary row is
keyed by the (videoId, personaId) pair; one persona can have at
most one summary per video.

## Endpoints

```text
GET    /api/videos/:videoId/summaries
GET    /api/videos/:videoId/summaries/:personaId
POST   /api/summaries                            # write a hand-crafted summary
PUT    /api/videos/:videoId/summaries/:summaryId # edit existing
DELETE /api/videos/:videoId/summaries/:personaId
POST   /api/videos/summaries/generate            # enqueue VLM job
GET    /api/jobs/:jobId                          # poll the VLM job
```

`GET /api/videos/:videoId/summaries` returns only summaries on
personas the requester owns.

## Generate a summary

```bash
curl -X POST http://localhost:3001/api/videos/summaries/generate \
  -H 'Content-Type: application/json' --cookie cookies.txt \
  -d '{"videoId":"<id>","personaId":"<id>"}'
# {"jobId":"<job>","status":"queued"}
```

The job runs in the BullMQ summarization queue. The model service
performs frame extraction, audio transcription, and VLM
captioning; when complete it writes the result back as a
`VideoSummary` row. Poll the job at `GET /api/jobs/:jobId`; the
poll endpoint enforces ownership of the persona that owns the
job's data.

## Summary row fields

The columns most commonly read by clients:

```text
summary           Json    GlossItem[]; each item is {type, content, refType?, refPersonaId?, refClaimId?} for rich text with inline references
visualAnalysis    String? raw VLM output before paragraph splitting
audioTranscript   String? transcript text
keyFrames         Json?   selected frame ids and timestamps
transcriptJson    Json?   structured transcript (vendor-specific)
audioLanguage     String? ISO code from the transcription vendor
audioModelUsed    String? vendor adapter id
visualModelUsed   String? VLM id (e.g. "qwen-2-5-vl-7b")
fusionStrategy    String? "sequential" | "timestamp_aligned" | "native_multimodal" | "hybrid"
claimsJson        Json?   serialized extracted claims (denormalized)
comment           Text?   user-authored comment
```

The full set is in
`server/prisma/schema.prisma` under `model VideoSummary` and the
canonical TypeBox is in `server/src/routes/summaries.ts`.

## Edit a summary

`PUT /api/videos/:videoId/summaries/:summaryId` replaces the
`summary` field with a new `GlossItem[]` array (the request body
accepts only `summary`; no other fields are writable through this
endpoint). The route loads the existing row and runs
`request.ability.can('update', subject('VideoSummary', existing))`,
throwing `ForbiddenError` if the caller's abilities (built by
`buildAbilities`) do not permit updating that specific row.

## Reasoning traces

Summaries produced by a thinking-capable VLM (Qwen3-VL thinking
variants) carry an optional `ReasonedText` block on the model
service response, capturing the chain-of-thought trace
alongside the visible summary text. The DTOs are documented in
[Guide > Reasoning traces](reasoning-traces.md). The frontend
renders the trace inside a collapsible panel when present.
