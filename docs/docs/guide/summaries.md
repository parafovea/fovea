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

`GET /api/videos/:videoId/summaries` since v0.1.8 returns only
summaries on personas the requester owns. The pre-v0.1.8 unscoped
listing let a foreign user's imported summary mask the importer's
own summary in the persona switcher.

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
`VideoSummary` row. Poll the job at `GET /api/jobs/:jobId`. Since
v0.1.8 the poll endpoint enforces ownership of the persona that
owns the job's data.

## Summary row fields

The columns most commonly read by clients:

```text
summary           Json    paragraphs of prose, one per array element
visualAnalysis    String? raw VLM output before paragraph splitting
audioTranscript   String? transcript text
keyFrames         Json?   selected frame ids and timestamps
transcriptJson    Json?   structured transcript (vendor-specific)
audioLanguage     String? ISO code from the transcription vendor
audioModelUsed    String? vendor adapter id
visualModelUsed   String? VLM id (e.g. "qwen-2-5-vl-7b")
fusionStrategy    String? "sequential" | "parallel" | "audio-first"
claimsJson        Json?   serialized extracted claims (denormalized)
comment           Text?   user-authored comment
```

The full set is in
`server/prisma/schema.prisma` under `model VideoSummary` and the
canonical TypeBox is in `server/src/routes/summaries.ts`.

## Edit a summary

`PUT /api/videos/:videoId/summaries/:summaryId` accepts a partial
update. The route runs `assertSummaryOwned` so only the owning
user can edit. Use this to correct the summary text or set the
`comment` field.
