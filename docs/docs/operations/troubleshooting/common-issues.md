---
sidebar_position: 1
title: Common Issues
description: Troubleshooting guide for common FOVEA issues with solutions
keywords: [troubleshooting, issues, errors, debugging, solutions]
---

# Common Issues

This page documents common issues and their solutions. Each issue includes symptoms, root cause, step-by-step solution, and prevention tips.

## Frontend Issues

### Blank Screen After Loading

**Symptoms**:
- Frontend loads but shows blank page
- No content visible
- Browser console may show errors

**Cause**: Backend API is unreachable or returning errors

**Solution**:

1. Check backend is running:
```bash
docker compose ps backend
```

2. Check backend logs for errors:
```bash
docker compose logs backend
```

3. Verify frontend can reach backend:
```bash
curl http://localhost:3001/health
```

4. Check CORS configuration in backend matches frontend URL

**Prevention**:
- Use health check endpoints in deployment
- Configure proper CORS settings
- Monitor backend availability

### API Connection Errors

**Symptoms**:
- "Failed to fetch" errors in browser console
- Network errors when making API calls
- CORS policy errors

**Cause**: CORS configuration mismatch between frontend and backend

**Solution**:

1. Check CORS_ORIGIN in backend environment:
```bash
docker compose exec backend env | grep CORS_ORIGIN
```

2. Ensure it matches frontend URL (http://localhost:5173 for development)

3. Update CORS_ORIGIN if needed:
```env
CORS_ORIGIN=http://localhost:5173
```

4. Restart backend:
```bash
docker compose restart backend
```

**Prevention**:
- Set CORS_ORIGIN correctly during deployment
- Use environment variables for configuration
- Test API connectivity after deployment

### Video Won't Play

**Symptoms**:
- Video player shows error or loading indefinitely
- Video playback controls disabled
- Black screen in video player

**Cause**: Video file not accessible, wrong format, or server configuration issue

**Solution**:

1. Check video exists in `/data` directory:
```bash
ls -lh data/*.mp4
```

2. Verify video format (MP4 and WebM supported):
```bash
file data/your_video.mp4
```

3. Check backend serves video:
```bash
curl -I http://localhost:3001/videos/your_video.mp4
```

4. Check file permissions:
```bash
ls -l data/your_video.mp4
```

**Prevention**:
- Use supported video formats (MP4, WebM)
- Verify file permissions (readable by Docker)
- Test video playback after adding new videos

## Backend Issues

### Database Connection Failed

**Symptoms**:
- Backend logs show "Connection refused" to PostgreSQL
- Backend service fails to start
- Database migration errors

**Cause**: Database not ready, wrong credentials, or network issues

**Solution**:

1. Check PostgreSQL is running:
```bash
docker compose ps postgres
```

2. Check PostgreSQL logs:
```bash
docker compose logs postgres
```

3. Verify DATABASE_URL has correct credentials:
```bash
docker compose exec backend printenv | grep DATABASE_URL
```

4. Test database connection:
```bash
docker compose exec backend npx prisma db execute --stdin <<< "SELECT 1"
```

5. Wait for database to be ready (check health status)

**Prevention**:
- Use `depends_on` with health checks in docker-compose.yml
- Configure proper startup order
- Monitor database health

### Migration Errors

**Symptoms**:
- "Migration failed" on backend startup
- Database schema out of sync
- Prisma errors about missing tables

**Cause**: Schema changes conflict with existing data or migration not applied

**Solution**:

1. Check migration status:
```bash
docker compose exec backend npx prisma migrate status
```

2. Apply pending migrations:
```bash
docker compose exec backend npx prisma migrate deploy
```

3. If migrations fail, check for conflicts in logs

4. For development only, reset database:
```bash
docker compose exec backend npx prisma migrate reset
```

**Prevention**:
- Test migrations in development first
- Backup database before applying migrations
- Review migration SQL before applying

### High Memory Usage

**Symptoms**:
- Backend container uses more than 4GB RAM
- System becomes slow
- Docker reports memory warnings
- Container may be restarted by Docker

**Cause**: Memory leak, large dataset in cache, or insufficient resource limits

**Solution**:

1. Check current memory usage:
```bash
docker stats backend
```

2. Restart backend:
```bash
docker compose restart backend
```

3. Check for memory leaks in logs:
```bash
docker compose logs backend | grep -i "memory\|heap"
```

4. Reduce cache TTL in Redis if caching large datasets

5. Set memory limits in docker-compose.yml:
```yaml
backend:
  deploy:
    resources:
      limits:
        memory: 4G
```

**Prevention**:
- Monitor memory usage regularly
- Set appropriate resource limits
- Configure cache expiration
- Profile application for memory leaks

## Model Service Issues

### CUDA Out of Memory

**Symptoms**:
- Model service crashes with "CUDA out of memory" error
- GPU memory exhausted messages
- Container restarts

**Cause**: GPU VRAM exhausted by model or batch size

**Solution**:

1. Check GPU memory usage:
```bash
docker compose exec model-service-gpu nvidia-smi
```

2. Reduce batch size in `model-service/config/models.yaml`

3. Use smaller models

4. Switch to CPU mode temporarily:
```bash
docker compose --profile gpu down
docker compose up -d
```

5. Adjust PyTorch memory settings:
```env
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256
```

**Prevention**:
- Monitor GPU memory usage
- Use appropriate model sizes for available VRAM
- Configure batch sizes conservatively
- Set memory limits in configuration

### Model Not Loading

**Symptoms**:
- "Failed to load model" errors
- Model service takes very long to start
- Inference requests fail

**Cause**: Model files not downloaded, corrupted, or network issues

**Solution**:

1. Check model service logs:
```bash
docker compose logs model-service
```

2. Look for specific model name in error

3. Delete model cache and restart:
```bash
docker volume rm fovea_model-cache
docker compose up -d model-service
```

4. Verify internet connection for model download

5. Check disk space:
```bash
df -h
```

**Prevention**:
- Pre-download models
- Use persistent volume for model cache
- Ensure adequate disk space
- Monitor model loading times

### Slow Inference

**Symptoms**:
- Inference takes more than 30 seconds for simple tasks
- Job queue backs up
- Timeout errors

**Cause**: CPU mode, model configuration issue, or resource contention

**Solution**:

1. Verify GPU mode if applicable:
```bash
docker compose exec model-service-gpu nvidia-smi
```

2. Check DEVICE environment variable:
```bash
docker compose exec model-service env | grep DEVICE
```

3. Switch to faster model in `config/models.yaml`

4. Verify no other processes using GPU

5. Check system resource usage:
```bash
docker stats
```

**Prevention**:
- Use GPU mode for production
- Benchmark models before deployment
- Monitor inference latency
- Configure appropriate model sizes

## Infrastructure Issues

### Docker Out of Disk Space

**Symptoms**:
- "No space left on device" errors
- Build failures
- Container start failures

**Cause**: Docker images, containers, and volumes consuming disk

**Solution**:

1. Check disk usage:
```bash
df -h
docker system df
```

2. Clean up Docker resources:
```bash
docker system prune -a --volumes
```

3. Remove unused images:
```bash
docker image prune -a
```

4. Check large volumes:
```bash
docker volume ls
docker volume inspect fovea_model-cache
```

**Prevention**:
- Regular cleanup (weekly/monthly)
- Monitor disk space
- Set up disk space alerts
- Use appropriate volume sizes

### Port Already in Use

**Symptoms**:
- "Port 5173 is already allocated" error
- "Address already in use" error
- Service fails to start

**Cause**: Another service using the port

**Solution**:

1. Find process using port:
```bash
lsof -i :5173
```

2. Kill process:
```bash
kill <PID>
```

Or change FOVEA port in docker-compose.yml:
```yaml
frontend:
  ports:
    - "5174:5173"  # Use different external port
```

**Prevention**:
- Use standard ports consistently
- Document port usage
- Check for conflicts before deployment
- Use port range that does not conflict with common services

### Permission Denied

**Symptoms**:
- "Permission denied" accessing `/data` directory
- Cannot write to volumes
- Docker socket permission errors

**Cause**: File permissions mismatch or user permissions

**Solution**:

1. Fix file ownership:
```bash
sudo chown -R $USER:$USER data/
```

2. Check Docker permissions:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

3. Verify volume permissions:
```bash
docker compose exec backend ls -la /data
```

4. Set correct permissions in docker-compose.yml:
```yaml
volumes:
  - ./data:/data:rw
```

**Prevention**:
- Set correct permissions during setup
- Run containers as appropriate user
- Document permission requirements
- Use Docker user namespace remapping for security

## General Troubleshooting Steps

### Diagnostic Commands

**Check service status**:
```bash
docker compose ps
```

**View all logs**:
```bash
docker compose logs -f
```

**Check specific service**:
```bash
docker compose logs backend
docker compose logs model-service
```

**View resource usage**:
```bash
docker stats
```

**Inspect network**:
```bash
docker network inspect fovea_fovea-network
```

**Check health endpoints**:
```bash
curl http://localhost:3001/health
curl http://localhost:8000/health
```

### Restart Strategy

1. **Single service**:
```bash
docker compose restart backend
```

2. **All services**:
```bash
docker compose restart
```

3. **Clean restart**:
```bash
docker compose down
docker compose up -d
```

4. **Rebuild and restart**:
```bash
docker compose up -d --build
```

### Getting Help

If issues persist after troubleshooting:

1. Collect diagnostic information:
   - Service logs: `docker compose logs > logs.txt`
   - Configuration: `docker compose config`
   - System info: `docker version`, `docker compose version`

2. Check GitHub issues for similar problems

3. Search documentation for related topics

4. Include diagnostic information when asking for help

## Next Steps

- **[Common Tasks](../common-tasks.md)**: Daily operations
- **[Monitoring](../monitoring/overview.md)**: Set up monitoring
- **[Configuration](../../deployment/configuration.md)**: Configuration guide
