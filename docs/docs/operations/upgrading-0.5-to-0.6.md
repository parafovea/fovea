---
sidebar_label: Upgrading 0.5 to 0.6
---

# Upgrading 0.5 to 0.6

The 0.6 release moves every annotation, world-model, claim, and
ontology record onto the native layers store. Your 0.5 data lives
in five tables the 0.6 schema no longer reads: `annotations`,
`world_state`, `ontologies`, `claims`, and `claim_relations`. A
one-time copy moves that data into the layers tables so the 0.6
application can see it. This page is the exact route for an
operator running a real deployment.

This is a minor upgrade with one extra phase, so read
[Upgrades](upgrades.md) first for the general shape. The addition
here is the data copy in step 4.

## How the upgrade is staged

The upgrade follows an expand, migrate, contract sequence spread
across two releases, so the legacy data is never dropped before
its native copy is proven:

1. **Expand (0.6.0).** The 0.6.0 schema adds the layers tables and
   **retains** the five legacy tables. Both shapes coexist. The
   destructive drop that would normally accompany the schema
   change is deferred.
2. **Migrate (0.6.0, one time).** The `migrate-0.6` CLI copies each
   legacy row into the layers store through the same panproto
   lenses and bridges the running application uses, verifies the
   copy, and records a durable marker.
3. **Contract (0.6.1).** The 0.6.1 release drops the five legacy
   tables. Its migration refuses to run unless the marker records
   a passing verify, so an operator who skips step 2 is stopped
   with data intact rather than silently emptied.

The copy is additive: it never mutates a legacy row. Until you
upgrade to 0.6.1, both the legacy tables and their native copies
are present, so a rollback to 0.6.0 needs nothing beyond switching
the image tag back.

## What the copy moves

The copy reads each legacy source and writes the native rows a
0.6 install produces for the same data:

| Legacy source     | Native destination                                  |
| ----------------- | --------------------------------------------------- |
| `annotations`     | annotation layers and layers annotations            |
| `world_state`     | graph nodes, collections, and relation edges        |
| `ontologies`      | layers ontologies and their type definitions        |
| `claims`          | claim nodes, claim spans, and denoting annotations  |
| `claim_relations` | claim relation edges                                 |

Videos, video summaries, transcripts, and personas already carry
into 0.6 unchanged and are not part of the copy; the copy only
references them to anchor the rows it writes.

The transform is not reimplemented for the migration. Every
domain is copied through the application's own writer
(`writeVideoAnnotation`, `mergeWorldObjects`,
`writeOntologyAggregate`, `writeClaim`, `writeClaimRelation`),
which runs the panproto lens internally. The copy only maps a
legacy row onto the view-model that writer already consumes.

## Prerequisites

- A 0.5.x deployment you can take offline briefly.
- A recent Postgres backup, or the ability to take one now.
- Shell access to the `backend` service (the CLI runs inside it).

## The route

### 1. Back up

Take a Postgres backup. See
[Backup and restore](backup-restore.md). This is the only step
that is hard to undo if you skip it.

### 2. Bring up 0.6.0 and apply migrations

Update the image tag to `0.6.0`, pull, and apply the schema
migration with the new image. This creates the layers tables and
retains the legacy ones:

```bash
docker compose pull
docker compose run --rm backend npx prisma migrate deploy
```

Do not upgrade straight to 0.6.1 yet. The 0.6.1 drop needs the
copy to have run first.

### 3. Preflight

Confirm the 0.6 schema is applied and the legacy tables are
readable, and see how many rows the copy will move:

```bash
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs preflight
```

Preflight prints the per-table legacy counts and any prior
migration state. If it reports the schema is not applied, re-run
step 2.

### 4. Export a restorable backup of the tables 0.6.1 will drop

Independently of your Postgres backup, dump the five legacy tables
to a JSON file. This is a targeted, restorable copy of exactly
what the 0.6.1 contract phase removes:

```bash
mkdir -p backups
docker compose run --rm -v "$PWD/backups:/backups" backend \
  node prisma/migrate-0.6/cli.cjs export --out /backups/fovea-legacy-0.5.json
```

Keep this file until you have upgraded to 0.6.1 and confirmed the
application reads all of your data.

### 5. Dry run

Run the whole copy inside a transaction that is rolled back, so
you see exactly what it would write without persisting anything:

```bash
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs dry-run
```

The dry run prints the created and updated tallies per domain. It
persists nothing.

### 6. Migrate

Run the copy for real. It copies every domain, then verifies the
result and records the marker:

```bash
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs migrate
```

The command prints a per-domain tally, then a verify report. It
records the marker as `verified` only when the verifier passes
with zero mismatches. On any mismatch it leaves the marker at
`backfilled`, prints each mismatch, and exits non-zero. The copy
is idempotent and resumable, so if it is interrupted or a
mismatch needs a fix, run the same command again; it refreshes the
rows it already wrote and mints nothing new.

### 7. Confirm status and spot-check

```bash
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs status
```

Status prints the recorded phase and the legacy row counts still
present. Then bring the stack up and spot-check the UI: log in,
open a video with annotations, open a summary with claims, and
open a persona's ontology.

```bash
docker compose up -d
```

### 8. Later: upgrade to 0.6.1 (the contract phase)

When you are satisfied the 0.6.0 application reads all of your
data, upgrade to 0.6.1. Its migration drops the five legacy
tables. It refuses to run unless the marker recorded a passing
verify in step 6, so run the 0.6.1 upgrade the same way as any
minor: back up, update the tag, `prisma migrate deploy`. If the
drop refuses, it means step 6 did not reach `verified`; re-run the
migrate command until the verifier passes, then retry.

## What the verifier checks

The verifier is the gate before the irreversible 0.6.1 drop, so it
checks more than that rows exist:

- **Annotation geometry** round-trips. For every legacy
  annotation it rebuilds a bounding-box sequence from the native
  spatio-temporal anchor and compares it, within a float epsilon,
  to the canonical 0.6 projection of the original frames.
- **Content fidelity** for world objects, ontology types, and
  claims. Each is reconstructed through the application's own
  backward read path and compared field by field to the legacy
  source. Every field the layers view-model preserves must match,
  so a copy that routed the wrong legacy column into a view-model
  field is caught here.
- **Count parity** across all domains. Every legacy row yields the
  native rows it should.

## CLI reference

Every subcommand reads `DATABASE_URL` from the environment. Run
them inside the `backend` service so they use the same database
and client as the application. The production image ships the CLI
as a bundled `prisma/migrate-0.6/cli.cjs`, so the invocation is
`node prisma/migrate-0.6/cli.cjs <subcommand>`. In a source
checkout, the same subcommands run as `npm run migrate:0.6:<subcommand>`.

| Subcommand                  | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `preflight`                 | Confirms the 0.6 schema is applied and prints legacy row counts.    |
| `export`                    | Writes a JSON backup of the five tables 0.6.1 drops.                |
| `dry-run`                   | Runs the whole copy in a rolled-back transaction; persists nothing. |
| `migrate`                   | Runs the copy, verifies it, and records the marker.                 |
| `verify`                    | Re-runs the verifier without copying.                               |
| `status`                    | Prints the recorded phase and current legacy row counts.            |

Two options are shared where they apply: `--since <ISO-8601>`
restricts the copy or verify to legacy rows updated at or after an
instant (useful for a catch-up pass), and `--batch-size <n>` sets
how many rows are read per page.

The CLI also exposes a `rollback`
subcommand, which clears the marker so a re-run starts fresh. It
does not delete copied rows and does not touch the legacy tables.

## Rollback

Because the copy is additive and the legacy tables persist through
0.6.0, rolling back before you reach 0.6.1 is a tag switch:

1. Switch the image tag back to your 0.5.x release.
2. `docker compose up -d`.

The 0.5 application reads its original tables, which were never
mutated. The layers rows the copy wrote are ignored by the 0.5
code.

After you have upgraded to 0.6.1, the legacy tables are gone, so a
full revert means restoring the Postgres backup from step 1 or the
JSON export from step 4.

## Troubleshooting

- **Preflight says the schema is not applied.** Run
  `prisma migrate deploy` with the 0.6.0 image (step 2) before the
  copy.
- **Migrate exits non-zero with mismatches.** Read the printed
  mismatches. The marker stays at `backfilled`, so the 0.6.1 drop
  will still refuse. Fix the cause and re-run the `migrate` subcommand;
  it is idempotent.
- **The 0.6.1 drop refuses with "expected verified".** The copy
  never reached a passing verify on this database. Run
  the `migrate` subcommand until it reports `VERIFY OK`, then retry
  the 0.6.1 upgrade.
- **Interrupted copy.** Run the `migrate` subcommand again. A re-run
  refreshes the rows it already wrote and creates nothing new.
