# syntax=docker/dockerfile:1.4
# Multi-stage Dockerfile for fovea server backend
#
# Build context: repo root (so pnpm-workspace.yaml + root pnpm-lock.yaml + every
# workspace package.json is visible). docker-compose.yml sets context: . and
# routes to this Dockerfile via dockerfile: server/Dockerfile.

# Node version pinned once at the repo root (.nvmrc / package.json engines);
# override with --build-arg NODE_VERSION. This global ARG feeds every stage.
ARG NODE_VERSION=22

# Build stage
FROM node:${NODE_VERSION}-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /repo

# Copy workspace metadata + every package's package.json so pnpm can resolve
# the workspace graph from a single frozen lockfile install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY annotation-tool/package.json ./annotation-tool/
COPY packages/layers-schema/package.json ./packages/layers-schema/

# Install dependencies with cache mount for pnpm
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Build the @fovea/layers-schema workspace package first: the server compiles
# against its generated types, so its dist must exist before the server build.
COPY packages/layers-schema ./packages/layers-schema
RUN pnpm --filter @fovea/layers-schema build

# Copy server source (Prisma first for layer caching)
COPY server/prisma ./server/prisma
RUN pnpm --filter @fovea/server exec prisma generate
COPY server/. ./server/

# Build TypeScript
RUN pnpm --filter @fovea/server build

# Bundle the seed script into a self-contained CommonJS file for the
# production image (tsx is dev-only, and the image ships dist/ + node_modules
# but not src/). The seed pulls the layers-bridge/conversion helpers from
# ../src; esbuild inlines that whole closure so seed.cjs resolves only real
# node_modules at runtime — no ../src or ../dist path dependency survives.
# @prisma/client (generated, native query engine) and bcrypt (native addon)
# stay external and load from node_modules at runtime. The .cjs extension is
# required because server/package.json declares "type": "module".
RUN cd server && pnpm exec esbuild prisma/seed.ts \
      --bundle --platform=node --format=cjs --target=node22 \
      --external:@prisma/client --external:bcrypt \
      --outfile=prisma/seed.cjs

# Production dependencies stage
FROM node:${NODE_VERSION}-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY annotation-tool/package.json ./annotation-tool/
COPY packages/layers-schema/package.json ./packages/layers-schema/

# Install production dependencies for the server filter only. @fovea/layers-schema
# is a types-only workspace dependency (never imported at runtime), so its
# package.json is enough for the frozen-lockfile resolution to succeed here.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @fovea/server --prod

# Generate Prisma client into pnpm's virtual store (the canonical resolution
# path under @prisma/client → .prisma/client/default for pnpm layouts)
COPY --link server/prisma ./server/prisma
RUN pnpm --filter @fovea/server exec prisma generate

# Production stage
FROM node:${NODE_VERSION}-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

# Copy the production deps tree (pnpm's virtual store holds the generated
# Prisma client) from deps stage. We pull just the server package's resolved
# tree by copying the workspace as-is and pointing CWD at /app/server below.
COPY --link --from=deps /repo /app

# Copy built application + prisma artifacts (compiled seed.cjs) from builder
COPY --link --from=builder /repo/server/dist ./server/dist
COPY --link --from=builder /repo/server/prisma ./server/prisma

WORKDIR /app/server

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start server with node directly for better performance
CMD ["node", "dist/index.js"]
