# Claims model

A claim is a hierarchical assertion extracted from a summary, with
gloss items that point at world objects, types, annotations, and
other claims by id. Claims are how Fovea turns prose into a
structured graph the user can query and edit.

## The hierarchy

A claim row has an optional `parentClaimId`. A top-level claim
("the goalkeeper saves the shot") may have sub-claims describing
its components ("the shot was at the top corner", "the
goalkeeper's reach was full extension"). Sub-claims share the
parent's `summaryId`.

The frontend renders the hierarchy as a tree. The backend stores
the parent pointer; reconstructing the tree requires sorting by
parentClaimId and ordering within siblings by createdAt or by an
explicit ordering column where present.

## Gloss items

The `gloss` array carries one entry per token-or-span the
extractor chose to surface. Each entry has a `type` and a
`content` payload:

```text
{type:"text",         content:"the goalkeeper"}    # literal text
{type:"objectRef",    content:"<entity-uuid>"}     # world object pointer
{type:"typeRef",      content:"<typeId>"}          # ontology type pointer
{type:"annotationRef",content:"<annotation-uuid>"} # bounding-box back-ref
{type:"claimRef",     content:"<claim-uuid>"}      # claim back-ref
```

The pointers are how a prose claim stays connected to the
underlying data. When the frontend renders "the goalkeeper", it
reads the `objectRef.content`, looks up the worldEntity, and
renders the entity's `name` plus a hover card with the entity's
type, attributes, and any back-references.

## Modality flags

Three columns record what modality supports the claim:

```text
audio     null | ["speech"] | ["non-speech"] | ["speech","non-speech"]
video     null | ["text"]   | ["non-text"]   | ["text","non-text"]
metadata  null | ["text"]   | ["non-text"]   | ["text","non-text"]
```

These let the user filter "show only claims supported by visible
text in the video" or "show only claims supported by speech
audio". They are JSON columns and round-trip through export and
import for any JSON value.

## Synthesis vs extraction

`POST /api/summaries/:summaryId/claims/generate` runs the
extraction model against the summary text. It is the one-shot
"pull claims out of this prose" path.

`POST /api/summaries/:summaryId/synthesize` runs the synthesis
model. It re-derives claims against a revised summary, used when
the persona's ontology has changed and the existing claims need
to be re-aligned.

## Ownership

`Claim.createdBy` is the ownership column. The backfill
migration `20260415000000_backfill_rbac_ownership` populated it
from the owning persona's user for historical rows. Every write
path now sets `createdBy = request.user.id` from the session, never
from the request body. CASL's ability builder uses `createdBy`
when compiling per-row conditions, so own-only readers see only
their own claims and project members see every claim under
projects they belong to. See [Concepts > RBAC](rbac.md).

## Cross-user remapping

When the export crosses a user boundary, the import path
regenerates ids and remaps `gloss[].content` for `objectRef`,
`annotationRef`, `claimRef`, and instance-level `typeRef` items.
This keeps the gloss live across the user boundary. See
[Guide > Cross-user imports](../guide/cross-user-imports.md).
