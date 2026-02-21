---
title: Autosave System
sidebar_position: 7
---

# Autosave System

Fovea includes a generic autosave system that automatically persists data changes with debouncing, retry logic, and visual status feedback.

## Overview

The autosave system provides:

- Debounced saves on data changes (default: 1 second)
- Periodic backup saves (default: every 30 seconds)
- Retry logic with exponential backoff (1s, 2s, 4s)
- Automatic save on page visibility change (tab hidden)
- Automatic save attempt before page unload
- Visual status indicator component
- OpenTelemetry tracing for observability

## Architecture

```
Data Change -> Debounce Timer -> Save Attempt -> Success/Retry/Fail
                    |                              |
                    v                              v
              Periodic Timer                 Status Update
                    |                              |
                    v                              v
              Backup Save                  UI Indicator
```

## Core Hook: useAutoSave

The `useAutoSave` hook provides all autosave functionality:

```typescript
import { useAutoSave } from '@hooks/data'

function AnnotationEditor({ videoId, annotations }) {
  const { saveStatus, lastSavedAt, pendingChanges, forceSave } = useAutoSave({
    data: annotations,
    isEnabled: true,
    onSave: async (data) => {
      await api.saveAnnotations(videoId, data)
    },
    entityType: 'annotation',
    entityId: videoId,
  })

  return (
    <div>
      <SaveStatusIndicator
        status={saveStatus}
        lastSavedAt={lastSavedAt}
        errorMessage={null}
        retryCount={0}
        onRetry={forceSave}
      />
      {/* editor content */}
    </div>
  )
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `data` | `T` | (required) | Data to auto-save |
| `isEnabled` | `boolean` | (required) | Whether autosave is active |
| `onSave` | `(data: T) => Promise<void>` | (required) | Save function |
| `debounceMs` | `number` | `1000` | Debounce delay in milliseconds |
| `periodicMs` | `number` | `30000` | Periodic backup interval |
| `maxRetries` | `number` | `3` | Maximum retry attempts |
| `entityType` | `AutoSaveEntityType` | (required) | Entity type for tracing |
| `entityId` | `string` | (optional) | Entity ID for tracing context |

### Return Values

| Property | Type | Description |
|----------|------|-------------|
| `saveStatus` | `SaveStatus` | Current save status |
| `lastSavedAt` | `Date \| null` | Timestamp of last successful save |
| `pendingChanges` | `boolean` | Whether unsaved changes exist |
| `errorMessage` | `string \| null` | Error message if save failed |
| `retryCount` | `number` | Current retry attempt count |
| `forceSave` | `() => Promise<void>` | Force immediate save |

### Save Status States

| Status | Description |
|--------|-------------|
| `idle` | No save in progress, no pending changes |
| `saving` | Save operation in progress |
| `saved` | Save completed successfully |
| `error` | Save failed after all retries |
| `retrying` | Retrying after a failed save |

### Entity Types

The `entityType` parameter is used for observability tracing:

| Entity Type | Description |
|-------------|-------------|
| `annotation` | Bounding box annotations |
| `persona` | Persona definitions |
| `ontology` | Ontology types (entities, events, roles) |
| `summary` | Video summaries |
| `claim` | Summary claims |
| `world-object` | World state objects |

## Save Triggers

### Debounced Save

When data changes, a debounced save triggers after the configured delay:

```typescript
// Data changes trigger debounced save
useEffect(() => {
  if (!isEnabled) return

  const serialized = JSON.stringify(data)
  if (serialized !== lastSavedDataRef.current) {
    setPendingChanges(true)
  }

  debounceTimerRef.current = setTimeout(() => {
    performSave()
  }, debounceMs)
}, [data, isEnabled, debounceMs])
```

### Periodic Backup

A periodic backup runs at the configured interval if changes are pending:

```typescript
periodicTimerRef.current = setInterval(() => {
  if (pendingChanges && !saveInProgressRef.current) {
    performSave()
  }
}, periodicMs)
```

### Visibility Change

When the tab becomes hidden, pending changes are saved:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && pendingChanges) {
    performSave()
  }
})
```

### Page Unload

Before page unload, the system attempts to save and shows a browser warning:

```typescript
window.addEventListener('beforeunload', (e) => {
  if (pendingChanges) {
    performSave()
    e.preventDefault()
    e.returnValue = ''  // Shows browser warning
  }
})
```

## Retry Logic

Failed saves retry with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1st retry | 1 second |
| 2nd retry | 2 seconds |
| 3rd retry | 4 seconds |
| After max retries | Status set to `error` |

```typescript
// Exponential backoff: 2^attempt * 1000ms
const delay = Math.pow(2, attempt) * 1000
setTimeout(() => performSave(attempt + 1), delay)
```

### Auth Error Handling

Authentication errors (401) do not trigger retries:

```typescript
const isAuthError =
  err.message.includes('401') ||
  err.message.includes('Unauthorized') ||
  err.message.includes('Session expired')

if (isAuthError) {
  setSaveStatus('error')
  setErrorMessage('Session expired. Please log in again.')
  // No retry
}
```

## SaveStatusIndicator Component

The `SaveStatusIndicator` component displays visual feedback:

```tsx
import { SaveStatusIndicator } from '@hooks/data'

<SaveStatusIndicator
  status={saveStatus}
  lastSavedAt={lastSavedAt}
  errorMessage={errorMessage}
  retryCount={retryCount}
  maxRetries={3}
  onRetry={forceSave}
  compact={false}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `status` | `SaveStatus` | (required) | Current save status |
| `lastSavedAt` | `Date \| null` | (required) | Last save timestamp |
| `errorMessage` | `string \| null` | (required) | Error message |
| `retryCount` | `number` | (required) | Current retry count |
| `maxRetries` | `number` | `3` | Maximum retries |
| `onRetry` | `() => void` | (optional) | Manual retry callback |
| `compact` | `boolean` | `false` | Use compact (icon-only) mode |

### Display States

| Status | Full Mode | Compact Mode |
|--------|-----------|--------------|
| `idle` | Hidden | Hidden |
| `saving` | Spinner + "Saving..." | Spinner |
| `saved` | Checkmark + "Saved at 2:30 PM" | Checkmark |
| `error` | Error icon + "Save failed" + Retry button | Error icon with tooltip |
| `retrying` | Spinner + "Retrying (2/3)..." | Spinner with tooltip |

## Notification Store

For global notifications, use the notification store:

```typescript
import { useNotificationStore } from '@store/zustand/notificationStore'

function MyComponent() {
  const addNotification = useNotificationStore(state => state.addNotification)

  const handleSaveError = () => {
    addNotification({
      type: 'error',
      message: 'Failed to save changes',
      autoHide: true,  // Auto-dismiss after 5 seconds
    })
  }
}
```

### Notification Types

| Type | Use Case |
|------|----------|
| `success` | Operation completed successfully |
| `error` | Operation failed |
| `warning` | Non-critical issue |
| `info` | Informational message |

## Usage Examples

### Annotations Autosave

```typescript
function AnnotationCanvas({ videoId }) {
  const [annotations, setAnnotations] = useState([])

  const { saveStatus, lastSavedAt, errorMessage, retryCount, forceSave } = useAutoSave({
    data: annotations,
    isEnabled: annotations.length > 0,
    onSave: async (data) => {
      await api.post(`/api/videos/${videoId}/annotations`, data)
    },
    entityType: 'annotation',
    entityId: videoId,
    debounceMs: 500,  // Fast save for annotations
  })

  return (
    <>
      <SaveStatusIndicator
        status={saveStatus}
        lastSavedAt={lastSavedAt}
        errorMessage={errorMessage}
        retryCount={retryCount}
        onRetry={forceSave}
      />
      <Canvas annotations={annotations} onChange={setAnnotations} />
    </>
  )
}
```

### Persona Autosave

```typescript
function PersonaEditor({ persona, onUpdate }) {
  const [formData, setFormData] = useState(persona)

  const { saveStatus } = useAutoSave({
    data: formData,
    isEnabled: true,
    onSave: async (data) => {
      await api.put(`/api/personas/${persona.id}`, data)
      onUpdate(data)
    },
    entityType: 'persona',
    entityId: persona.id,
    debounceMs: 2000,  // Slower save for text editing
  })

  return (
    <form>
      <input
        value={formData.name}
        onChange={e => setFormData({ ...formData, name: e.target.value })}
      />
      <SaveStatusIndicator status={saveStatus} compact />
    </form>
  )
}
```

### Ontology Autosave

```typescript
function OntologyEditor({ personaId }) {
  const [ontology, setOntology] = useState(null)

  const { saveStatus, forceSave } = useAutoSave({
    data: ontology,
    isEnabled: ontology !== null,
    onSave: async (data) => {
      await api.put(`/api/personas/${personaId}/ontology`, data)
    },
    entityType: 'ontology',
    entityId: personaId,
  })

  // Force save before navigation
  useEffect(() => {
    return () => {
      if (saveStatus === 'saving' || saveStatus === 'retrying') {
        forceSave()
      }
    }
  }, [saveStatus, forceSave])

  return (/* editor UI */)
}
```

## Telemetry

Autosave operations are traced with OpenTelemetry:

```typescript
await withSpan(
  `${entityType}-autosave`,
  { entityId: entityId || 'unknown', entityType },
  async (span) => {
    await onSave(currentData)
    span.setAttribute('save_success', true)
    span.setAttribute('retry_count', attempt)
  }
)
```

Trace attributes:

| Attribute | Description |
|-----------|-------------|
| `entityId` | ID of the entity being saved |
| `entityType` | Type of entity |
| `save_success` | Whether save succeeded |
| `retry_count` | Number of retries |

## Testing

### Unit Testing useAutoSave

```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAutoSave } from '@hooks/data/useAutoSave'

describe('useAutoSave', () => {
  it('saves data after debounce', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)

    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({
        data,
        isEnabled: true,
        onSave,
        entityType: 'annotation',
        debounceMs: 100,
      }),
      { initialProps: { data: { value: 1 } } }
    )

    rerender({ data: { value: 2 } })

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ value: 2 })
    })
  })

  it('retries on failure', async () => {
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useAutoSave({
      data: { value: 1 },
      isEnabled: true,
      onSave,
      entityType: 'annotation',
      debounceMs: 0,
    }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(2)
      expect(result.current.saveStatus).toBe('saved')
    })
  })
})
```

## Troubleshooting

### Data Not Saving

1. Check `isEnabled` is `true`
2. Verify `data` object reference changes (use spread operator)
3. Check network requests in DevTools
4. Look for errors in console

### Too Many Save Requests

Increase `debounceMs` for frequently changing data:

```typescript
useAutoSave({
  data: frequentlyChangingData,
  debounceMs: 2000,  // 2 second debounce
  // ...
})
```

### Saves Lost on Navigation

Use `forceSave` in cleanup:

```typescript
useEffect(() => {
  return () => {
    forceSave()
  }
}, [forceSave])
```

Or use React Router's `useBlocker` for navigation confirmation.

## Related Documentation

- [Session Management](../concepts/session-management.md)
- [Frontend Development](./frontend-dev.md)
