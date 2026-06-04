---
sidebar_label: Backup and restore
---

# Backup and restore

A Fovea install has three pieces of persistent state. Each has
a different cost-of-loss and a different backup cadence.

## What to back up

| Data                            | Lives in              | Cost of loss                                                |
| ------------------------------- | --------------------- | ----------------------------------------------------------- |
| Application database            | Postgres              | All annotation, persona, ontology, claim, and user state    |
| Uploaded videos                 | `STORAGE_PATH` volume | Videos themselves; annotations on those videos still resolve|
| Model weights                   | `HF_HOME` volume      | One re-download per model at next use                       |
| Redis (queue state)             | Redis volume          | Any currently-running job; user retries from the UI         |

Postgres is the only piece that justifies a full point-in-time
backup story. The `STORAGE_PATH` volume is large but content-
addressable; rsync to an object store on a slow cadence is
enough. The model cache and Redis are recoverable from the
network and from the user, respectively, and rarely need
backing up at all.

## Postgres backup

The simplest correct backup is a nightly `pg_dump` against the
running database, piped to compressed storage:

```bash
docker compose exec -T postgres pg_dump -U fovea fovea \
  | gzip > backups/fovea-$(date +%Y-%m-%d).sql.gz
```

For point-in-time recovery, configure Postgres with WAL
archiving and run a continuous-archiving tool like `pgbackrest`
or `wal-g` against an object store. The schema is small enough
that even hourly full dumps are cheap; per-row WAL is overkill
for most installs.

Retention: keep at least 14 daily and 8 weekly dumps. Annotation
data is the kind of thing operators sometimes notice was wrong a
week ago.

## Postgres restore

Restore is the inverse of the dump. With the stack down:

```bash
docker compose up -d postgres
docker compose exec -T postgres dropdb -U fovea --if-exists fovea
docker compose exec -T postgres createdb -U fovea fovea
gunzip -c backups/fovea-2026-06-01.sql.gz \
  | docker compose exec -T postgres psql -U fovea fovea
docker compose up -d
```

After a restore from a backup taken on an older release, run
`docker compose run --rm backend npx prisma migrate deploy` to
catch the database up to the migrations bundled in the running
image. Prisma's migrate-deploy is forward-only and idempotent.

## Video volume backup

The `STORAGE_PATH` volume is a flat directory of opaque blob
files. Snapshot-based filesystems (ZFS, Btrfs, EBS snapshots)
are the right tool; for filesystems without snapshots, `rsync`
to an object store works because uploaded videos are immutable
once written:

```bash
rsync -av --delete \
  /var/lib/fovea/videos/ \
  s3://my-bucket/fovea/videos/
```

The same approach also covers thumbnails and any cached
keyframe extractions the model service writes back to the
volume.

## Disaster recovery drill

The dump file plus the video volume plus the env file is
everything you need to rebuild the install. Run a restore drill
quarterly:

1. Stand up an empty stack on a separate host.
2. Restore the most recent Postgres dump.
3. Sync the video volume.
4. Copy the production `.env` over with `SESSION_SECRET` and
   `DATABASE_URL` adjusted for the new host.
5. Confirm a user can log in and load a previously-annotated
   video, that the annotations render, and that a re-run of
   summarization produces output.

The drill is the only way to catch backup gaps before you need
them. Operators have hit at least two: forgetting to back up
the `STORAGE_PATH` volume because Postgres "is the database",
and backing up the volume but not the env file (which means
no session secret to verify the existing sessions).
