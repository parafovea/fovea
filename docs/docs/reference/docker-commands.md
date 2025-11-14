---
title: Docker Commands
sidebar_position: 1
keywords: [docker, commands, docker compose, containers, logs]
---

# Docker Commands

Quick reference for Docker Compose commands used with FOVEA.

## Starting and Stopping Services

| Command | Description |
|---------|-------------|
| `docker compose up` | Start all services (default CPU mode) |
| `docker compose up -d` | Start services in background (detached) |
| `docker compose --profile gpu up` | Start with GPU support |
| `docker compose down` | Stop and remove all services |
| `docker compose stop` | Stop services without removing |
| `docker compose start` | Start stopped services |
| `docker compose restart backend` | Restart specific service |

**Examples**:

Start all services in foreground (see logs in terminal):
```bash
docker compose up
```

Start services in background:
```bash
docker compose up -d
```

Stop all services:
```bash
docker compose down
```

## Docker Compose Files

FOVEA uses multiple compose files for different environments:

| File | Purpose | Usage |
|------|---------|-------|
| `docker-compose.yml` | Production configuration | `docker compose up` |
| `docker-compose.dev.yml` | Development overrides | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` |
| `docker-compose.e2e.yml` | E2E testing environment | `docker compose -f docker-compose.e2e.yml up` |

### Development Mode

Start services with hot-reload and debugging tools:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

**Features:**
- Hot-reload volumes for source code changes
- Jaeger distributed tracing: http://localhost:16686
- Maildev email testing: http://localhost:1080, SMTP on port 1025
- Auto-reload: `npm run dev`, `uvicorn --reload`

**When to use:**
- Active development on frontend, backend, or model service
- Debugging distributed request flows with Jaeger
- Testing email notifications with Maildev
- Avoiding container rebuilds after code changes

**When NOT to use:**
- Testing production Docker builds
- Performance benchmarking (dev mode has overhead)
- CI/CD pipelines (use production mode)

## Viewing Logs

| Command | Description |
|---------|-------------|
| `docker compose logs` | View logs from all services |
| `docker compose logs -f` | Follow logs in real-time |
| `docker compose logs backend` | View logs from specific service |
| `docker compose logs -f --tail=100 backend` | Follow last 100 lines |

**Examples**:

View all logs:
```bash
docker compose logs
```

Follow backend logs in real-time:
```bash
docker compose logs -f backend
```

View last 50 lines from model service:
```bash
docker compose logs --tail=50 model-service
```

## Shell Access

| Command | Description |
|---------|-------------|
| `docker compose exec backend sh` | Open shell in backend container |
| `docker compose exec -it postgres psql -U fovea` | PostgreSQL shell |
| `docker compose exec redis redis-cli` | Redis CLI |
| `docker compose exec model-service bash` | Model service bash |

**Examples**:

Access backend shell:
```bash
docker compose exec backend sh
```

Access PostgreSQL database:
```bash
docker compose exec -it postgres psql -U fovea fovea
```

Access Redis CLI:
```bash
docker compose exec redis redis-cli
```

## Database Operations

| Command | Description |
|---------|-------------|
| `docker compose exec backend npx prisma migrate dev` | Run pending migrations |
| `docker compose exec backend npx prisma studio` | Open Prisma Studio |
| `docker compose exec postgres pg_dump -U fovea fovea > backup.sql` | Backup database |
| `docker compose exec -T postgres psql -U fovea fovea < backup.sql` | Restore database |

**Examples**:

Run database migrations:
```bash
docker compose exec backend npx prisma migrate dev
```

Create database backup:
```bash
docker compose exec postgres pg_dump -U fovea fovea > backup.sql
```

Restore from backup:
```bash
docker compose exec -T postgres psql -U fovea fovea < backup.sql
```

## Building and Cleaning Up

| Command | Description |
|---------|-------------|
| `docker compose build` | Rebuild all service images |
| `docker compose build --no-cache backend` | Rebuild without cache |
| `docker compose pull` | Pull latest images |
| `docker system prune` | Remove unused containers, networks, images |
| `docker volume prune` | Remove unused volumes (CAUTION: data loss) |

**Examples**:

Rebuild all services:
```bash
docker compose build
```

Rebuild backend without cache:
```bash
docker compose build --no-cache backend
```

Clean up unused Docker resources:
```bash
docker system prune
```

**Warning**: `docker volume prune` will delete all unused volumes, including database data. Only use if you understand the consequences.

## Service Management

**Check service status**:
```bash
docker compose ps
```

**View resource usage**:
```bash
docker compose stats
```

**Restart a specific service**:
```bash
docker compose restart backend
```

**Stop a specific service**:
```bash
docker compose stop frontend
```

**Start a specific service**:
```bash
docker compose start frontend
```

## Common Workflows

### Full Stack Restart

Restart all services:
```bash
docker compose restart
```

### Rebuild After Code Changes

Rebuild and restart affected service:
```bash
docker compose build backend
docker compose up -d --no-deps backend
```

### View Live Logs from Multiple Services

```bash
docker compose logs -f backend model-service
```

### Clean Restart

Stop everything, remove containers, rebuild, start:
```bash
docker compose down
docker compose build
docker compose up -d
```

### Database Reset

Stop services, remove volumes, restart:
```bash
docker compose down -v
docker compose up -d
```

**Warning**: This deletes all data.

## Troubleshooting Commands

**Check if containers are running**:
```bash
docker compose ps
```

**Inspect container details**:
```bash
docker compose inspect backend
```

**View container resource usage**:
```bash
docker compose stats
```

**Check container logs for errors**:
```bash
docker compose logs backend | grep -i error
```

**Restart unhealthy container**:
```bash
docker compose restart backend
```

## Next Steps

- Review [Environment Variables](./environment-variables.md) for configuration options
- Explore [Service Ports](./service-ports.md) for network configuration
- Read about [Docker Profiles](../concepts/docker-profiles.md) for deployment modes
