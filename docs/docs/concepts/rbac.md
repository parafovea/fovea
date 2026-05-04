# RBAC

v0.2.0 replaced v0.1.x's `lib/ownership.ts` helpers with a
[CASL](https://casl.js.org/) ability framework backed by a database
permission table. Every authenticated request carries a per-user
`Ability` instance built from the user's roles plus the
`RolePermission` matrix. Routes ask the ability what the user can do
and CASL compiles the answer into either a boolean (for class-level
checks) or a Prisma `WHERE` clause (for query-time scoping).

## The pieces

```text
RolePermission (database table)        the policy matrix
   |
   v
defineAbilitiesFor(userId, roles, ...)  build ability rules
   |
   v
PrismaAbility                            ability.can(action, subject)
   |                                     accessibleBy(ability, action)
   v
@casl/prisma                             MongoQuery -> Prisma where
```

`server/src/lib/abilities.ts` builds the `AppAbility`. The middleware
in `server/src/middleware/abilities.ts` attaches it to the request as
`request.ability`. Routes call `request.ability.can(...)` for
instance-level checks and `accessibleBy(request.ability, action)` for
list filters.

## Actions and subjects

The `Actions` union enumerates every verb the system understands:

```text
create | read | update | delete | share | export | assign
manage_members | fork | review | manage
```

`manage` is CASL's "all actions" wildcard. The `Subjects` are exactly
the Prisma `ModelName` values used by the application:

```text
Annotation | Claim | Persona | WorldState | Video
VideoSummary | Project | UserGroup | User
```

Routes that hand a Prisma row to `subject('Annotation', row)` from
`@casl/ability` get instance-level evaluation that uses the row's
ownership column.

## Ownership columns

Different tables carry ownership in different fields. CASL's
MongoQuery conditions match against the actual Prisma columns, so the
ability builder picks the right column per model:

```text
Persona.userId
WorldState.userId
Annotation.createdByUserId    (legacy userId still populated; backfill copies it)
VideoSummary.createdBy
Claim.createdBy
UserGroup.createdBy
Project.ownerUserId
```

The 20260415000000_backfill_rbac_ownership migration populated these
columns for v0.1.x rows. The 20260310000000_add_annotation_userid
migration introduced `Annotation.userId` for the v0.1.8 work; v0.2.0
adds `createdByUserId` and prefers it. All write paths populate
`createdByUserId` / `createdBy` from the authenticated session, never
from the request body.

## ownOnly

`RolePermission.ownOnly` is a boolean flag on each row. When true,
the rule applies only to resources the user owns:

```ts
if (perm.ownOnly) {
  rules.push({ action, subject, conditions: { [ownField]: userId } })
} else {
  rules.push({ action, subject })
}
```

Production seeds in `server/prisma/seed-permissions.ts` set
`ownOnly: true` for write actions on content types (annotation,
summary, claim, persona, world_state) under the `annotator` project
role. Reads are never `ownOnly` at the project scope: members of a
project can read every annotation in it. The
`reseedOwnershipBaseline` test helper at
`server/test/integration/_rbac-baseline.ts` mirrors this in suites
that test ownership: it wipes the test-helper's blanket-grant rows
and seeds `ownOnly: true` rows for every content action under the
`user` system role, so CASL's per-row condition is what gates the
test rather than an unconditional grant.

## Query-time scoping

For listing endpoints, the route uses `accessibleBy` from
`@casl/prisma` to compile the ability rules into a Prisma `WHERE`
clause:

```ts
const where = accessibleBy(request.ability, 'read').Annotation
const rows = await prisma.annotation.findMany({ where })
```

This replaces the v0.1.x explicit `userId: request.user.id` filters.
The clause includes the union of every applicable rule's condition,
so a user who is both a project member (read all annotations in the
project) and a global owner (read all own annotations across all
projects) gets both sets in one query.

## Instance-time checks

For mutations on a known row, the route fetches the row, hands it to
`subject(...)`, and asks the ability:

```ts
import { subject } from '@casl/ability'

const annotation = await prisma.annotation.findUnique({ where: { id } })
if (!annotation || !request.ability.can('update', subject('Annotation', annotation))) {
  throw new NotFoundError('Annotation', id)
}
```

The `NotFoundError`-on-deny pattern carries over from v0.1.x: the
goal is to avoid confirming the existence of records the requester
cannot see.

## Foreign-id precheck on create

Some create endpoints accept a foreign-resource id in the request
body (for example, `personaId` on `POST /api/annotations`). The
generic `create Annotation` rule does not look at the supplied
`personaId`, so the route adds an explicit precheck:

```ts
if (body.personaId) {
  const persona = await prisma.persona.findUnique({ where: { id: body.personaId } })
  if (!persona || !request.ability.can('read', subject('Persona', persona))) {
    throw new NotFoundError('Persona', body.personaId)
  }
}
```

v0.2.1 added these prechecks on `POST /api/annotations` (personaId),
`POST /api/videos/:videoId/detect` (personaId),
`POST /api/summaries/:summaryId/claims` (parent summary), and a
defense-in-depth read-on-parent check on
`GET /api/summaries/:summaryId/claims`.

## Caching and invalidation

`buildAbilities` keeps two caches:

- A global `RolePermission` cache with a five-minute TTL fallback.
- A per-user ability cache keyed by `userId`. No TTL; explicit
  invalidation only.

Every membership change, role change, system-role change, and
RolePermission edit must call the matching invalidation helper so
the change takes effect on the next request:

```ts
invalidatePermissionCache()        // RolePermission edits (clears all)
invalidateUserAbilities(userId)    // single-user changes
invalidateGroupMembers(groupId)    // group-scope role/perm changes
invalidateProjectMembers(projectId)// project-scope role/perm changes
```

Missing one of these is a silent vulnerability: a removed user keeps
their access until the cache TTL expires. Every mutation route in
`routes/groups.ts`, `routes/projects.ts`, and
`routes/admin-permissions.ts` calls the corresponding helper.

## See also

- [Guides > Roles and permissions](../guide/roles-permissions.md)
- [Reference > RBAC permissions](../reference/rbac-permissions.md)
- [Reference > API](../reference/api.md)
