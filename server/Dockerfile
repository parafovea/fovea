# syntax=docker/dockerfile:1.4
# Multi-stage Dockerfile for fovea server backend

# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and lockfile
COPY package.json pnpm-lock.yaml ./

# Install dependencies with cache mount for pnpm
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy Prisma schema first (if exists) for better layer caching
COPY prisma ./prisma

# Generate Prisma client
RUN if [ -d "prisma" ]; then pnpm exec prisma generate; fi

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm run build

# Compile seed script for production use (tsx not available in production)
# Use .cjs extension since package.json has "type": "module"
RUN pnpm exec tsc prisma/seed.ts --outDir prisma --module commonjs --esModuleInterop --target ES2015 && \
    mv prisma/seed.js prisma/seed.cjs

# Production dependencies stage
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and lockfile
COPY package.json pnpm-lock.yaml ./

# Install production dependencies with cache mount
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Copy Prisma schema and generate client
COPY --link prisma ./prisma
RUN pnpm exec prisma generate

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy production dependencies from deps stage
COPY --link --from=deps /app/node_modules ./node_modules

# Copy Prisma client from deps stage
COPY --link --from=deps /app/node_modules/.prisma ./node_modules/.prisma

# Copy built application
COPY --link --from=builder /app/dist ./dist
COPY --link --from=builder /app/package.json ./package.json

# Copy Prisma schema, migrations, and compiled seed script for database setup
COPY --link --from=builder /app/prisma ./prisma

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start server with node directly for better performance
CMD ["node", "dist/index.js"]
