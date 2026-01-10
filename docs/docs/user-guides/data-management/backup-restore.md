---
title: Backup and Restore
sidebar_position: 3
---

# Backup and Restore

This guide covers how to create backups of your FOVEA data and restore them when needed. For detailed information about export and import options, see [Exporting Data](./exporting-data.md) and [Importing Data](./importing-data.md).

## Why Backup?

Regular backups protect your work from:
- Accidental deletion of personas, annotations, or ontologies
- System failures or data corruption
- Moving to a new FOVEA instance
- Sharing work with collaborators

## What Gets Backed Up?

A full FOVEA backup includes:

| Data Type | Description |
|-----------|-------------|
| **Personas** | Your analyst personas with roles and information needs |
| **Ontologies** | Entity types, event types, role types, and relation types |
| **World State** | Entities, events, times, locations, and collections |
| **Summaries** | Video summaries created by personas |
| **Claims** | Claims extracted from summaries |
| **Claim Relations** | Relationships between claims |
| **Annotations** | Bounding box sequences linking objects to video frames |

## Quick Backup

### Using the UI

1. Click the **Export** button in the toolbar
2. Select **Export All** to include all data types
3. Keep **Keyframes Only** selected (smaller file size)
4. Click **Export**
5. Save the downloaded `.jsonl` file to a safe location

### Using the API

```bash
curl "http://localhost:3001/api/export/all" \
  -H "Cookie: session_token=YOUR_TOKEN" \
  --output backup-$(date +%Y%m%d).jsonl
```

### Backup File Naming

Use a consistent naming convention:

```
fovea-backup-YYYY-MM-DD.jsonl
fovea-backup-2025-01-15.jsonl
```

For multiple backups per day:

```
fovea-backup-2025-01-15-morning.jsonl
fovea-backup-2025-01-15-afternoon.jsonl
```

## Restore from Backup

### Using the UI

1. Click the **Import** button in the toolbar
2. Drag and drop your backup file or click to browse
3. Review the import preview
4. Configure conflict resolution (usually **Skip existing** for restore)
5. Click **Import**
6. Wait for the import to complete

### Using the API

```bash
curl -X POST "http://localhost:3001/api/import" \
  -H "Cookie: session_token=YOUR_TOKEN" \
  -F "file=@backup-2025-01-15.jsonl"
```

## Backup Strategies

### Daily Backups

For active projects, create daily backups:

```bash
#!/bin/bash
# Run daily via cron
BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d)
curl "http://localhost:3001/api/export/all" \
  -H "Cookie: session_token=YOUR_TOKEN" \
  --output "$BACKUP_DIR/fovea-backup-$DATE.jsonl"

# Keep last 30 days
find "$BACKUP_DIR" -name "fovea-backup-*.jsonl" -mtime +30 -delete
```

### Before Major Changes

Always backup before:
- Deleting personas or ontologies
- Bulk editing annotations
- Upgrading FOVEA
- Running experimental analysis

### Project Milestones

Create named backups at project milestones:

```
fovea-backup-phase1-complete.jsonl
fovea-backup-review-ready.jsonl
fovea-backup-final.jsonl
```

## Partial Restore

You don't have to restore everything. Use selective import:

### Restore Only Personas

```bash
curl "http://localhost:3001/api/export/personas" \
  --output personas-backup.jsonl

# Later, import just personas
curl -X POST "http://localhost:3001/api/import" \
  -F "file=@personas-backup.jsonl"
```

### Restore Only Summaries

```bash
curl "http://localhost:3001/api/export/summaries" \
  --output summaries-backup.jsonl

# Later, import just summaries
curl -X POST "http://localhost:3001/api/import" \
  -F "file=@summaries-backup.jsonl"
```

## Conflict Resolution During Restore

When restoring to a system with existing data:

| Situation | Recommended Resolution |
|-----------|----------------------|
| Restoring to empty system | **Skip existing** (nothing will conflict) |
| Merging with existing data | **Skip existing** (keep current, add new) |
| Overwriting old data | **Replace existing** (backup overwrites current) |
| Keeping both versions | **Rename** (creates copies with new IDs) |

## Restore to Different Environment

To move data between FOVEA instances:

1. **Export** from source instance
2. **Transfer** the `.jsonl` file to the target machine
3. **Import** to target instance

:::warning Video References
Annotations reference videos by ID. If videos don't exist in the target system, annotations linking to those videos will be skipped during import.
:::

## Verifying Backups

After creating a backup, verify it's valid:

### Check File Size

```bash
ls -lh backup.jsonl
# Should be > 0 bytes
```

### Count Lines

```bash
wc -l backup.jsonl
# Should match expected number of items
```

### Validate JSON

```bash
# Each line should be valid JSON
while read line; do
  echo "$line" | jq . > /dev/null || echo "Invalid line"
done < backup.jsonl
```

### Test Restore

Periodically test restoring to a test instance:

1. Set up a test FOVEA instance
2. Import the backup
3. Verify data appears correctly
4. Delete test instance

## Troubleshooting

### Import Failed with Errors

Check the import result for specific errors:

```json
{
  "success": false,
  "errors": [
    {"line": 42, "message": "Video xyz-123 not found"}
  ]
}
```

Common causes:
- Missing videos (annotations reference non-existent videos)
- Invalid JSON (corrupted backup file)
- Schema mismatch (backup from incompatible version)

### Missing Data After Restore

Check import warnings:

```json
{
  "warnings": [
    {"line": 15, "message": "Skipped duplicate persona"}
  ]
}
```

If items were skipped due to conflicts, try:
- Using **Replace existing** instead of **Skip existing**
- Clearing existing data before import

### Large Backup Files

If backups are too large:

1. Use **Keyframes Only** mode (not fully interpolated)
2. Export only the data types you need
3. Filter by specific personas or videos
4. Split into multiple smaller exports

## Best Practices

1. **Regular backups**: Daily for active projects, weekly for archived projects
2. **Test restores**: Periodically verify backups can be restored
3. **Multiple locations**: Keep copies in different locations (local + cloud)
4. **Version control**: Store backups in git for text-based change tracking
5. **Document**: Note what each backup contains and when it was created
6. **Retention policy**: Define how long to keep old backups

## Related Guides

- [Exporting Data](./exporting-data.md) - Detailed export options and file formats
- [Importing Data](./importing-data.md) - Detailed import options and conflict resolution
- [API Reference: Export/Import](../../api-reference/export-import.md) - API documentation
