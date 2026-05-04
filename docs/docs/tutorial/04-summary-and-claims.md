# Summary and claims

A video summary in Fovea is a (videoId, personaId) pair carrying
prose paragraphs, an audio transcript, key frames, and the model
outputs that produced them. A claim is a hierarchical assertion
extracted from a summary, with gloss items that point at world
objects (entities, events, types) by id.

This chapter generates a summary against the persona and extracts
claims from it.

## Queue a summary job

`POST /api/videos/summaries/generate` enqueues a BullMQ job that
the model service processes:

```bash
curl -s -X POST http://localhost:3001/api/videos/summaries/generate \
  -H 'Content-Type: application/json' \
  --cookie cookies.txt \
  -d "{\"videoId\":\"$VIDEO_ID\",\"personaId\":\"$PERSONA_ID\"}"
# {"jobId":"<job-uuid>","status":"queued"}
```

Poll the job status until it completes:

```bash
curl -s "http://localhost:3001/api/jobs/$JOB_ID" --cookie cookies.txt
# {"status":"completed","summaryId":"<summary-uuid>"}
```

The summary is now available at
`GET /api/videos/:videoId/summaries/:personaId`. Save the
returned `id` as `SUMMARY_ID`.

## Extract claims

`POST /api/summaries/:summaryId/claims/generate` enqueues claim
extraction against the summary text:

```bash
curl -s -X POST "http://localhost:3001/api/summaries/$SUMMARY_ID/claims/generate" \
  -H 'Content-Type: application/json' \
  --cookie cookies.txt \
  -d '{}'
# {"jobId":"<job-uuid>","status":"queued"}
```

When the job completes, the claims live under
`GET /api/summaries/:summaryId/claims`. Each claim row carries
`text`, a hierarchical `gloss` array, an optional `parentClaimId`
(for sub-claims), and modality flags (`audio`, `video`, `metadata`).

The gloss array carries one entry per token-or-span the extractor
chose to surface. Items of type `objectRef` carry a world-object
id under `content`; items of type `typeRef` carry a type id. The
v0.1.7 import path remaps these ids when the claim crosses a user
boundary so cross-user imports keep their gloss links live.

## Add a typed claim relation

A claim relation is a typed edge between two claims. The relation
type is one of the persona's `relationTypes`. To assert that
claim A causes claim B:

```bash
curl -s -X POST \
  "http://localhost:3001/api/summaries/$SUMMARY_ID/claims/$CLAIM_A_ID/relations" \
  -H 'Content-Type: application/json' \
  --cookie cookies.txt \
  -d "{\"targetClaimId\":\"$CLAIM_B_ID\",\"relationTypeId\":\"causes\"}"
```

The route checks ownership of both endpoints (the source claim's
summary and the target claim's summary must belong to the
requester). See [Concepts > Data isolation](../concepts/data-isolation.md)
for the full ownership model.

## Next

Continue to [Export and import](05-export-import.md) to round-trip
this work through JSONL into a second user account.
