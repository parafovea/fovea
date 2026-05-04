# Claims

Use the claims API to read and edit hierarchical assertions
extracted from a summary. A claim has text, a hierarchical gloss
array, optional modality flags, an optional parent claim, and a
set of typed relations to other claims.

## Endpoints

```text
GET    /api/summaries/:summaryId/claims
GET    /api/summaries/:summaryId/claims/:claimId
POST   /api/summaries/:summaryId/claims
PUT    /api/summaries/:summaryId/claims/:claimId
DELETE /api/summaries/:summaryId/claims/:claimId
POST   /api/summaries/:summaryId/claims/generate     # enqueue extraction
GET    /api/jobs/claims/:jobId                       # poll extraction
POST   /api/summaries/:summaryId/synthesize          # enqueue synthesis
GET    /api/jobs/synthesis/:jobId                    # poll synthesis
GET    /api/videos/:videoId/personas/:personaId/claims
```

The two listing endpoints
(`GET /api/summaries/:summaryId/claims` and
`GET /api/summaries/:summaryId/claims/:claimId`) since v0.1.8
enforce summary ownership through `assertSummaryOwned` so a user
who knows another user's summaryId cannot read their claim list.

## Claim fields

```text
text             Text    the claim sentence
gloss            Json    [{type:"objectRef",content:"<id>"}, ...]
parentClaimId    String? for sub-claims under a parent
textSpans        Json?   character offsets back into the summary
claimerType      String? null|entity|entity_type|author|mixed
claimerGloss     Json?   gloss for the claimer phrase
claimRelation    Json?   the in-claim relation (subject, predicate, object)
claimEventId     String? optional anchor to a worldEvent
claimTimeId      String? optional anchor to a worldTime
claimLocationId  String? optional anchor to a worldLocation
audio            Json?   modality: ["speech"]|["non-speech"]|both
video            Json?   modality: ["text"]|["non-text"]|both
metadata         Json?   modality: ["text"]|["non-text"]|both
confidence       Float?  extractor confidence
modelUsed        String? extractor model id
extractionStrategy String? sentence-based|semantic-units|hierarchical|manual
```

`audio`, `video`, and `metadata` are JSON columns and round-trip
through export and import for any JSON value. The pre-v0.1.8
`Array.isArray(...) ? ... : Prisma.JsonNull` guards in
`import-handler.importClaim` were dropping object-shaped metadata
on every import; v0.1.8 removed those guards.

## Gloss items

The gloss array is hierarchical. Each entry is one of:

```text
{type:"text",         content:"the player"}        # literal text
{type:"objectRef",    content:"<worldEntity-id>"}   # entity / event / time / location
{type:"typeRef",      content:"<typeId>"}           # ontology type
{type:"annotationRef",content:"<annotation-id>"}    # back-reference
{type:"claimRef",     content:"<claim-id>"}         # back-reference
```

The cross-user import path remaps the `content` of `objectRef`,
`annotationRef`, `claimRef`, and instance-level `typeRef` items
when ids are regenerated, so claims stay live across user
boundaries. See [Guide > Cross-user imports](cross-user-imports.md).

## Synthesis

`POST /api/summaries/:summaryId/synthesize` enqueues a job that
re-runs the synthesis pipeline against an existing summary. Use
this when the persona's ontology has changed and the existing
claims should be re-derived against the new types.
