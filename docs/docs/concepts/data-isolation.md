# Data isolation

Data isolation is enforced through a CASL-based role-based
access control framework. Every list and every mutation is
scoped to the requester; the gates run through CASL ability
checks compiled from the seeded `RolePermission` matrix.

See [Concepts > RBAC](rbac.md) for the model.

## How routes enforce ownership

Routes call `request.ability.can('read', subject('Persona', persona))`
(or the matching action) and the per-row condition is enforced
by CASL's MongoQuery condition compiled from the `RolePermission`
row's `ownOnly` flag. List endpoints use `accessibleBy` to push
the same condition into Prisma's `where`.

## Single-user mode

The seeded default user has `systemRole = 'system_admin'`, which
compiles to `can('manage', 'all')` and short-circuits every CASL
check. Multi-user provisioning is a configuration change plus
user creation, not a code change.
