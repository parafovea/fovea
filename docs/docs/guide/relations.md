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

The route loads both the source and target claims, returning
404 `NotFoundError` if either is missing or if the source claim's
`summaryId` does not match the path's `summaryId`. It then
enforces `update` permission on each claim via CASL
(`request.ability.can('update', subject('Claim', sourceClaim))`
and the same for the target claim), throwing 403 `ForbiddenError`
when the caller lacks the ability. A relation pointing at a
foreign user's existing claim returns 403; 404 is only returned
when one of the claims does not exist at all.

## Spans

`sourceSpans` and `targetSpans` are JSON arrays of character offsets
into the parent summary text. They are optional; the extractor
populates them when it can locate the relevant phrases.

## Delete

`DELETE /api/summaries/:summaryId/claims/relations/:relationId`
first verifies the relation's source claim belongs to the given
summary, then requires CASL `update` ability on the `Claim`
subject for both the source and target claims. In practice, only
a user who can update both endpoint claims, typically the owner
of the source-claim summary, can delete the relation.
