# syntax=docker/dockerfile:1.4
# Multi-stage Dockerfile for fovea annotation tool frontend

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build arguments for Vite environment variables
ARG VITE_API_URL
ARG VITE_MODEL_SERVICE_URL

# Export as environment variables for Vite build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MODEL_SERVICE_URL=$VITE_MODEL_SERVICE_URL

# Copy package files
COPY package*.json ./

# Install dependencies with cache mount for npm
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy source code
COPY . .

# Build application with environment variables
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Copy custom nginx config
COPY --link nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --link --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
