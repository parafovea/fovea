# Data persistence hooks

## When to use `useAutoSave`

Two cases qualify:

1. **No Save button exists.** The user can't trigger a save themselves, so the system has to. Example: `AnnotationWorkspace` — bounding boxes and keyframes are created with the mouse; there is nowhere for a Save button to live in the editing flow.
2. **Long-form free-text editing where losing work is painful**, even if a Save button also exists. Example: `VideoSummaryEditor` — the summary editor is doc-like; users can spend many minutes typing before they'd think to click Save, and a tab close midway through would discard real work.

A Save button alone does *not* disqualify autosave (case 2). The disqualifier is "discrete record form with structured fields" — where partial state is meaningless and the Save button is the natural commit point.

Do not extend the `AutoSaveEntityType` union without showing the new surface fits one of the two cases above.

## When to use explicit save + `useUnsavedChangesPrompt`

Everything else. Discrete record forms (personas, world objects, ontology types, claims) use a Save button and call `useUnsavedChangesPrompt` to warn before discarding dirty state.

Pattern:

```tsx
const isDirty = open && (
  record
    ? formField !== record.field /* … */
    : !!formField /* … */
)

const { confirmDiscard } = useUnsavedChangesPrompt({ isDirty })

const handleCancel = () => {
  if (!confirmDiscard()) return
  onClose()
}

const handleSave = async () => {
  // mutation
  onClose()
}
```

`confirmDiscard()` returns `true` when the form is clean or the user confirmed; `false` if they cancelled. The hook also installs a `beforeunload` listener so a tab close / reload triggers the browser's native prompt while dirty.

## Why this split

A previous iteration applied `useAutoSave` to discrete record forms. That created two failure modes:

1. **Auto-create-on-keystroke.** Forms would create a row on the first character typed, then delete it if the user clicked Cancel. A network blip during cancel left orphaned rows; tests could not deterministically observe "saved."
2. **Three save paths per dialog.** Autosave + Save button + `forceSave` on close all wrote the same record, so there was no single observable "saved" moment. Tests had to race three timers.

Explicit save + dirty prompt restores a single save path and a single observable moment, while still protecting against accidental discard.
