# Data Loading Methods

FOVEA's Wikibase loader supports multiple methods for importing data from Wikidata into your local Wikibase instance.

## Overview

| Method | Use Case | Environment Variable |
|--------|----------|---------------------|
| Test Data | Development/testing | (default) |
| Entity List | Known specific entities | `WIKIDATA_ENTITIES` |
| Type Filter | All entities of a type | `WIKIDATA_TYPES` |
| SPARQL Query | Complex selections | `WIKIDATA_SPARQL_FILE` |
| JSON Dump | Bulk import | `WIKIDATA_DUMP_PATH` |
| Config File | Combined methods | `WIKIDATA_CONFIG_FILE` |

## Method 1: Test Data (Default)

Loads a small representative set of entities for development and testing.

```bash
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```

Default entities include:
- Entity types: Q5 (human), Q515 (city), Q6256 (country)
- Event types: Q198 (war), Q178651 (battle)
- Sample entities: Q937 (Einstein), Q60 (NYC)

## Method 2: Entity List

Import specific entities by their Q-IDs.

```bash
WIKIDATA_ENTITIES=Q5,Q515,Q937,Q60 \
WIKIDATA_DEPTH=2 \
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```

| Variable | Description |
|----------|-------------|
| `WIKIDATA_ENTITIES` | Comma-separated Q-IDs |
| `WIKIDATA_DEPTH` | Recursion depth for related entities (default: 1) |

## Method 3: Type Filter (Instance-of)

Import all entities that are instances of specific types.

```bash
WIKIDATA_TYPES=Q5,Q515 \
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```

This imports entities where `P31` (instance-of) matches the specified types.

**Examples:**
- `Q5` - All humans
- `Q515` - All cities
- `Q6256` - All countries

> **Note**: Large types can return thousands of entities. Consider using SPARQL for more control.

## Method 4: SPARQL Query

Import entities based on a SPARQL query file.

```bash
WIKIDATA_SPARQL_FILE=/data/queries/scientists.sparql \
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```

**Example query file** (`scientists.sparql`):

```sparql
SELECT ?item WHERE {
  ?item wdt:P31 wd:Q5 .       # instance of human
  ?item wdt:P106 wd:Q901 .    # occupation: scientist
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks > 50)      # well-known
} LIMIT 100
```

The query should return `?item` bindings with Wikidata entity URIs.

## Method 5: JSON Dump

Import from a standard Wikidata JSON dump file.

```bash
WIKIDATA_DUMP_PATH=/data/wikidata-20231201-all.json.gz \
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```

Supports:
- `.json` - Uncompressed JSON
- `.json.gz` - Gzip compressed JSON

> **Warning**: Full Wikidata dumps are 100GB+ compressed. Consider using subsets.

## Method 6: Configuration File

Combine multiple import methods in a single YAML file.

```bash
WIKIDATA_CONFIG_FILE=/app/config/my-dataset.yaml \
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```

**Example configuration** (`my-dataset.yaml`):

```yaml
version: "1.0"
name: "Event Annotation Dataset"

entities:
  # Direct entity IDs
  direct:
    - Q5          # Human
    - Q515        # City
    - Q178651     # Battle

  # By type with limits
  by_type:
    Q5:           # All humans
      limit: 100
    Q515:         # Cities
      limit: 50

  # SPARQL queries
  sparql_queries:
    - name: "Famous Scientists"
      query: |
        SELECT ?item WHERE {
          ?item wdt:P31 wd:Q5 .
          ?item wdt:P106 wd:Q901 .
        } LIMIT 50

# How deep to follow entity references
reference_depth: 1

# Languages to include
output:
  languages:
    - en
    - es
```

See `wikibase/config/example-config.yaml` for a complete example.

## Mounting Data Files

To provide data files to the loader, mount a volume:

```yaml
# In docker-compose.wikibase.yml or via CLI
volumes:
  - ./my-data:/data:ro
```

Then reference files as `/data/filename`:

```bash
WIKIDATA_DUMP_PATH=/data/my-dump.json.gz \
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```

## Incremental Loading

You can run the loader multiple times to add more data:

```bash
# First load core types
WIKIDATA_ENTITIES=Q5,Q515,Q6256 \
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader

# Then add specific entities
WIKIDATA_ENTITIES=Q937,Q60,Q42 \
docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```

## Performance Considerations

| Factor | Impact | Recommendation |
|--------|--------|----------------|
| Entity count | Linear time | Start with <1000 entities |
| Depth | Exponential growth | Use depth ≤ 2 |
| SPARQL queries | Wikidata rate limits | Add delays between queries |
| Batch size | Memory usage | Default 50 is usually optimal |

## Logging

View loader logs:

```bash
docker compose -f docker-compose.wikibase.yml --profile loader logs wikibase-loader
```

Set log level:

```bash
LOG_LEVEL=DEBUG docker compose -f docker-compose.wikibase.yml --profile loader run --rm wikibase-loader
```
