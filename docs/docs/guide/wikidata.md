# Wikidata

Use Wikidata lookups to attach external Q-IDs to world entities,
event types, and entity types. Two backing modes are supported:
public Wikidata via its API, or a self-hosted Wikibase instance.

## Modes

The mode is set by `WIKIDATA_MODE`:

```text
WIKIDATA_MODE=online    # default. Hits https://www.wikidata.org/w/api.php
WIKIDATA_MODE=offline   # Hits a local Wikibase. Requires WIKIDATA_URL and
                        # optionally WIKIBASE_ID_MAPPING_PATH
```

`WIKIBASE_ID_MAPPING_PATH` points at a JSON file mapping public
Wikidata Q-IDs to local Wikibase ids; the backend uses it to
translate references when running offline.

## Local Wikibase

A `docker-compose.wikibase.yml` ships a local Wikibase setup. The
provisioning workflow (extract Q-IDs, resolve them against
Wikidata, write the id mapping) lives under `wikibase/`. The
result is a self-contained Wikibase that hosts only the items
Fovea needs, useful for air-gapped deployments.

## External link gating

Three flags control whether the frontend renders links into
external sites:

```text
ALLOW_EXTERNAL_LINKS                = true   (master switch)
ALLOW_EXTERNAL_WIKIDATA_LINKS       = true   (offline mode only;
                                              online mode always allows)
ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS   = true   (uploaderUrl, webpageUrl)
```

Set them to `false` in deployments where the user must not be
deep-linked off the platform.
