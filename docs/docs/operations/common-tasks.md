---
sidebar_position: 1
title: Common Tasks
description: Daily operations for managing FOVEA services
keywords: [operations, docker, maintenance, backup, logs]
---

# Common Tasks

This page covers common operational tasks for managing FOVEA services.

## Starting and Stopping Services

### Start All Services

**CPU mode** (default):
```bash
docker compose up -d
```

**GPU mode**:
```bash
docker compose --profile gpu up -d
```

**With logs visible**:
```bash
docker compose up
```

**Specific services only**:
```bash
docker compose up -d frontend backend postgres redis
```

### Stop Services

**Stop all**:
```bash
docker compose down
```

**Stop GPU services**:
```bash
docker compose --profile gpu down
```

**Stop and remove volumes** (WARNING: deletes all data):
```bash
docker compose down -v
```

### Restart Services

**Restart specific service**:
```bash
docker compose restart backend
```

**Restart all**:
```bash
docker compose restart
```

### Switch Between CPU and GPU

**Switch from CPU to GPU**:
```bash
docker compose down
docker compose --profile gpu up -d
```

**Switch from GPU to CPU**:
```bash
docker compose --profile gpu down
docker compose up -d
```

### Check Service Status

```bash
docker compose ps
```

Shows running status and health for all services.

## Viewing Logs

### All Services

```bash
docker compose logs -f
```

### Specific Service

```bash
docker compose logs -f backend
docker compose logs -f model-service
```

### Last N Lines

```bash
docker compose logs --tail=100 backend
```

### Without Following

```bash
docker compose logs backend
```

## Database Operations

### Run Migrations

```bash
docker compose exec backend npx prisma migrate deploy
```

### Access PostgreSQL Shell

```bash
docker compose exec postgres psql -U fovea fovea
```

### Backup Database

```bash
docker compose exec postgres pg_dump -U fovea fovea > backup.sql
```

**With timestamp**:
```bash
docker compose exec postgres pg_dump -U fovea fovea > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore Database

```bash
cat backup.sql | docker compose exec -T postgres psql -U fovea fovea
```

### Open Prisma Studio

```bash
docker compose exec backend npx prisma studio
```

Access at http://localhost:5555

### Reset Database

**WARNING**: This deletes all data.

```bash
docker compose exec backend npx prisma migrate reset
```

## Video Management

### Add Videos

Copy video files to the `/data` directory:

```bash
cp /path/to/video.mp4 data/
```

### Add Video Metadata

Create `.info.json` file alongside video:

```bash
cat > data/video.info.json <<EOF
{
  "title": "Video Title",
  "description": "Video description"
}
EOF
```

### Scan for New Videos

Restart backend to detect new videos:

```bash
docker compose restart backend
```

### List Videos

```bash
ls -lh data/*.mp4
```

## Updating Services

### Pull Latest Images

```bash
docker compose pull
```

### Rebuild Services

**Rebuild all**:
```bash
docker compose build
```

**Rebuild specific service**:
```bash
docker compose build backend
```

**Rebuild without cache**:
```bash
docker compose build --no-cache frontend
```

### Update and Restart

```bash
docker compose up -d --build
```

## Cleaning Up

### Remove Stopped Containers

```bash
docker compose down
```

### Remove Unused Docker Resources

```bash
docker system prune
```

**Remove all** (including volumes):
```bash
docker system prune -a --volumes
```

### View Disk Usage

```bash
docker system df
```

### Clean Specific Volume

**WARNING**: Deletes data in volume.

```bash
docker volume rm fovea_model-cache
```

## Monitoring and Health

### Check Container Resource Usage

```bash
docker stats
```

### View Service Health

```bash
docker compose ps
```

Look for "(healthy)" status.

### Test Health Endpoints

**Backend**:
```bash
curl http://localhost:3001/api/health
```

**Model Service**:
```bash
curl http://localhost:8000/health
```

### Access Monitoring Dashboards

- **Grafana**: http://localhost:3002 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Bull Board**: http://localhost:3001/admin/queues

## Shell Access

### Backend Shell

```bash
docker compose exec backend sh
```

### Model Service Shell

**CPU mode**:
```bash
docker compose exec model-service bash
```

**GPU mode**:
```bash
docker compose exec model-service-gpu bash
```

### PostgreSQL Shell

```bash
docker compose exec postgres psql -U fovea fovea
```

### Redis Shell

```bash
docker compose exec redis redis-cli
```

## Configuration

### View Environment Variables

**In container**:
```bash
docker compose exec backend env
```

### Edit Configuration

Edit `.env` file in project root, then restart:

```bash
docker compose restart
```

### View Compose Configuration

```bash
docker compose config
```

Shows resolved configuration with environment variable substitution.

## Troubleshooting

### Service Won't Start

Check logs for errors:

```bash
docker compose logs <service-name>
```

### Port Conflicts

Find process using port:

```bash
lsof -i :5173
```

Kill process or change port in docker-compose.yml.

### Out of Disk Space

Clean Docker resources:

```bash
docker system prune -a --volumes
```

Check disk usage:

```bash
df -h
```

### Database Connection Issues

Ensure PostgreSQL is running:

```bash
docker compose ps postgres
```

Check logs:

```bash
docker compose logs postgres
```

### GPU Not Detected

Ensure using GPU profile:

```bash
docker compose --profile gpu ps
```

Test GPU in container:

```bash
docker compose exec model-service-gpu nvidia-smi
```

## Backup Strategy

### Critical Data

**Database** (daily recommended):
```bash
docker compose exec postgres pg_dump -U fovea fovea | gzip > backup_$(date +%Y%m%d).sql.gz
```

**Videos** (as needed):
```bash
tar -czf videos_backup_$(date +%Y%m%d).tar.gz data/
```

**Configuration** (before changes):
```bash
cp .env .env.backup
cp docker-compose.yml docker-compose.yml.backup
```

### Automated Backup Script

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/path/to/backups

# Backup database
docker compose exec postgres pg_dump -U fovea fovea | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup Redis
docker compose exec redis redis-cli SAVE
docker cp fovea-redis-1:/data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# Backup configuration
cp .env $BACKUP_DIR/env_$DATE

echo "Backup completed: $DATE"
```

## Next Steps

- **[Monitoring](./monitoring/overview.md)**: Set up monitoring and alerts
- **[Troubleshooting](./troubleshooting/common-issues.md)**: Resolve common issues
- **[Configuration](../deployment/configuration.md)**: Advanced configuration
