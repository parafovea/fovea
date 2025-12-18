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
       │                    │                       │
       │                    │ ID Mapping            ▼
       │                    ▼               ┌──────────────────┐
       └───────────────────────────────────▶│ wbsearchentities │
                                            │ wbgetentities    │
                                            └──────────────────┘
```

The frontend uses the same MediaWiki API calls (`wbsearchentities`, `wbgetentities`) for both public Wikidata and local Wikibase. Only the endpoint URL changes.

## ID Mapping

When entities are imported into a local Wikibase instance, they are assigned new sequential IDs (Q1, Q2, Q3...) rather than keeping their original Wikidata IDs (Q42, Q937, Q60). This is a fundamental behavior of Wikibase—it auto-assigns IDs and does not allow specifying them during entity creation.

**Why this matters:**
- A search for "Douglas Adams" in local Wikibase returns `Q4` (local ID)
- The same search on public Wikidata returns `Q42` (original ID)
- Annotations should store the original Wikidata ID for interoperability

**Solution: ID Mapping File**

The data loader generates a mapping file (`wikibase/output/id-mapping.json`) that tracks the relationship between original Wikidata IDs and assigned local IDs:

```json
{
  "Q42": "Q4",
  "Q937": "Q14",
  "Q60": "Q7"
}
```

The backend serves this mapping via `/api/config`, and the frontend uses it to:
1. Translate local IDs back to original Wikidata IDs in search results
2. Store the original `wikidataId` in annotations for external compatibility
3. Optionally store the `wikibaseId` for local API calls

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
