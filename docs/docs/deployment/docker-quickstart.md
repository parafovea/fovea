---
sidebar_position: 3
title: Docker Quick Start
description: Get FOVEA running in 5 minutes with Docker Compose
keywords: [docker, quickstart, installation, getting started]
---

# Docker Quick Start

Get FOVEA running in 5 minutes with a single command. This guide uses Docker Compose to start all services with default configuration.

## Prerequisites

- Docker Engine 24.0+ and Docker Compose 2.20+ installed
- See [Prerequisites](./prerequisites.md) for detailed requirements

## Single Command Deployment

Clone the repository and start all services:

```bash
git clone https://github.com/your-org/fovea.git
cd fovea
docker compose up
```

This command:
1. Downloads all Docker images
2. Creates volumes for data persistence
3. Starts all services in CPU mode
4. Shows logs from all containers

The initial startup takes 2-5 minutes while images are downloaded and services initialize.

## Services Started

The following services start automatically:

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | React application |
| Backend | http://localhost:3001 | API server |
| Model Service | http://localhost:8000 | AI inference (CPU mode) |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache and queue |
| Grafana | http://localhost:3002 | Dashboards (admin/admin) |
| Prometheus | http://localhost:9090 | Metrics storage |

## Verification

### Check Service Status

Open a new terminal and run:

```bash
docker compose ps
```

All services should show status as "Up" or "Up (healthy)".

### Access Frontend

Open http://localhost:3000 in your browser. You should see the FOVEA application interface.

### Test Backend API

```bash
curl http://localhost:3001/api/videos
```

Should return an empty array `[]` or list of videos if any exist in `/data`.

### View Monitoring Dashboards

Open http://localhost:3002 in your browser:
- Username: `admin`
- Password: `admin`

Grafana prompts to change password on first login.

## First Steps After Deployment

### 1. Create First Persona

Personas represent different analyst perspectives. Create one through the UI:
1. Navigate to Personas section
2. Click "New Persona"
3. Enter persona name and description
4. Save

### 2. Upload First Video

Place a video file in the `/data` directory:

```bash
# Copy a video to the data directory
cp /path/to/your/video.mp4 data/

# Optionally create metadata file
cat > data/video.info.json <<EOF
{
  "title": "Sample Video",
  "description": "Description of video content"
}
EOF
```

Restart the backend to scan for new videos:

```bash
docker compose restart backend
```

### 3. Create First Annotation

1. Select a video from the video list
2. Use the bounding box tool to draw around an object
3. Assign a type or link to an entity
4. Save the annotation

## Stopping Services

### Stop with Logs Visible

Press `Ctrl+C` in the terminal running `docker compose up`.

### Stop in Background

If services are running detached:

```bash
docker compose down
```

This stops and removes containers but preserves data in volumes.

### Stop and Remove All Data

**Warning**: This deletes all data including database, videos, and models.

```bash
docker compose down -v
```

## Running in Background

To start services in detached mode without logs:

```bash
docker compose up -d
```

View logs later with:

```bash
docker compose logs -f
```

## Common Issues

### Port Already in Use

If you see "port is already allocated" errors:

```bash
# Find process using port 5173
lsof -i :5173

# Kill the process or change FOVEA port in docker-compose.yml
```

### Services Not Starting

Check logs for specific service:

```bash
docker compose logs backend
docker compose logs model-service
```

### Out of Disk Space

Docker images and volumes require significant disk space:

```bash
# Check disk usage
df -h

# Clean up unused Docker resources
docker system prune -a
```

### Model Service Slow

CPU mode is slower than GPU mode. For better performance:
1. Ensure adequate RAM (16GB+ recommended)
2. Close other applications
3. Consider GPU deployment for production use

## Next Steps

- **[CPU Mode Guide](./cpu-mode.md)**: Detailed CPU deployment options
- **[GPU Mode Guide](./gpu-mode.md)**: Deploy with GPU acceleration
- **[Configuration](./configuration.md)**: Customize environment variables
- **[Common Tasks](../operations/common-tasks.md)**: Daily operations guide
