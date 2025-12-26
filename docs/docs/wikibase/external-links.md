# External Link Controls

FOVEA allows administrators to control whether external links are displayed in the user interface. This is useful for deployments where external internet access is restricted or undesirable.

## Environment Variables

### Master Switch

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOW_EXTERNAL_LINKS` | `true` | Master switch for all external links. Setting to `false` disables both Wikidata and video source links. |

### Specific Controls

These override the master switch when set:

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOW_EXTERNAL_WIKIDATA_LINKS` | (depends on mode) | Controls Wikidata entity page links. In **online** mode, always `true`. In **offline** mode, defaults to master switch value. |
| `ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS` | (master switch) | Controls video source links (`uploaderUrl`, `webpageUrl`). Defaults to master switch value. |

## Behavior by Mode

### Online Mode (Public Wikidata)

When `WIKIDATA_MODE=online`:
- External Wikidata links are **always enabled** regardless of environment variables
- The Wikidata chip links directly to `https://www.wikidata.org/wiki/{Q-ID}`
- Video source links follow the `ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS` setting

### Offline Mode (Local Wikibase)

When `WIKIDATA_MODE=offline`:
- Two chips are displayed for each imported type:
  - **Wikibase chip** (info/blue): Links to local Wikibase instance (always enabled)
  - **Wikidata chip** (primary/disabled): Links to external Wikidata if allowed
- External Wikidata links are controlled by `ALLOW_EXTERNAL_WIKIDATA_LINKS`
- Video source links follow the `ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS` setting

## UI Behavior When Links Are Disabled

### Wikidata Chips

When external Wikidata links are disabled:
- The chip appears greyed out with reduced opacity
- Clicking the chip does nothing
- Tooltip shows "External Wikidata links disabled"
- The Q-identifier is still visible for reference

### Video Source Links

When video source links are disabled:
- Uploader ID (`@username`) is shown as plain text instead of a link
- "View Original" button is disabled with a tooltip explaining the restriction

## Configuration Examples

### Fully Offline (No External Links)

For air-gapped deployments:

```bash
WIKIDATA_MODE=offline
WIKIDATA_URL=http://wikibase:8181/w/api.php
ALLOW_EXTERNAL_LINKS=false
```

### Offline with External Wikidata References

For deployments with internet access but local Wikibase:

```bash
WIKIDATA_MODE=offline
WIKIDATA_URL=http://wikibase:8181/w/api.php
ALLOW_EXTERNAL_WIKIDATA_LINKS=true
ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS=false
```

### Standard Online Mode

For typical cloud deployments:

```bash
WIKIDATA_MODE=online
# All external links enabled by default
```

## Technical Implementation

### Backend Configuration

The `/api/config` endpoint returns:

```json
{
  "wikidata": {
    "mode": "offline",
    "url": "http://wikibase:8181/w/api.php",
    "idMapping": { "Q42": "Q4", ... },
    "allowExternalLinks": false
  },
  "externalLinks": {
    "wikidata": false,
    "videoSources": true
  }
}
```

### Frontend Services

- `wikidataConfig.ts`: Provides `getWikidataConfig()` with `allowExternalLinks` field
- `externalLinksConfig.ts`: Provides `getAllowExternalVideoSourceLinks()`

### Component Changes

- `WikidataChip`: Conditionally renders clickable link or disabled chip
- `AnnotationWorkspace`: Conditionally renders uploader and source links
- `VideoBrowser`: Conditionally renders uploader links in video cards

## Security Considerations

- Disabling external links does not prevent users from copying text and manually navigating
- CDN resources (fonts, map tiles) are not affected by these settings
- API calls to Wikidata/Wikibase are not affected (only UI links)
