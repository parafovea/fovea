# syntax=docker/dockerfile:1.4
# Multi-stage Dockerfile for fovea server backend
#
# Build context: repo root (so pnpm-workspace.yaml + root pnpm-lock.yaml + every
# workspace package.json is visible). docker-compose.yml sets context: . and
# routes to this Dockerfile via dockerfile: server/Dockerfile.

# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

# Copy workspace metadata + every package's package.json so pnpm can resolve
# the workspace graph from a single frozen lockfile install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY annotation-tool/package.json ./annotation-tool/

# Install dependencies with cache mount for pnpm
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy server source (Prisma first for layer caching)
COPY server/prisma ./server/prisma
RUN pnpm --filter @fovea/server exec prisma generate
COPY server/. ./server/

# Build TypeScript
RUN pnpm --filter @fovea/server build

# Compile seed script for production use (tsx not available in production).
# Use .cjs extension since server/package.json has "type": "module".
RUN cd server && pnpm exec tsc prisma/seed.ts --outDir prisma --module commonjs --esModuleInterop --target ES2015 && \
    mv prisma/seed.js prisma/seed.cjs

# Production dependencies stage
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY annotation-tool/package.json ./annotation-tool/

# Install production dependencies for the server filter only
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @fovea/server --prod

# Generate Prisma client into pnpm's virtual store (the canonical resolution
# path under @prisma/client → .prisma/client/default for pnpm layouts)
COPY --link server/prisma ./server/prisma
RUN pnpm --filter @fovea/server exec prisma generate

# Production stage
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

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
