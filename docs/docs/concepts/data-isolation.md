# Data isolation

This page documented the v0.1.8 ownership scheme based on
`server/src/lib/ownership.ts` helpers. v0.2.0 replaced that scheme
with a CASL-based role-based access control framework. The same
user-visible behaviour holds — every list and every mutation is
scoped to the requester — but the gates run through CASL ability
checks rather than ad-hoc helper assertions.

See [Concepts > RBAC](rbac.md) for the v0.2.x model.

## v0.1.x

`lib/ownership.ts` is gone on the v0.2.x line. Routes that previously
called `assertPersonaOwned`, `assertSummaryOwned`, etc. now call
`request.ability.can('read', subject('Persona', persona))` (or the
matching action) and the per-row condition is enforced by CASL's
MongoQuery condition compiled from the `RolePermission` row's
`ownOnly` flag. The forward-port deltas are listed in the v0.2.1
section of [Project > Changelog](../project/changelog.md).

## Single-user mode

Behaviour is unchanged. The seeded default user has `systemRole =
'system_admin'`, which compiles to `can('manage', 'all')` and
short-circuits every CASL check. Multi-user provisioning is a
configuration change plus user creation, not a code change.
