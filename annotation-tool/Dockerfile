# syntax=docker/dockerfile:1.4
# Multi-stage Dockerfile for fovea annotation tool frontend
#
# Build context: repo root. docker-compose.yml sets context: . and routes
# here via dockerfile: annotation-tool/Dockerfile.

# Node version is pinned once at the repo root (.nvmrc / package.json engines);
# override with --build-arg NODE_VERSION. pnpm is pinned by the root
# package.json "packageManager" field; the corepack line below mirrors it.
ARG NODE_VERSION=22

# Build stage
FROM node:${NODE_VERSION}-alpine AS builder

# Install pnpm (version mirrors the root package.json "packageManager" field)
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /repo

# Accept build arguments for Vite environment variables
ARG VITE_API_URL
ARG VITE_MODEL_SERVICE_URL
ARG VITE_WIKIDATA_URL
ARG VITE_WIKIDATA_MODE
# Set to "1" only in the E2E build target so the bundle exposes the
# test-only window.__foveaTour handle. Production builds leave this
# unset; the gate is build-time so the handle is dead-code-eliminated.
ARG VITE_E2E
# Axios per-call timeout for model-service-bound requests, baked in at
# Vite build time so CPU-mode deployments can extend the ceiling
# without a code change. See server/src/lib/fetchModelService.ts for
# the matching backend env vars.
ARG VITE_INFERENCE_TIMEOUT_MS
# Enable MSW tour-demo mocking; the bundle imports the worker dynamically
# behind this flag so it tree-shakes out of production builds.
ARG VITE_TOUR_DEMO
# Mount the public tour catalogue at `/` for the demo.fovea.video
# deployment. Production builds leave this unset; the gate is build-time
# so the public-landing route tree-shakes out of stock bundles. Wired in
# tandem with VITE_TOUR_DEMO=1 by the deploy.yml `demo_mode` flag and
# the docker-compose.yml frontend build args.
ARG VITE_DEMO_PUBLIC

# Export as environment variables for Vite build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MODEL_SERVICE_URL=$VITE_MODEL_SERVICE_URL
ENV VITE_WIKIDATA_URL=$VITE_WIKIDATA_URL
ENV VITE_WIKIDATA_MODE=$VITE_WIKIDATA_MODE
ENV VITE_E2E=$VITE_E2E
ENV VITE_INFERENCE_TIMEOUT_MS=$VITE_INFERENCE_TIMEOUT_MS
ENV VITE_TOUR_DEMO=$VITE_TOUR_DEMO
ENV VITE_DEMO_PUBLIC=$VITE_DEMO_PUBLIC

# Copy workspace metadata + the annotation-tool/server manifests so pnpm can
# install from the single root lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY annotation-tool/package.json ./annotation-tool/
COPY server/package.json ./server/

# Copy the full @fovea/layers-schema package (src + tsconfig) before install:
# its `prepare` script runs `tsc` during `pnpm install`, so the tsconfig and
# source must already be present or the install aborts with TS5058 before any
# explicit build step is reached.
COPY packages/layers-schema ./packages/layers-schema

# Install workspace dependencies with cache mount for pnpm. Include
# @fovea/layers-schema so its own build toolchain (tsc) is installed: the
# frontend type-checks against its generated types and builds it below.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @fovea/annotation-tool --filter @fovea/layers-schema

# Build the @fovea/layers-schema workspace package so its dist exists before the
# frontend type-checks (tsc) against its generated types.
RUN pnpm --filter @fovea/layers-schema build

# Copy annotation-tool source
COPY annotation-tool/. ./annotation-tool/

# Build application with environment variables
RUN pnpm --filter @fovea/annotation-tool build

# Production stage
FROM nginx:alpine AS production

# Copy custom nginx config
COPY --link annotation-tool/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --link --from=builder /repo/annotation-tool/dist /usr/share/nginx/html

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
