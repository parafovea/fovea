---
title: Importing Annotations
sidebar_position: 2
---

# Importing Annotations

FOVEA can import annotations, ontologies, and world state from JSON Lines files. This guide covers the import process, conflict resolution, and common workflows.

## Quick Import

For a simple import with no conflicts:

1. **Click the Import button** in the toolbar
2. **Drag and drop** a JSON Lines file or click to browse
3. **Click "Import"** (uses default settings)
4. Wait for the import to complete

If there are no conflicts, all data imports successfully.

## Import Dialog Overview

The import dialog has three stages:

1. **File Upload**: Select the file to import
2. **Preview and Conflict Detection**: Review what will be imported
3. **Import Execution**: Process the file and show results

## Step 1: Upload File

### Drag and Drop

The easiest way to upload:

1. Open the import dialog (click Import button in toolbar)
2. Drag a JSON Lines file from your file manager
3. Drop it in the upload area
4. The file begins analyzing

### Click to Browse

Alternative upload method:

1. Click the upload area
2. File browser opens
3. Select a `.jsonl` file
4. Click Open
5. The file begins analyzing

### Supported File Format

FOVEA imports files in JSON Lines format:

- **File extension**: `.jsonl`
- **Format**: One JSON object per line
- **Structure**: Each line has `type` and `data` fields

Files exported from FOVEA are already in the correct format.

## Step 2: Review Import Preview

After uploading, the system analyzes the file and shows:

```
┌─ Import Preview ──────────────────────────────────┐
│ File: fovea-export-2025-01-15.jsonl               │
│ Size: 2.8 MB                                      │
│                                                   │
│ Contents:                                         │
│   Personas:              3                        │
│   Ontologies:            3                        │
│   Entities:             45                        │
│   Events:               12                        │
│   Annotations:         234                        │
│     Sequences:         234                        │
│     Keyframes:         892                        │
│                                                   │
│ ⚠️ Conflicts Detected (2)                         │
│   ├─ Persona "Sports Analyst" already exists      │
│   └─ 5 sequence annotations have overlapping IDs  │
└───────────────────────────────────────────────────┘
```

### Preview Information

The preview shows:
- File name and size
- Count of each data type
- Detected conflicts (if any)
- Warnings about potential issues

## Step 3: Configure Conflict Resolution

When conflicts are detected, you must choose how to handle them.

### Conflict Types

#### Duplicate Personas

**Problem**: Persona with the same ID already exists in your database.

**Resolution Options**:
- **Skip**: Keep existing persona, don't import the file's version
- **Replace**: Delete existing, import file's version
- **Merge**: Combine ontologies (merge entity types, event types)
- **Rename**: Import with a new ID (becomes a separate persona)

**Recommended**: `Skip` to preserve existing work.

#### Duplicate World Objects

**Problem**: Entity, event, or time with the same ID already exists.

**Resolution Options**:
- **Skip**: Keep existing object
- **Replace**: Replace with imported version
- **Merge Assignments**: Combine type assignments from both

**Recommended**: `Skip` to preserve existing world state.

#### Duplicate Sequence IDs

**Problem**: Annotation with the same ID already exists.

**Resolution Options**:
- **Skip**: Keep existing annotation
- **Replace**: Replace with imported annotation
- **Merge Keyframes**: Combine keyframes from both sequences
- **Create New**: Import with a new ID (becomes separate annotation)

**Recommended**: `Skip` unless you know you want to replace.

#### Overlapping Frame Ranges

**Problem**: Two sequences for the same object cover overlapping frames.

**Resolution Options**:
- **Split Ranges**: Create separate sequences for non-overlapping portions
- **Extend Range**: Merge into one long sequence
- **Replace Overlap**: Keep imported frames, discard existing frames
- **Fail Import**: Abort if overlaps detected

**Recommended**: `Fail Import` to manually review before importing.

#### Interpolation Conflicts

**Problem**: Sequence has same keyframes but different interpolation config.

**Resolution Options**:
- **Use Imported**: Apply interpolation settings from file
- **Use Existing**: Keep current interpolation settings
- **Fail Import**: Abort if interpolation differs

**Recommended**: `Use Imported` to match the exported intent.

### Conflict Resolution UI

For each conflict type, select your preferred resolution:

```
┌─ Conflict Resolution ──────────────────────────────┐
│ Duplicate Sequences:                               │
│   ● Skip (recommended)                             │
│   ○ Replace                                        │
│   ○ Merge Keyframes                                │
│   ○ Create New                                     │
│                                                     │
│ Overlapping Frame Ranges:                          │
│   ● Fail Import (recommended)                      │
│   ○ Split Ranges                                   │
│   ○ Extend Range                                   │
│   ○ Replace Overlap                                │
└─────────────────────────────────────────────────────┘
```

## Step 4: Configure Import Options

### What to Import

Choose which data categories to import:

| Option | Imports | Use Case |
|--------|---------|----------|
| **Import Personas** | Personas and ontologies | Sharing ontologies between projects |
| **Import World State** | Entities, events, times, collections | Populating world model |
| **Import Annotations** | Bounding box sequences | Primary use case |

Uncheck categories you don't need.

### Validation Options

Control how strictly to validate the import:

**Strict Mode**:
- Validates all references before importing
- Fails if any annotation references missing entities
- Fails if any type assignment references missing types
- **Use for**: Production imports where data integrity is critical

**Lenient Mode** (default):
- Best-effort import
- Skips items with errors
- Continues with valid items
- **Use for**: Importing partial data or experimental imports

**Validate References**:
- Checks that all entity/event/time references exist
- Checks that all type assignments reference valid types
- Reports missing references as warnings

**Validate Sequence Integrity**:
- Checks that sequences have valid keyframes
- Validates interpolation configurations
- Verifies visibility ranges don't overlap
- **Recommended**: Always enabled

**Recompute Interpolation**:
- Recalculates all interpolated frames on import
- Useful if interpolation algorithm changed
- Slower but ensures consistency
- **Use for**: Importing old exports or debugging interpolation

## Step 5: Execute Import

Once you've configured conflicts and options:

1. **Click "Import" button**
2. Progress indicator appears
3. System processes each line
4. Results dialog appears when done

### Import Progress

During import, you see:

```
Importing...
Processed: 450 / 500 lines (90%)
├─ Personas: 3 imported
├─ Entities: 45 imported
├─ Annotations: 210 imported
└─ Skipped: 5 items
```

## Step 6: Review Import Results

After import completes, the results dialog shows:

```
┌─ Import Results ──────────────────────────────────┐
│ ✅ Import Successful                              │
│                                                    │
│ Imported:                                          │
│   Personas:              3                         │
│   Entities:             45                         │
│   Events:               12                         │
│   Annotations:         229                         │
│     Total Keyframes:   842                         │
│                                                    │
│ Skipped:                                           │
│   Annotations:           5 (duplicate IDs)         │
│                                                    │
│ Warnings:                                          │
│   Line 234: Missing entity reference (skipped)    │
│   Line 456: Invalid interpolation type (skipped)  │
└─────────────────────────────────────────────────────┘
```

### Success Indicators

- ✅ Green checkmark: Import succeeded
- Summary of items imported
- Count of keyframes for sequence validation
- Performance: Import time and items per second

### Skipped Items

Items skipped due to conflicts or errors:

- Lists count of skipped items by type
- Shows reason for each skip (duplicate ID, missing reference)
- Skipped items do not affect imported data

### Warnings

Non-fatal issues encountered:

- Line number where warning occurred
- Description of the issue
- Action taken (usually "skipped")

### Errors

Fatal issues that stopped import:

- Only shown if import fails completely
- Line number and error description
- Suggested fixes

## Common Import Scenarios

### Scenario 1: Import from Collaborator

**Goal**: Import annotations that a colleague exported.

**Steps**:
1. Upload their export file
2. Review conflicts (likely personas and world objects)
3. Set conflict resolution:
   - Personas: `Skip` (use your existing personas)
   - World Objects: `Skip` (preserve your world state)
   - Sequences: `Create New` (import as separate annotations)
4. Uncheck "Import Personas" and "Import World State"
5. Check only "Import Annotations"
6. Click Import

**Expected result**: Their annotations import linked to your existing personas/objects.

### Scenario 2: Restore from Backup

**Goal**: Restore data after accidental deletion or system failure.

**Steps**:
1. Upload backup export file
2. Review conflicts (everything likely exists)
3. Set conflict resolution:
   - All types: `Replace` (restore from backup)
4. Enable "Strict Mode" to ensure consistency
5. Click Import

**Expected result**: Database restored to backup state.

### Scenario 3: Merge Two Projects

**Goal**: Combine annotations from two separate FOVEA projects.

**Steps**:
1. Export from Project A
2. Import into Project B
3. Set conflict resolution:
   - Personas: `Merge` (combine ontologies)
   - World Objects: `Merge Assignments` (combine type assignments)
   - Sequences: `Create New` (keep both sets of annotations)
4. Enable "Validate References"
5. Click Import

**Expected result**: Combined project with merged ontologies.

### Scenario 4: Import Partial Data

**Goal**: Import only entities from a file, not annotations.

**Steps**:
1. Upload export file
2. Uncheck "Import Annotations"
3. Check only "Import World State"
4. Set conflict resolution for world objects: `Skip`
5. Click Import

**Expected result**: New entities imported, annotations skipped.

## Advanced: Sequence Import Validation

When importing bounding box sequences, the system validates:

### Keyframe Validation

- **Minimum keyframes**: Sequences must have at least 1 keyframe
- **Sorted order**: Keyframes must be in ascending frame order
- **Unique frames**: No duplicate keyframes on the same frame

### Interpolation Validation

- **Supported types**: Only linear, bezier, ease-in, ease-out, ease-in-out, hold, parametric
- **Segment coverage**: Interpolation segments must cover entire sequence
- **No gaps**: No missing frames between interpolation segments

### Visibility Validation

- **No overlaps**: Visibility ranges cannot overlap
- **Keyframes in visible ranges**: All keyframes must be in visible ranges

### Bounding Box Validation

- **Within bounds**: All boxes must be inside video frame
- **Positive dimensions**: Width and height must be > 0
- **Frame numbers**: Frame numbers must be >= 0

If validation fails, the sequence is skipped with an error message.

## Troubleshooting

### Import Fails Immediately

**Problem**: Import fails right after clicking Import button.

**Solutions**:
- Check that file is valid JSON Lines format
- Verify file is not corrupted (try opening in text editor)
- Ensure file size is reasonable (under 500 MB)
- Try importing a smaller file first to test

### Too Many Conflicts Detected

**Problem**: Hundreds of conflicts make it difficult to proceed.

**Solutions**:
- Export and import one persona at a time
- Use "Skip" for all conflict types to avoid replacing data
- Import world state first, then annotations separately

### Sequences Won't Import

**Problem**: All sequences are skipped during import.

**Solutions**:
- Enable "Validate Sequence Integrity" to see specific errors
- Check that sequences have valid keyframes (at least 1)
- Verify interpolation types are supported
- Check that bounding boxes are within video bounds

### Import is Very Slow

**Problem**: Import takes >5 minutes for a small file.

**Solutions**:
- Disable "Recompute Interpolation" (saves time)
- Import without validation first, then validate separately
- Check backend logs for errors slowing processing
- Split large files into smaller batches

### Missing Data After Import

**Problem**: Some items didn't import but no errors shown.

**Solutions**:
- Check "Skipped Items" in results dialog
- Review warnings for clues
- Verify conflict resolution settings didn't skip desired items
- Check that "Import [Category]" checkbox was enabled

## Import History

FOVEA tracks all imports in the import history:

### View Import History

1. Click "Import History" button in import dialog
2. See list of past imports:

```
Import History
─────────────────────────────────────────────────────
2025-01-15 10:30 AM - fovea-export.jsonl
  ✅ Success | 234 annotations | 45 entities

2025-01-14 03:15 PM - backup-2025-01-14.jsonl
  ✅ Success | 100 annotations | 20 entities

2025-01-13 11:00 AM - collaborator-export.jsonl
  ⚠️ Partial | 50 annotations | 5 skipped
```

### Import History Details

Click an import to see:
- Full file name and import date
- Success/failure status
- Items imported by category
- Items skipped and why
- Warnings and errors
- Conflict resolution settings used

This helps you audit what was imported and troubleshoot issues.

## Best Practices

### 1. Test Imports on Small Files

Before importing a large file:

1. Export a small subset (one video, one persona)
2. Import it with your desired settings
3. Verify results
4. Then import the full file

### 2. Use Lenient Mode for Exploratory Imports

When experimenting or importing from external sources:

- Use lenient mode
- Disable "Validate References"
- Review warnings afterward
- Clean up skipped items manually

### 3. Use Strict Mode for Production

For critical imports (backups, production data):

- Enable strict mode
- Enable all validation
- Set conflicts to "Fail Import"
- Review preview carefully before importing

### 4. Keep Import History

Don't delete import history entries:

- Useful for auditing what data came from where
- Helps troubleshoot issues later
- Shows when data was last updated

### 5. Backup Before Large Imports

Before importing data that might conflict:

1. Export your current data as a backup
2. Perform the import
3. Verify results
4. Restore from backup if needed

## Next Steps

- [Exporting Annotations](./exporting-data.md): Create files to import
- [Bounding Box Sequences](../annotation/bounding-box-sequences.md): Create annotations to import
- [Data Model Reference](../../reference/data-model.md): Understand the import format
- [API Reference](../../api-reference/overview.md): Automate imports via API
