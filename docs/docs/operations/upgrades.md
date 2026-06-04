---
sidebar_label: Upgrades
---

# Upgrades

Fovea ships container images per tag and per-PR images on
`develop`. A production install pins to a release tag and steps
forward one minor release at a time. Patch upgrades are
expected to be drop-in.

## Patch upgrade (x.y.Z → x.y.Z+1)

1. Read the CHANGELOG entry for the target patch. Patch
   releases never include schema migrations or breaking
   environment variable changes; if they do, treat them as a
   minor upgrade instead.
2. Update the tag in `docker-compose.yml` (or your env file,
   depending on how you parameterize the image tag).
3. `docker compose pull`
4. `docker compose up -d`

Rollback is the reverse: revert the tag and `up -d` again. The
database is untouched, so the older image will boot against it
without further action.

## Minor upgrade (x.Y.z → x.Y+1.0)

Minor upgrades may include Prisma migrations, new required
environment variables, and changed model defaults. The CHANGELOG
entry for the target minor calls these out under
"BREAKING CHANGES" and "Required action".

1. Take a Postgres backup (see [Backup and restore](backup-restore.md)).
   This is the only step that is hard to undo if you skip it.
2. Read the CHANGELOG entry for every minor between your
   current version and the target. Skipping a minor is
   supported but you accumulate the migration and env-var
   changes for all of them.
3. Update `.env` with any new required variables. The deploy
   refuses to start if a required variable is missing.
4. Update the image tag in `docker-compose.yml`.
5. `docker compose pull`
6. Apply migrations with the new image:
   `docker compose run --rm backend npx prisma migrate deploy`
7. `docker compose up -d`
8. Re-seed the permission catalog:
   `docker compose run --rm backend npm run seed:permissions`.
   This is idempotent and required because new permissions
   land in the catalog on most minor releases.
9. Spot-check the UI: log in, load a video, run summarization,
   open the admin SystemConfig panel.

Rollback after a minor upgrade is non-trivial because Prisma
migrations are forward-only. To revert, restore the Postgres
backup taken in step 1 and switch the image tag back. The
videos in `STORAGE_PATH` are unaffected by the database revert.

## Major upgrade (X.y.z → X+1.0.0)

Treat a major upgrade as a planned migration project, not a
push. There is no major upgrade path yet (Fovea is pre-1.0); the
shape of one will be documented in the CHANGELOG when the first
major lands.

## Model service upgrades

The model service ships in two flavors: `model-service` with
CUDA wheels and `model-service-cpu` with CPU-only wheels. Pick
the one matching your hardware in `docker-compose.yml`. Within
a tag, the two flavors are wire-compatible; you can switch
between them without changing the backend image.

Switching `models.yaml` to a model that has not been downloaded
yet causes a slow first request (the weights pull on demand).
Pre-warm by hitting `GET /models` on the model service after
the upgrade, which triggers the discovery path without
serving a real inference.

## CI / CD shape

The `deploy.yml` GitHub Actions workflow handles tagged
deploys to the host in the repo's reference deployment. It
takes a tag input, pulls images, runs Prisma migrate deploy,
and brings the stack back up. The same workflow accepts a
`demo_mode` flag that swaps to the demo compose overlay; see
[demo.fovea.video deployment](demo-fovea-deployment.md) for
that path.

Self-hosted operators typically copy the workflow as a starting
point and adapt the SSH targets and image registry to their
infrastructure. The two pieces that always need editing are
the `IMAGE_REGISTRY` and the host inventory under
`deploy.yml`.
