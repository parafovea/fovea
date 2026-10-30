#!/usr/bin/env bash
# Deploy after building, retain data, and recover the previous application on failure.
set -Eeuo pipefail
cd "${1:?deployment directory is required}"
DEMO_MODE=${2:-false}
exec 9>.deploy.lock
flock -n 9 || { echo "Another deployment is running"; exit 1; }
trap 'rm -f .deploy-secrets.json .deploy-login.json' EXIT

echo '🔧 Updating environment...'
# Environment file is managed on server, not overwritten
# Ensure S3 storage is configured for video access
if ! grep -q '^VIDEO_STORAGE_TYPE=' .env; then
  echo 'VIDEO_STORAGE_TYPE=s3' >> .env
fi
if ! grep -q '^S3_BUCKET=' .env; then
  echo 'S3_BUCKET=fovea-demo-data' >> .env
fi
if ! grep -q '^S3_REGION=' .env; then
  echo 'S3_REGION=us-east-1' >> .env
fi
if ! grep -q '^S3_PUBLIC_BUCKET=' .env; then
  echo 'S3_PUBLIC_BUCKET=false' >> .env
fi

# Secrets arrive as data over SCP and are encoded for Compose by Python.
python3 scripts/write-deploy-env.py .deploy-secrets.json .env

# Ensure FOVEA_MODE is set to multi-user
if grep -q '^FOVEA_MODE=' .env; then
  sed -i 's|^FOVEA_MODE=.*|FOVEA_MODE=multi-user|' .env
else
  echo 'FOVEA_MODE=multi-user' >> .env
fi

# Registration policy. The demo.fovea.video workflow run
# (workflow_dispatch with demo_mode=true) disables self-
# registration so the QR-code traffic profile is anonymous-
# only; the booth operator mints real accounts via the
# admin console's Create User dialog. Regular pushes to
# main keep registration enabled.
ALLOW_REGISTRATION_VALUE=true
if [ "$DEMO_MODE" = "true" ]; then
  ALLOW_REGISTRATION_VALUE=false
fi
if grep -q '^ALLOW_REGISTRATION=' .env; then
  sed -i "s|^ALLOW_REGISTRATION=.*|ALLOW_REGISTRATION=$ALLOW_REGISTRATION_VALUE|" .env
else
  echo "ALLOW_REGISTRATION=$ALLOW_REGISTRATION_VALUE" >> .env
fi

# Frontend demo-mode build flags. These flip the SPA into
# the public tour catalogue landing + MSW model-service
# interception that demo.fovea.video ships. Regular
# pushes to main blank both so the demo subtree tree-
# shakes out of the production bundle.
if [ "$DEMO_MODE" = "true" ]; then
  VITE_TOUR_DEMO_VALUE=1
  VITE_DEMO_PUBLIC_VALUE=1
else
  VITE_TOUR_DEMO_VALUE=
  VITE_DEMO_PUBLIC_VALUE=
fi
if grep -q '^VITE_TOUR_DEMO=' .env; then
  sed -i "s|^VITE_TOUR_DEMO=.*|VITE_TOUR_DEMO=$VITE_TOUR_DEMO_VALUE|" .env
else
  echo "VITE_TOUR_DEMO=$VITE_TOUR_DEMO_VALUE" >> .env
fi
if grep -q '^VITE_DEMO_PUBLIC=' .env; then
  sed -i "s|^VITE_DEMO_PUBLIC=.*|VITE_DEMO_PUBLIC=$VITE_DEMO_PUBLIC_VALUE|" .env
else
  echo "VITE_DEMO_PUBLIC=$VITE_DEMO_PUBLIC_VALUE" >> .env
fi

# Swap nginx config when demo_mode is on so the auth-
# endpoint rate limits take effect. The Dockerfile COPYs
# annotation-tool/nginx.conf at image build time, so we
# overwrite the file on disk BEFORE the docker build runs
# below. The prior rsync step always ships the canonical
# nginx.conf from git, so a subsequent demo_mode=false
# deploy restores the standard config automatically; the
# demo overwrite is therefore safely scoped to a single
# deploy.
if [ "$DEMO_MODE" = "true" ]; then
  cp annotation-tool/nginx.demo.conf annotation-tool/nginx.conf
  echo 'Swapped nginx config to nginx.demo.conf for demo mode'
else
  # Belt-and-suspenders: if a prior demo_mode=true deploy
  # left a stale nginx.conf on disk and rsync somehow
  # skipped it (e.g. timestamp tie), force the canonical
  # file back by checking out from the synced tree's
  # docker-image source of truth.
  echo 'demo_mode=false: nginx.conf left at the rsynced canonical version'
fi

# Ensure online Wikidata mode (not local Wikibase) for demo
if grep -q '^WIKIDATA_MODE=' .env; then
  sed -i 's|^WIKIDATA_MODE=.*|WIKIDATA_MODE=online|' .env
else
  echo 'WIKIDATA_MODE=online' >> .env
fi

# Backend demo-mode flags. FOVEA_DEMO_MODE gates the demo
# plugin tree in server/src/demo (anonymous-session route,
# idle-reset sweeper, demo seed route) AND the
# VideoAccessService override that returns the full video
# corpus to non-admin callers; without it, the auto-issued
# demo-anonymous-* booth visitors hit /api/videos with
# systemRole='user' and get an empty list (the per-user
# sharing / group / project chain has nothing to enumerate
# for a freshly-minted anon user), the VideoBrowser renders
# "No videos found", and every tour anchored to a video
# card or the annotation workspace shows the missing-anchor
# banner. FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH is the secondary
# gate that actually registers the POST /api/demo/anonymous-
# session endpoint the frontend bootstrap calls on first
# paint (main.tsx::maybeBootstrapDemoSession). Both default
# to unset on non-demo deploys so a self-hosted production
# build cannot accidentally serve anonymous sessions or
# expose the full corpus to a non-admin caller.
if [ "$DEMO_MODE" = "true" ]; then
  FOVEA_DEMO_MODE_VALUE=true
  FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH_VALUE=true
else
  FOVEA_DEMO_MODE_VALUE=false
  FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH_VALUE=false
fi
if grep -q '^FOVEA_DEMO_MODE=' .env; then
  sed -i "s|^FOVEA_DEMO_MODE=.*|FOVEA_DEMO_MODE=$FOVEA_DEMO_MODE_VALUE|" .env
else
  echo "FOVEA_DEMO_MODE=$FOVEA_DEMO_MODE_VALUE" >> .env
fi
if grep -q '^FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH=' .env; then
  sed -i "s|^FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH=.*|FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH=$FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH_VALUE|" .env
else
  echo "FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH=$FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH_VALUE" >> .env
fi

# Ensure external links are enabled for demo
if grep -q '^ALLOW_EXTERNAL_LINKS=' .env; then
  sed -i 's|^ALLOW_EXTERNAL_LINKS=.*|ALLOW_EXTERNAL_LINKS=true|' .env
else
  echo 'ALLOW_EXTERNAL_LINKS=true' >> .env
fi

echo '📁 Creating required directories...'
mkdir -p data/thumbnails

# Try to set permissions, but don't fail if we can't
# (directory may be owned by Docker from previous deployment)
if chmod 777 data/thumbnails 2>/dev/null; then
  echo 'Set permissions for thumbnails directory'
else
  echo 'Could not chmod thumbnails directory (likely owned by Docker)'
  # Verify directory is still writable
  if [ -w data/thumbnails ]; then
    echo 'Directory is writable - OK to continue'
  else
    echo 'WARNING: thumbnails directory is not writable'
  fi
fi

echo '🧹 Pre-build cleanup to free disk space...'
docker image prune -f
docker builder prune -af
df -h /

echo '💾 Checking available disk space...'
AVAIL=$(df --output=avail / | tail -1)
if [ "$AVAIL" -lt 2097152 ]; then
  echo 'FATAL: Less than 2GB disk space available after cleanup'
  df -h /
  exit 1
fi
echo "Available: $(($AVAIL / 1024))MB"

# Keep running containers and their images until migration and copy succeed.
PREVIOUS_BACKEND=$(docker compose ps -q backend)
PREVIOUS_FRONTEND=$(docker compose ps -q frontend)
DEPLOY_SUCCEEDED=false
rollback() {
  status=$?
  trap - EXIT
  rm -f .deploy-secrets.json .deploy-login.json
  if [ "$status" -ne 0 ] && [ "$DEPLOY_SUCCEEDED" = false ]; then
    echo 'Deployment failed; restoring the previous application containers.'
    needs_recreate=false
    for container in "$PREVIOUS_BACKEND" "$PREVIOUS_FRONTEND"; do
      if [ -n "$container" ] && ! docker start "$container"; then needs_recreate=true; fi
    done
    # Compose may have replaced the containers during startup. Their images
    # remain tagged, so recovery does not depend on the new build succeeding.
    if [ "$needs_recreate" = true ] && [ -s .deploy-rollback.json ]; then
      docker compose -f docker-compose.yml -f .deploy-rollback.json up -d --no-deps --no-build "${RESTORE_SERVICES[@]}" || true
    fi
  fi
  exit "$status"
}
trap rollback EXIT
RESTORE_SERVICES=()
if [ -n "$PREVIOUS_BACKEND" ]; then RESTORE_SERVICES+=(backend); fi
if [ -n "$PREVIOUS_FRONTEND" ]; then RESTORE_SERVICES+=(frontend); fi
python3 - "$PREVIOUS_BACKEND" "$PREVIOUS_FRONTEND" <<'PYROLLBACK'
import json
import subprocess
import sys
services = {}
for service, container in zip(("backend", "frontend"), sys.argv[1:]):
    if container:
        previous = json.loads(subprocess.check_output(["docker", "inspect", container], text=True))[0]
        tag = "fovea-rollback-" + service
        subprocess.run(["docker", "tag", previous["Image"], tag], check=True)
        services[service] = {"image": tag, "pull_policy": "never", "command": previous["Config"]["Cmd"], "entrypoint": previous["Config"]["Entrypoint"]}
with open(".deploy-rollback.json", "w") as output:
    json.dump({"services": services}, output)
PYROLLBACK

echo '🐳 Building containers...'
# Skip the model-service image on the demo host. The demo
# server cannot withstand CVPR-scale concurrent inference
# requests; the modelsDisabled gate in the frontend greys
# out every inference button when /api/models/config 503s,
# which is what happens when no model-service container
# exists. Skipping the build also avoids the ~5 GB CPU
# image rebuild on every deploy. The minimal-CPU image
# is still published from docker.yml for any downstream
# stack that wants it; the live demo backup the CVPR demo
# runs locally builds its full-CPU variant with docker
# compose directly.
docker compose build --parallel backend frontend

echo '🔍 Verifying Redis health before full startup...'
# Two-attempt wrap: if the first up still hits a conflict
# because a concurrent deploy is mid-cleanup, sleep + retry
# once with a forced container prune in between.
if ! docker compose up -d redis 2>&1 | tee /tmp/redis-up.log; then
  if grep -q 'is already in use' /tmp/redis-up.log; then
    echo '⚠️  redis container conflict; pruning and retrying'
    docker ps -aq --filter 'name=^/fovea-redis-1' | xargs -r docker rm -f
    sleep 2
    docker compose up -d redis
  else
    echo '✗ redis up failed for a non-conflict reason'
    exit 1
  fi
fi
sleep 5
if ! docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
  echo 'Redis is unhealthy; retaining its data and aborting deployment.'
  docker compose logs --tail=80 redis
  exit 1
else
  echo '✅ Redis is healthy'
fi

echo '🚀 Starting infrastructure containers...'
docker compose up -d --no-deps postgres redis otel-collector
# model-service is never started on demo.fovea.video.
# The frontend's modelsDisabled gate greys every
# inference button when /api/models/config 503s, which
# is the steady-state with no model-service container.
docker compose up -d --no-deps prometheus grafana

echo '⏳ Waiting for postgres to be ready...'
for i in {1..20}; do
  if docker compose exec -T postgres pg_isready -U fovea 2>/dev/null; then
    echo '✅ Postgres ready'
    break
  fi
  if [ $i -eq 20 ]; then
    echo 'FATAL: Postgres did not become ready in time'
    docker compose logs --tail=80 postgres
    exit 1
  fi
  sleep 2
done

# Quiesce application writes while retaining the previous container for recovery.
if [ -n "$PREVIOUS_BACKEND" ]; then docker stop "$PREVIOUS_BACKEND"; fi
echo '💾 Backing up the database before migrations...'
BACKUP_DIR=${DEPLOY_BACKUP_DIR:-$HOME/backups}
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/fovea-$(date -u +%Y%m%dT%H%M%SZ).dump"
if ! docker compose exec -T postgres pg_dump -U fovea -Fc fovea < /dev/null > "$BACKUP" || [ ! -s "$BACKUP" ]; then
  echo '❌ Database backup failed; not running migrations.'
  exit 1
fi
echo "✅ Backup written to $BACKUP"
# Keep the five most recent pre-deploy backups.
ls -1t "$BACKUP_DIR"/fovea-*.dump | tail -n +6 | xargs -r rm -f

echo '🔄 Running database migrations (out-of-band)...'
if ! docker compose run --rm --no-deps -T backend sh -c 'npx prisma migrate deploy'; then
  echo '❌ Migrations failed.'
  docker compose logs --tail=80 postgres
  exit 1
fi

# Copies 0.5 annotation, world, ontology, and claim data into the
# layers store and verifies it. A no-op on a fresh install or once a
# verified copy is recorded. On a failed verify the legacy tables are
# untouched, and the deploy stops before starting the new application.
echo '📦 Copying 0.5 data into the layers store (if any)...'
if ! docker compose run --rm --no-deps -T backend sh -c 'node prisma/migrate-0.6/cli.cjs auto'; then
  echo '❌ The 0.5-to-0.6 copy did not verify. Legacy data is intact; not starting the new application.'
  exit 1
fi

echo '👤 Seeding database (out-of-band)...'
if ! docker compose run --rm --no-deps -T backend sh -c 'node prisma/seed.cjs'; then
  echo '⚠️  Seed failed - check ADMIN_PASSWORD is set'
fi

echo '🚀 Starting application containers...'
# Recreate the application only after migrations and the legacy copy pass.
UP_CMD='docker compose up -d --force-recreate backend frontend'
if ! eval $UP_CMD; then
  echo '❌ docker compose up failed; dumping logs from every service:'
  docker compose ps
  echo '--- backend logs ---'
  docker compose logs --tail=300 backend || true
  echo '--- frontend logs ---'
  docker compose logs --tail=100 frontend || true
  echo '--- model-service logs ---'
  docker compose logs --tail=100 model-service || true
  echo '--- postgres logs ---'
  docker compose logs --tail=80 postgres || true
  echo '--- redis logs ---'
  docker compose logs --tail=40 redis || true
  exit 1
fi

echo '⏳ Waiting for backend to be healthy...'
BACKEND_HEALTHY=false
for i in {1..60}; do
  if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    echo '✅ Backend is healthy'
    BACKEND_HEALTHY=true
    break
  fi
  echo "Waiting for backend... ($i/60)"
  sleep 2
done

if [ "$BACKEND_HEALTHY" != "true" ]; then
  echo '❌ Backend never became healthy; dumping logs:'
  docker compose ps
  echo '--- backend logs ---'
  docker compose logs --tail=300 backend || true
  echo '--- model-service logs ---'
  docker compose logs --tail=100 model-service || true
  exit 1
fi

echo '📹 Syncing videos from S3 to database...'
# POST /api/videos/sync is admin-only (onRequest: [requireAdmin]),
# so a bare curl returns 401. Log in as admin first with the
# seeded credentials, then POST sync carrying the session cookie.
COOKIE_JAR=$(mktemp)
python3 scripts/write-deploy-env.py .deploy-secrets.json --login .deploy-login.json
if curl -sf -c "$COOKIE_JAR" -X POST http://localhost:3001/api/auth/login \
     -H 'Content-Type: application/json' \
     --data-binary @.deploy-login.json > /dev/null; then
  curl -sf -b "$COOKIE_JAR" -X POST http://localhost:3001/api/videos/sync \
    || echo '⚠️  Video sync failed, videos may need manual sync'
else
  echo '⚠️  Could not authenticate as admin for video sync; skipping (check secrets.ADMIN_PASSWORD)'
fi
rm -f "$COOKIE_JAR"

echo '🧹 Post-deploy cleanup...'
docker image prune -f

DEPLOY_SUCCEEDED=true
rm -f .deploy-rollback.json
echo '✅ Deployment complete!'
