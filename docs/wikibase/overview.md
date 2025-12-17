# Local Wikibase Integration

FOVEA supports using a local Wikibase instance as an alternative to the public Wikidata API. This enables offline operation and custom knowledge graph configurations.

## Why Use Local Wikibase?

- **Offline Operation**: No internet dependency for Wikidata lookups
- **Performance**: Faster response times for frequently-accessed entities
- **Privacy**: Keep annotation data within your infrastructure
- **Custom Ontologies**: Pre-populate with domain-specific entities
- **Reproducibility**: Consistent entity data across deployments

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   FOVEA     │────▶│  Backend        │────▶│  Wikibase        │
│   Frontend  │     │  /api/config    │     │  (MediaWiki API) │
└─────────────┘     └─────────────────┘     └──────────────────┘
       │                                            │
       │                                            ▼
       │                                    ┌──────────────────┐
       └───────────────────────────────────▶│ wbsearchentities │
                                            │ wbgetentities    │
                                            └──────────────────┘
```

The frontend uses the same MediaWiki API calls (`wbsearchentities`, `wbgetentities`) for both public Wikidata and local Wikibase. Only the endpoint URL changes.

## Components

| Component | Description |
|-----------|-------------|
| `wikibase` | MediaWiki with Wikibase extension |
| `wikibase-mysql` | MySQL database for MediaWiki |
| `wikibase-elasticsearch` | Search backend for entity lookup |
| `wikibase-loader` | Data import utility |
| `wdqs` (optional) | SPARQL query service |

## System Requirements

- **Docker**: 20.10+ with Docker Compose V2
- **Memory**: Minimum 4GB RAM for Wikibase stack
- **Disk**: Varies by dataset size (500MB - 100GB+)

## Quick Links

- [Setup Guide](setup.md)
- [Data Loading Methods](data-loading.md)
- [Troubleshooting](troubleshooting.md)
