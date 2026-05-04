# Claim relations

Use the relations endpoints to assert typed edges between two
claims. A relation row carries a `sourceClaimId`, a
`targetClaimId`, a `relationTypeId` from the persona's
`relationTypes`, and optional confidence, span, and note fields.

## Endpoints

```text
POST   /api/summaries/:summaryId/claims/:claimId/relations
GET    /api/summaries/:summaryId/claims/:claimId/relations
DELETE /api/summaries/:summaryId/claims/relations/:relationId
```

## Create a relation

```bash
curl -X POST \
  http://localhost:3001/api/summaries/$SUMMARY_ID/claims/$CLAIM_A_ID/relations \
  -H 'Content-Type: application/json' --cookie cookies.txt \
  -d '{"targetClaimId":"<claim-b>","relationTypeId":"causes",
       "confidence":0.8,"notes":"explicit cue word"}'
```

Since v0.1.8 the route runs `assertSummaryOwned` on both the
source claim's summary and the target claim's summary. A relation
to a foreign user's claim returns 404; previously A could create a
relation that surfaced B's claim text in A's relations view.

## Spans

`sourceSpans` and `targetSpans` are JSON arrays of character offsets
into the parent summary text. They are optional; the extractor
populates them when it can locate the relevant phrases.

## Delete

`DELETE /api/summaries/:summaryId/claims/relations/:relationId`
runs `assertClaimRelationOwned`. Only the user who owns the
source-claim summary can delete the relation.
