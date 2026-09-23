---
sidebar_label: Upgrading 0.5 to 0.6
---

# Upgrading 0.5 to 0.6

The 0.6 release moves every annotation, world-model, claim, and
ontology record onto the native layers store. Your 0.5 data lives
in five tables the 0.6 application no longer reads: `annotations`,
`world_state`, `ontologies`, `claims`, and `claim_relations`. A
one-time copy, run by you with the `migrate-0.6` CLI, moves that
data into the layers tables so the 0.6 application can see it.
This page is the exact route for an admin running a real
deployment.

Read [Upgrades](upgrades.md) first for the general shape of a
minor upgrade. This page adds the data copy and says exactly when
to run it.

## Do you need this page?

- **Upgrading a 0.5.x deployment that has data:** yes. Follow
  every step below. Until you run the copy, the 0.6 application
  shows none of your existing annotations, world objects, claims,
  or ontologies. Nothing is lost, but nothing is visible either.
- **Fresh 0.6 install:** no. There is no 0.5 data to copy, and
  every later release installs without any extra step.

## How the upgrade is staged

The upgrade is an expand, migrate, contract sequence spread across
two releases, so your 0.5 data is never dropped before its copy is
proven:

1. **Expand (0.6.0).** The 0.6.0 schema adds the layers tables and
   **keeps** the five legacy tables. Both coexist.
2. **Migrate (you, once, on 0.6.x).** The `migrate-0.6` CLI copies
   each legacy row into the layers store through the same panproto
   lenses and bridges the running application uses, verifies the
   copy, and records a `verified` marker in the database.
3. **Contract (a later release).** A later release removes the
   five legacy tables. Its migration drops them only when they are
   empty or the marker reads `verified`. If they still hold data
   and the copy was never verified, it refuses and changes
   nothing.

The copy is additive: it never modifies a legacy row. Until you
install the release that removes the legacy tables, rolling back
to 0.5.x needs nothing beyond switching back to the 0.5.x code.

:::warning Do not skip 0.6
Upgrade to 0.6.x and complete the copy **before** installing the
release that removes the legacy tables. That release no longer
ships the `migrate-0.6` CLI, so it cannot run the copy for you. If
you install it too early, its migration refuses to run and the
backend will not start; see
[If you skipped the copy](#if-you-skipped-the-copy).
:::

## What the copy moves

| Legacy source     | Native destination                                  |
| ----------------- | --------------------------------------------------- |
| `annotations`     | annotation layers and layers annotations            |
| `world_state`     | graph nodes, collections, and relation edges        |
| `ontologies`      | layers ontologies and their type definitions        |
| `claims`          | claim nodes, claim spans, and denoting annotations  |
| `claim_relations` | claim relation edges                                |

Videos, video summaries, transcripts, and personas already carry
into 0.6 unchanged and are not part of the copy; the copy only
references them to anchor the rows it writes.

The transform is not reimplemented for the migration. Every
domain is copied through the application's own writer
(`writeVideoAnnotation`, `mergeWorldObjects`,
`writeOntologyAggregate`, `writeClaim`, `writeClaimRelation`),
which runs the panproto lens internally. The copy only maps a
legacy row onto the view-model that writer already consumes.

## Before you start

- **Plan a maintenance window.** The application is down from
  step 2 until step 9. The copy itself usually takes minutes; a
  deployment with very large annotation tables can take longer,
  and preflight (step 5) tells you how many rows it will move.
- **Have shell access to the host** running `docker compose`.
  Every command below runs from the directory holding your
  `docker-compose.yml`.
- **Have disk room for two backups:** a full Postgres dump and a
  JSON export of the five legacy tables.

## The route

### 1. Back up Postgres

Take a full backup and confirm the file is not empty. See
[Backup and restore](backup-restore.md) for the full procedure.

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U fovea -Fc fovea > backups/fovea-pre-0.6.dump
ls -lh backups/fovea-pre-0.6.dump
```

This is the only step that is hard to undo if you skip it.

### 2. Stop the 0.5 application

Stop the backend and frontend so nothing writes to the legacy
tables while they are being copied. Leave Postgres and Redis
running.

```bash
docker compose stop backend frontend
```

Keep them stopped until step 9. Anything a user writes to the 0.5
application after the copy is not carried over.

### 3. Get the 0.6.0 code and build it

The shipped `docker-compose.yml` builds the images from your
checkout:

```bash
git fetch --tags
git checkout v0.6.0
docker compose build backend frontend
```

If you run pre-built images instead, set the image tag to `0.6.0`
and `docker compose pull`.

Do not run `docker compose up` yet. The backend applies migrations
and starts serving as soon as it comes up, and it would show an
empty store until the copy has run.

### 4. Apply the 0.6.0 schema

```bash
docker compose run --rm backend npx prisma migrate deploy
```

This creates the layers tables and keeps the legacy ones.

### 5. Preflight

Confirm the 0.6 schema is applied and the legacy tables are
readable, and see how many rows the copy will move:

```bash
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs preflight
```

Preflight prints the per-table legacy counts and any prior
migration state. If it reports the schema is not applied, re-run
step 4.

### 6. Export the legacy tables

Independently of the Postgres dump, write the five legacy tables to
a JSON file on the host. This is a targeted, restorable copy of
exactly what the later contract release removes:

```bash
docker compose run --rm -v "$PWD/backups:/backups" backend \
  node prisma/migrate-0.6/cli.cjs export --out /backups/fovea-legacy-0.5.json
```

The `-v` mount matters: without it the file is written inside a
throwaway container and discarded. Keep this file until you have
installed the release that removes the legacy tables and confirmed
the application shows all of your data.

### 7. Dry run

Run the whole copy inside a transaction that is rolled back, so
you see exactly what it would write without persisting anything:

```bash
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs dry-run
```

The dry run prints the created and updated tallies per domain.

### 8. Migrate

Run the copy for real. It copies every domain, then verifies the
result and records the marker:

```bash
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs migrate
```

The command prints a per-domain tally, then a verify report.

- **`VERIFY OK`** and exit code 0: the marker now reads
  `verified`. Continue to step 9.
- **Mismatches** and a non-zero exit: the marker stays at
  `backfilled` and each mismatch is printed. See
  [Troubleshooting](#troubleshooting). Do not start the
  application until this passes.

The copy is idempotent and resumable. If it is interrupted, or you
fix the cause of a mismatch, run the same command again; it
refreshes the rows it already wrote and creates nothing new.

### 9. Start 0.6.0 and check your data

```bash
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs status
docker compose up -d
```

`status` should report the phase `verified`. Then log in and
spot-check: open a video with annotations, open a summary with
claims, open a persona's ontology, and open the world model.

You are done with the migration. Keep both backups until you have
installed the release that removes the legacy tables.

## Installing the release that removes the legacy tables

When that release comes out, upgrade to it like any other minor
release (back up, get the code, build, `docker compose up -d`).
Its migration runs when the backend starts:

- If the legacy tables are empty, or your marker reads `verified`,
  it drops the five legacy tables and the backend starts normally.
- If the legacy tables still hold rows and the marker does not
  read `verified`, the migration refuses, nothing is dropped, and
  the backend fails to start. `docker compose logs backend` shows
  `Refusing to drop the legacy 0.5 tables`.

### If you skipped the copy

The refused migration leaves your data intact but is recorded as
failed, so clear that record, go back to 0.6.x, run the copy, and
upgrade again:

1. With the new release still checked out, mark the migration
   rolled back. The error message and
   `docker compose run --rm backend npx prisma migrate status`
   name the migration:

   ```bash
   docker compose run --rm backend npx prisma migrate resolve --rolled-back <migration name>
   ```

2. Check out and build the latest 0.6.x release, then follow
   steps 5 to 8 above.
3. Upgrade to the new release again.

## What the verifier checks

The verifier is the gate before the irreversible drop, so it
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
and client as the application. The backend image ships the CLI as
a bundled `prisma/migrate-0.6/cli.cjs`, so the invocation is
`docker compose run --rm backend node prisma/migrate-0.6/cli.cjs <subcommand>`.
In a source checkout, the same subcommands run as
`npm run migrate:0.6:<subcommand>` from `server/`.

| Subcommand  | What it does                                                          |
| ----------- | --------------------------------------------------------------------- |
| `preflight` | Confirms the 0.6 schema is applied and prints legacy row counts.      |
| `export`    | Writes a JSON backup of the five legacy tables (`--out <path>`).      |
| `dry-run`   | Runs the whole copy in a rolled-back transaction; persists nothing.   |
| `migrate`   | Runs the copy, verifies it, and records the marker.                   |
| `verify`    | Re-runs the verifier without copying.                                 |
| `status`    | Prints the recorded phase and current legacy row counts.              |
| `rollback`  | Clears the marker so a re-run starts fresh; deletes no rows.          |

Two options are shared where they apply: `--since <ISO-8601>`
restricts the copy or verify to legacy rows updated at or after an
instant (useful for a catch-up pass), and `--batch-size <n>` sets
how many rows are read per page.

## Rolling back to 0.5.x

Before you install the release that removes the legacy tables, a
rollback needs no restore, because the copy never modified the
legacy tables:

```bash
docker compose stop backend frontend
git checkout v0.5.11
docker compose build backend frontend
docker compose up -d
```

The 0.5 application reads its original tables, and it ignores the
layers rows the copy wrote. Its startup `prisma migrate deploy`
finds no pending migrations and leaves the 0.6 tables in place.

Anything users created or edited **while running 0.6** lives only
in the layers tables, so it is not visible after a rollback. If
you are going to roll back, do it before users start working in
0.6.

After you install the release that removes the legacy tables, a
rollback to 0.5.x means restoring the Postgres dump from step 1
(see [Backup and restore](backup-restore.md)); the JSON export from
step 6 holds the five legacy tables as a second copy.

## Troubleshooting

- **Preflight says the schema is not applied.** Run step 4 with
  the 0.6.0 image before the copy.
- **Migrate exits non-zero with mismatches.** Read the printed
  mismatches. The marker stays at `backfilled`, so the contract
  release will still refuse to drop anything. Fix the cause and
  re-run `migrate`; it is idempotent. If you cannot resolve a
  mismatch, leave the 0.5 application running (roll back) and
  report the printed mismatches.
- **Interrupted copy.** Run `migrate` again. A re-run refreshes the
  rows it already wrote and creates nothing new.
- **Users kept writing to 0.5 after the copy.** Stop the 0.5
  application and run `migrate` again with `--since` set to just
  before your first copy began; it picks up the rows updated since
  then.
- **The backend will not start after installing the contract
  release, and its log says `Refusing to drop the legacy 0.5
  tables`.** The copy never reached a passing verify on this
  database. Follow [If you skipped the copy](#if-you-skipped-the-copy).
- **The export file is missing after step 6.** The command ran
  without the `-v "$PWD/backups:/backups"` mount. Re-run it with
  the mount.
