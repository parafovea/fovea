---
title: Exporting Annotations
sidebar_position: 1
---

# Exporting Annotations

FOVEA exports annotations, ontologies, and world state in JSON Lines format. This guide covers export options, file formats, and common workflows.

## Quick Export

For a quick export of all data:

1. **Click the Export button** in the toolbar
2. **Click "Export"** in the dialog (uses default settings)
3. A JSON Lines file downloads to your browser's download folder

The default export includes:
- All personas and their ontologies
- All world state (entities, events, times, collections)
- All annotations with bounding box sequences
- **Keyframes only** (not fully interpolated frames)

## Export Dialog Options

### Export Mode

Choose how to export bounding box sequences:

**Keyframes-Only Mode** (Recommended, default):
- Exports only keyframes and interpolation configurations
- File size: ~2-5 MB for 100 annotations
- Interpolated frames are recalculated on import
- Preserves user intent (where keyframes were placed)
- **Use for**: Standard workflows, sharing work, backups

**Fully Interpolated Mode**:
- Exports all interpolated frames (every frame with a box)
- File size: ~100-250 MB for 100 annotations (50x larger)
- No recalculation needed on import
- Frame-precise representation
- **Use for**: Debugging interpolation, external tool export, archival

:::warning File Size
Fully interpolated mode can create files 50-100x larger than keyframes-only. Only use when necessary.
:::

### Filter Options

Narrow your export to specific data:

**By Persona**:
- Check the personas you want to export
- Unchecked personas are excluded
- Their annotations and ontologies are not exported

**By Video**:
- Select specific videos to export annotations for
- Unchecked videos are excluded
- Annotations for those videos are not exported

**By Annotation Type**:
- Entity annotations only
- Event annotations only
- Time annotations only
- All annotation types (default)

### Include Options

Choose what data categories to export:

| Option | Includes | File Size Impact |
|--------|----------|------------------|
| **Include Personas** | Personas and their ontologies | Small (+1 KB per persona) |
| **Include World State** | Entities, events, times, collections | Medium (+10-100 KB) |
| **Include Annotations** | All bounding box sequences | Large (+1-10 MB) |

Uncheck categories you don't need to reduce file size.

## Export Statistics Preview

Before exporting, the dialog shows statistics:

```
Export Statistics
─────────────────────────────────────
Personas:                    3
Ontologies:                  3
Entities:                   45
Events:                     12
Annotations:               234
  Total Sequences:         234
  Total Keyframes:         892
  Estimated File Size:   2.8 MB
```

Review these numbers to verify you're exporting what you expect.

## Step-by-Step Export Workflow

### 1. Open Export Dialog

Click the **Export** button in the main toolbar (top right).

### 2. Choose Export Mode

Select **Keyframes-only** or **Fully interpolated**:

```
┌─ Export Mode ────────────────┐
│ ● Keyframes-only (2.8 MB)   │
│ ○ Fully interpolated (140 MB)│
└──────────────────────────────┘
```

### 3. Apply Filters (Optional)

If exporting a subset:

**Filter by persona**:
1. Uncheck personas you don't want
2. Statistics update to show filtered count

**Filter by video**:
1. Uncheck videos you don't want
2. Annotations for unchecked videos are excluded

**Filter by type**:
1. Select entity, event, or time annotations only
2. Other types are excluded

### 4. Review Statistics

Check the export statistics to confirm:
- Annotation count matches expectations
- File size is acceptable
- Keyframe count is reasonable

### 5. Click Export

1. **Click the "Export" button**
2. System generates the JSON Lines file
3. Progress indicator appears
4. File downloads when ready

### 6. Verify Export

Open the downloaded file in a text editor to verify:

```jsonl
{"type":"persona","data":{...}}
{"type":"ontology","data":{...}}
{"type":"entity","data":{...}}
{"type":"annotation","data":{"boundingBoxSequence":{...}}}
```

Each line is a JSON object with `type` and `data` fields.

## File Format: JSON Lines

### Format Structure

JSON Lines (.jsonl) format has one JSON object per line:

```jsonl
{"type":"persona","data":{"id":"p1","role":"Sports Analyst"}}
{"type":"entity","data":{"id":"e1","name":"Player #10"}}
{"type":"annotation","data":{"id":"a1","boundingBoxSequence":{...}}}
```

### Line Types

| Type | Content |
|------|---------|
| `persona` | Persona definition |
| `ontology` | Persona ontology (entity types, event types, etc.) |
| `entity` | Entity instance |
| `event` | Event instance |
| `time` | Time instance |
| `entityCollection` | Entity collection |
| `eventCollection` | Event collection |
| `relation` | Relation between objects |
| `annotation` | Bounding box sequence annotation |
| `video` | Video metadata |
| `metadata` | Export metadata (timestamp, version) |

### Bounding Box Sequence Format

Annotations export with this structure:

```json
{
  "type": "annotation",
  "data": {
    "id": "ann-seq-1",
    "videoId": "vid-1",
    "personaId": "persona-1",
    "annotationType": "type",
    "typeCategory": "entity",
    "typeId": "entity-type-5",
    "boundingBoxSequence": {
      "boxes": [
        {"x":100,"y":100,"width":50,"height":80,"frameNumber":0,"isKeyframe":true},
        {"x":150,"y":105,"width":52,"height":82,"frameNumber":10,"isKeyframe":true},
        {"x":200,"y":110,"width":54,"height":84,"frameNumber":20,"isKeyframe":true}
      ],
      "interpolationSegments": [
        {"startFrame":0,"endFrame":10,"type":"linear"},
        {"startFrame":10,"endFrame":20,"type":"bezier","controlPoints":{...}}
      ],
      "visibilityRanges": [
        {"startFrame":0,"endFrame":20,"visible":true}
      ],
      "trackId": "track-42",
      "trackingSource": "samurai",
      "trackingConfidence": 0.95,
      "totalFrames": 21,
      "keyframeCount": 3,
      "interpolatedFrameCount": 18
    }
  }
}
```

### Metadata Section

The last line is always metadata:

```json
{
  "type": "metadata",
  "data": {
    "exportDate": "2025-01-15T10:30:00Z",
    "exportVersion": "1.0.0",
    "exportedBy": "user-123",
    "foveaVersion": "0.1.0",
    "annotationCount": 234,
    "sequenceCount": 234,
    "keyframeCount": 892
  }
}
```

## Common Export Scenarios

### Scenario 1: Backup All Data

**Goal**: Create a complete backup for disaster recovery.

**Steps**:
1. Open export dialog
2. Leave all options at default
3. Select **Keyframes-only** mode
4. Click Export
5. Store file in backup location

**Expected file size**: 2-10 MB for typical project.

### Scenario 2: Share Work with Collaborator

**Goal**: Send annotations for a specific video to another annotator.

**Steps**:
1. Open export dialog
2. Uncheck all videos except the one to share
3. Select **Keyframes-only** mode
4. Click Export
5. Send file via email or file sharing

**Expected file size**: 100-500 KB per video.

### Scenario 3: Export for External Tool

**Goal**: Use FOVEA annotations in another annotation tool or evaluation script.

**Steps**:
1. Open export dialog
2. Select **Fully interpolated** mode
3. Filter to specific videos if needed
4. Click Export
5. Convert JSON Lines to external tool's format (write a conversion script)

**Expected file size**: 50-200 MB per video.

### Scenario 4: Export Single Persona

**Goal**: Share only your persona's annotations, not others'.

**Steps**:
1. Open export dialog
2. Uncheck all personas except yours
3. Select **Keyframes-only** mode
4. Click Export

**Expected file size**: Proportional to your annotation count.

## Export Best Practices

### 1. Use Keyframes-Only by Default

Unless you specifically need fully interpolated frames, always use keyframes-only mode:

- 50x smaller files
- Faster exports
- Preserves user intent
- Easier to review and edit

### 2. Export Regularly

Create periodic backups:

- Daily exports during active annotation
- Weekly exports for long-term projects
- Before major changes (ontology restructuring, bulk edits)

### 3. Name Files Descriptively

Use descriptive filenames:

```
fovea-export-2025-01-15-baseball-game.jsonl
fovea-export-persona-sports-analyst.jsonl
fovea-backup-2025-01-15-v1.jsonl
```

### 4. Verify Exports

Always check the first few lines of the export file:

```bash
head -n 10 fovea-export.jsonl
```

Ensure personas, ontologies, and annotations are present.

### 5. Store Exports Safely

- Use version control (Git LFS for large files)
- Cloud storage (Google Drive, Dropbox, S3)
- Local backups (external drive)
- Multiple locations for important data

## Troubleshooting

### Export Button Disabled

**Problem**: Export button is grayed out.

**Solutions**:
- Ensure you have at least one annotation
- Check that you're logged in (if authentication is enabled)
- Try refreshing the page

### Export Takes Too Long

**Problem**: Export process hangs or takes >5 minutes.

**Solutions**:
- Reduce the number of annotations (filter by video or persona)
- Use keyframes-only mode instead of fully interpolated
- Check browser console for errors
- Try exporting in smaller batches

### File Size Too Large

**Problem**: Export file is >500 MB and difficult to share.

**Solutions**:
- Use keyframes-only mode
- Export one video at a time
- Export one persona at a time
- Compress the file with gzip: `gzip fovea-export.jsonl`

### Export File Won't Open

**Problem**: File appears corrupted or won't parse.

**Solutions**:
- Verify file is complete (check metadata line at end)
- Try opening in a different text editor
- Check for network interruption during download
- Re-export with smaller dataset

### Missing Annotations in Export

**Problem**: Some annotations don't appear in the export.

**Solutions**:
- Check filters (might have excluded that persona/video)
- Verify annotations were saved (click Save in annotation panel)
- Check that annotations have valid bounding box sequences
- Try exporting without filters to see all data

## Next Steps

- [Importing Annotations](./importing-data.md): Import exported files
- [Bounding Box Sequences](../annotation/bounding-box-sequences.md): Create annotations to export
- [Automated Tracking](../annotation/automated-tracking.md): Generate annotations efficiently
- [Data Model Reference](../../reference/data-model.md): Understand the export format
