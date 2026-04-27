---
title: Autosave and explicit save
sidebar_position: 7
---

# Autosave and explicit save

Fovea applies autosave selectively. Most surfaces use an explicit Save button paired with a dirty-state warning; only two surfaces autosave.

The canonical write-up lives next to the code at `annotation-tool/src/hooks/data/README.md`. This page summarizes the rule and the rationale.

## When to use `useAutoSave`

Two cases qualify:

1. **No Save button exists.** The user cannot trigger a save themselves, so the system does. The annotation workspace is the example: bounding boxes and keyframes are created with the mouse and there is no natural place for a Save button in the editing flow.
2. **Long-form free-text editing where losing work is painful.** Even if a Save button also exists, surfaces like the video summary editor autosave because users can spend many minutes typing before they would think to click Save.

A Save button on its own does not disqualify autosave (case 2). The disqualifier is "discrete record form with structured fields", where partial state is meaningless and the Save button is the natural commit point.

The `AutoSaveEntityType` union enumerates exactly the surfaces that qualify (annotations and video summary). New surfaces are added only when they fit one of these cases.

## When to use explicit save

Everything else. Discrete record forms (personas, world objects, ontology types, claims, inference preferences, system config) use a Save button and call `useUnsavedChangesPrompt` to warn before discarding dirty state.

```tsx
const isDirty = open && (
  record
    ? formField !== record.field
    : !!formField
)

const { confirmDiscard } = useUnsavedChangesPrompt({ isDirty })

const handleCancel = () => {
  if (!confirmDiscard()) return
  onClose()
}
```

`confirmDiscard()` returns `true` when the form is clean or the user confirmed; `false` if they cancelled. The hook also installs a `beforeunload` listener so a tab close or reload triggers the browser's native prompt while the form is dirty.

## Rationale

A previous iteration applied `useAutoSave` to discrete record forms. That created two failure modes:

1. **Auto-create on keystroke.** Forms created a row on the first character typed and deleted it if the user clicked Cancel. A network blip during cancel left orphaned rows; tests could not deterministically observe a "saved" moment.
2. **Three save paths per dialog.** Autosave + the Save button + `forceSave` on close all wrote the same record, so there was no single observable saved moment. Tests had to race three timers.

Explicit save plus a dirty prompt restores a single save path and a single observable moment, while still protecting against accidental discard.

## Hooks

- `useAutoSave` (in `annotation-tool/src/hooks/data/useAutoSave.ts`): debounced save with retry, periodic backup, visibility-change save, and OpenTelemetry tracing. Used by the annotation workspace and the video summary editor.
- `useUnsavedChangesPrompt` (in `annotation-tool/src/hooks/data/useUnsavedChangesPrompt.ts`): `confirmDiscard()` plus a `beforeunload` listener.
- `useAutoSaveAnnotations` (in `annotation-tool/src/hooks/data/useAutoSaveAnnotations.ts`): annotation-specific wrapper that batches keyframe writes.

## Related

- `annotation-tool/src/hooks/data/README.md` (canonical, in-repo)
- [Inference preferences](../user-guides/admin/inference-preferences.md) (uses explicit save)
