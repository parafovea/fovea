# Wikibase Setup Guide

This guide explains how to set up and configure a local Wikibase instance for FOVEA.

## Quick Start

1. **Start Wikibase services:**

```bash
docker compose -f docker-compose.yml -f docker-compose.wikibase.yml up -d
```

2. **Configure FOVEA to use local Wikibase:**

Create or update your `.env` file:

```bash
WIKIDATA_MODE=offline
WIKIDATA_URL=http://wikibase:8181/w/api.php
```

3. **Load initial data (optional):**

```bash
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WIKIDATA_MODE` | `online` | `online` for public Wikidata, `offline` for local Wikibase |
| `WIKIDATA_URL` | `https://www.wikidata.org/w/api.php` | Wikidata/Wikibase API endpoint |
| `WIKIBASE_ID_MAPPING_PATH` | `/wikibase/id-mapping.json` | Path to ID mapping file (see [ID Mapping](overview.md#id-mapping)) |

### Wikibase Service Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WIKIBASE_PORT` | `8181` | Wikibase web interface port |
| `WIKIBASE_ADMIN_USER` | `admin` | MediaWiki admin username |
| `WIKIBASE_ADMIN_PASS` | `adminpass123` | MediaWiki admin password |
| `WIKIBASE_DB_USER` | `wikibase` | MySQL username |
| `WIKIBASE_DB_PASS` | `wikibase_password` | MySQL password |

### Build-time Configuration

For frontend builds, you can bake in the Wikibase URL:

```bash
docker build \
  --build-arg VITE_WIKIDATA_URL=http://wikibase:8181/w/api.php \
  --build-arg VITE_WIKIDATA_MODE=offline \
  -t fovea-frontend ./annotation-tool
```

## Service Management

### Start Services

```bash
# Start FOVEA with Wikibase
docker compose -f docker-compose.yml -f docker-compose.wikibase.yml up -d

# Include SPARQL query service
docker compose -f docker-compose.yml -f docker-compose.wikibase.yml --profile wdqs up -d
```

### Stop Services

```bash
docker compose -f docker-compose.yml -f docker-compose.wikibase.yml down
```

### View Logs

```bash
docker compose -f docker-compose.wikibase.yml logs -f wikibase
```

### Reset Data

```bash
# Stop services and remove volumes
docker compose -f docker-compose.wikibase.yml down -v
```

## Accessing Wikibase

- **Web Interface**: http://localhost:8181
- **API Endpoint**: http://localhost:8181/w/api.php
- **SPARQL Endpoint** (if enabled): http://localhost:8282/sparql

### Default Credentials

- Username: `admin`
- Password: `adminpass123`

> **Security Note**: Change these credentials for production deployments.

## Network Configuration

Wikibase services connect to the main `fovea-network`. Internal service URLs:

| Service | Internal URL |
|---------|--------------|
| Wikibase | `http://wikibase:80` |
| MySQL | `wikibase-mysql:3306` |
| Elasticsearch | `wikibase-elasticsearch:9200` |

## Health Checks

The Wikibase service includes a health check that verifies the API is responding:

```bash
curl http://localhost:8181/api.php?action=query&meta=siteinfo&format=json
```

## Next Steps

- [Load data into Wikibase](data-loading.md)
- [Troubleshoot common issues](troubleshooting.md)
