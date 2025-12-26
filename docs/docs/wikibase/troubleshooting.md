# Troubleshooting

Common issues and solutions when using local Wikibase with FOVEA.

## Connection Issues

### "Failed to fetch Wikidata config from backend"

**Cause**: Frontend can't reach the backend `/api/config` endpoint.

**Solutions**:
1. Ensure the backend is running: `docker compose ps`
2. Check backend logs: `docker compose logs backend`
3. Verify `VITE_API_URL` points to the correct backend URL

### "Error searching Wikidata" in browser console

**Cause**: Frontend can't reach the Wikibase API.

**Solutions**:
1. Verify Wikibase is running: `docker compose -f docker-compose.wikibase.yml ps`
2. Check Wikibase health: `curl http://localhost:8181/api.php?action=query&meta=siteinfo&format=json`
3. Verify CORS is enabled (check browser Network tab for CORS errors)
4. Ensure `WIKIDATA_URL` is accessible from the browser

### Wikibase not starting

**Cause**: Service dependencies not ready.

**Solutions**:
1. Check MySQL is healthy: `docker compose -f docker-compose.wikibase.yml logs wikibase-mysql`
2. Check Elasticsearch: `docker compose -f docker-compose.wikibase.yml logs wikibase-elasticsearch`
3. Wait for health checks: Services need 60+ seconds to initialize

## Search Issues

### Search returns no results

**Causes**:
- Elasticsearch not indexed
- No data loaded into Wikibase

**Solutions**:
1. Check if data exists via API:
   ```bash
   curl "http://localhost:8181/api.php?action=wbsearchentities&search=human&language=en&format=json"
   ```
2. Trigger Elasticsearch reindex:
   ```bash
   docker compose -f docker-compose.wikibase.yml exec wikibase php maintenance/run.php CirrusSearch/ForceSearchIndex.php
   ```
3. Run the data loader to populate Wikibase

### Search is slow

**Cause**: Elasticsearch needs more resources.

**Solutions**:
1. Increase Elasticsearch memory in `docker-compose.wikibase.yml`:
   ```yaml
   environment:
     - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
   ```
2. Ensure Elasticsearch data is on fast storage

## Data Loading Issues

### "Entity creation failed" errors

**Causes**:
- Authentication failed
- Entity already exists
- Invalid entity data

**Solutions**:
1. Check loader credentials match Wikibase admin:
   ```bash
   echo $WIKIBASE_ADMIN_USER $WIKIBASE_ADMIN_PASS
   ```
2. View detailed error logs:
   ```bash
   LOG_LEVEL=DEBUG docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
   ```

### SPARQL query fails

**Cause**: Wikidata query service rate limiting or timeout.

**Solutions**:
1. Add `LIMIT` clause to your query
2. Run during off-peak hours
3. Use smaller batches with the config file method

### "Dump file not found"

**Cause**: File path not accessible in container.

**Solution**: Mount the data directory:
```bash
docker compose -f docker-compose.wikibase.yml --profile loader run \
  -v /path/to/data:/data:ro \
  --rm wikibase-loader
```

## CORS Issues

### "Access-Control-Allow-Origin" error

**Cause**: CORS not properly configured.

**Solutions**:
1. Verify `LocalSettings.d/cors.php` is mounted
2. Add your frontend origin to allowed origins
3. Check browser developer tools for specific CORS error

### Preflight request fails

**Cause**: OPTIONS request not handled.

**Solution**: Ensure Wikibase handles OPTIONS requests:
```php
// In LocalSettings.d/cors.php
$wgCrossSiteAJAXdomains = ['*'];
```

## Memory Issues

### Elasticsearch out of memory

**Symptoms**: Container restarts, "circuit_breaking_exception" errors.

**Solution**: Increase memory limits:
```yaml
environment:
  - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
ulimits:
  memlock:
    soft: -1
    hard: -1
```

### Wikibase PHP memory errors

**Solution**: Increase PHP memory limit:
```yaml
environment:
  - PHP_MEMORY_LIMIT=512M
```

## Data Persistence

### Data lost after restart

**Cause**: Volumes not configured.

**Solution**: Verify volumes in `docker-compose.wikibase.yml`:
```yaml
volumes:
  wikibase-mysql-data:
  wikibase-elasticsearch-data:
```

### Cannot delete data

**Solution**: Remove volumes explicitly:
```bash
docker compose -f docker-compose.wikibase.yml down -v
```

## Getting Help

1. Check container logs: `docker compose logs <service-name>`
2. Verify service health: `docker compose ps`
3. Test API directly with curl
4. Check browser developer tools for network errors

If issues persist, please open an issue on GitHub with:
- Docker Compose version
- Container logs
- Browser console errors
- Steps to reproduce
