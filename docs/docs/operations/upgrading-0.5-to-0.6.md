---
sidebar_label: Upgrading 0.5 to 0.6
---

# Upgrading 0.5 to 0.6

The 0.6 release moves every annotation, world-model, claim, and
ontology record onto the native layers store. Your 0.5 data lives
in five tables the 0.6 application no longer reads: `annotations`,
`world_state`, `ontologies`, `claims`, and `claim_relations`. A
one-time copy moves that data into the layers tables so the 0.6
application can see it. The 0.6 backend runs the copy itself the
first time it starts, verifies it, and refuses to start if the copy
does not verify, so the upgrade is a backup plus a normal deploy.
This page is the exact route for an admin running a real
deployment, and what to do if anything goes wrong.

Read [Upgrades](upgrades.md) first for the general shape of a
minor upgrade.

## Do you need this page?

- **Upgrading a 0.5.x deployment that has data:** yes. The copy is
  automatic, but take the backup in step 1 and check the backend
  log in step 3.
- **Fresh 0.6 install:** no. There is no 0.5 data to copy, the
  startup step does nothing, and every later release installs
  without any extra step.

## How the upgrade is staged

The upgrade is an expand, migrate, contract sequence spread across
two releases, so your 0.5 data is never dropped before its copy is
proven:

1. **Expand (0.6.0).** The 0.6.0 schema adds the layers tables and
   **keeps** the five legacy tables. Both coexist.
2. **Migrate (automatic, on first start of 0.6.x).** When the 0.6
   backend starts, it applies migrations and then runs the
   `migrate-0.6` copy: every legacy row is written into the layers
   store through the same panproto lenses and bridges the running
   application uses, the copy is verified, and a `verified` marker is
   recorded in the database.
3. **Contract (a later release).** A later release removes the
   five legacy tables. Its migration drops them only when they are
   empty or the marker reads `verified`. If they still hold data
   and the copy was never verified, it refuses and changes
   nothing.

The copy is additive: it never modifies a legacy row. Until you
install the release that removes the legacy tables, rolling back
to 0.5.x needs nothing beyond switching back to the 0.5.x code.

:::warning Do not skip 0.6
Run 0.6.x at least once, so the copy completes, **before**
installing the release that removes the legacy tables. That release
no longer ships the `migrate-0.6` CLI, so it cannot run the copy for
you. If you install it too early, its migration refuses to run and
the backend will not start; see
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

## What the backend does on every start

The backend's start command is:

```text
prisma migrate deploy → migrate-0.6 auto → seed → start the server
```

The `auto` step decides what to do from the database itself:

| Database state                                   | What `auto` does                                  |
| ------------------------------------------------ | ------------------------------------------------- |
| The five legacy tables are empty (fresh install) | Nothing. Prints `no 0.5 data to copy`.            |
| A verified copy is already recorded              | Nothing. Prints `already verified`.               |
| Legacy rows present, no verified copy            | Copies, verifies, records `verified`, continues.  |
| The copy does not verify                         | Prints each mismatch and exits non-zero.          |

A failed verify stops the start command before the server comes
up, so the 0.6 application never serves a partial copy. The legacy
tables are untouched, so you can roll back to 0.5.x or fix the
cause and restart. Because `auto` is a no-op once a verified copy
is recorded, restarting or redeploying 0.6 never rewrites migrated
data.

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

### 2. Get the 0.6.0 code and build it

The shipped `docker-compose.yml` builds the images from your
checkout:

```bash
git fetch --tags
git checkout v0.6.0
docker compose build backend frontend
```

If you run pre-built images instead, set the image tag to `0.6.0`
and `docker compose pull`.

### 3. Start 0.6.0

```bash
docker compose up -d
docker compose logs -f backend
```

Compose stops the 0.5 containers and starts the 0.6 ones. In the
backend log you should see the migrations apply, then:

```text
0.5-to-0.6 copy: 0.5 data found and not yet migrated; copying now.
...
VERIFY OK: no mismatches.
Recorded migration state: verified. ...
```

followed by the seed and the server start. The copy usually takes
seconds to minutes; a deployment with very large annotation tables
can take longer, and the application is unavailable until it
finishes. If the log shows `VERIFY FAILED` instead, see
[Troubleshooting](#troubleshooting).

### 4. Check your data

```bash
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs status
```

`status` should report the phase `verified`. Then log in and
spot-check: open a video with annotations, open a summary with
claims, open a persona's ontology, and open the world model.

Keep the Postgres backup until you have installed the release that
removes the legacy tables.

## Optional: inspect or rehearse before starting 0.6

If you want to see what the copy will do, or take a targeted
backup of the legacy tables, do this between steps 2 and 3. The
0.6.0 schema is additive and the 0.5 application keeps working on
it, so applying it early is safe:

```bash
docker compose run --rm backend npx prisma migrate deploy
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs preflight
docker compose run --rm -v "$PWD/backups:/backups" backend \
  node prisma/migrate-0.6/cli.cjs export --out /backups/fovea-legacy-0.5.json
docker compose run --rm backend node prisma/migrate-0.6/cli.cjs dry-run
```

- `preflight` confirms the schema is applied and prints how many
  legacy rows the copy will move.
- `export` writes the five legacy tables to a JSON file on the host.
  The `-v` mount matters: without it the file is written inside a
  throwaway container and discarded.
- `dry-run` runs the whole copy in a transaction that is rolled
  back, printing what it would write.

Then continue with step 3; the backend runs the real copy on start.

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
failed, so clear that record, go back to 0.6.x, let the copy run,
and upgrade again:

1. With the new release still checked out, mark the migration
   rolled back. The error message and
   `docker compose run --rm backend npx prisma migrate status`
   name the migration:

   ```bash
   docker compose run --rm backend npx prisma migrate resolve --rolled-back <migration name>
   ```

2. Check out and build the latest 0.6.x release, then
   `docker compose up -d` and confirm the backend log reports
   `VERIFY OK`.
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
| `auto`      | The startup step: copies only when legacy rows exist and no verified copy is recorded. |
| `migrate`   | Runs the copy, verifies it, and records the marker; refuses after a verified copy unless `--force`. |
| `verify`    | Re-runs the verifier without copying.                                 |
| `status`    | Prints the recorded phase and current legacy row counts.              |
| `rollback`  | Clears the marker so a re-run starts fresh; deletes no rows.          |

Options: `--since <ISO-8601>` restricts the copy or verify to legacy
rows updated at or after an instant, `--batch-size <n>` sets how
many rows are read per page, and `--force` lets `migrate` run after
a verified copy.

:::danger Re-running the copy after going live
The copy rewrites every migrated object from its 0.5 source. Once
users have edited annotations, world objects, ontologies, or claims
in 0.6, `migrate --force` reverts those edits. Use it only before
anyone has worked in 0.6, for instance to pick up rows written to
0.5 after the first copy.
:::

## Rolling back to 0.5.x

Before you install the release that removes the legacy tables, a
rollback needs no restore, because the copy never modified the
legacy tables:

```bash
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
(see [Backup and restore](backup-restore.md)); the JSON export, if
you took one, holds the five legacy tables as a second copy.

## Troubleshooting

- **The backend log shows `VERIFY FAILED` and the backend keeps
  restarting.** The copy wrote rows that do not reproduce their 0.5
  source, so the server did not start. Nothing in the legacy tables
  changed. Read the printed mismatches, then either roll back to
  0.5.x (no restore needed) and report them, or fix the cause and
  restart: the copy re-runs on the next start until it verifies,
  refreshing the rows it already wrote without creating duplicates.
- **The backend log shows `the 0.6 schema is not applied`.** The
  `prisma migrate deploy` step failed before the copy; read the
  lines above it in the log.
- **The start was interrupted mid-copy.** Start it again. The copy
  has not been verified, so it runs again and refreshes the rows it
  already wrote.
- **Users kept writing to 0.5 after the copy** (for instance you
  rolled back, worked in 0.5, and upgraded again). The copy is
  already verified, so the start step skips it. Before anyone works
  in 0.6 again, run
  `docker compose run --rm backend node prisma/migrate-0.6/cli.cjs migrate --force --since <ISO-8601>`
  with `--since` set to just before you rolled back.
- **The backend will not start after installing the contract
  release, and its log says `Refusing to drop the legacy 0.5
  tables`.** The copy never reached a passing verify on this
  database. Follow [If you skipped the copy](#if-you-skipped-the-copy).
- **The export file is missing.** The `export` command ran without
  the `-v "$PWD/backups:/backups"` mount. Re-run it with the mount.
