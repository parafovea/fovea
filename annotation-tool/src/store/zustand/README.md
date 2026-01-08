# State Management Strategy

This document describes the state management approach for FOVEA's annotation tool frontend.

## Overview

FOVEA uses a **two-layer state management strategy** to optimize for different types of state:

| State Type | Solution | Use Case | Location |
|------------|----------|----------|----------|
| **UI State** | Zustand | Ephemeral, local UI interactions | `src/store/zustand/*.ts` |
| **Server State** | TanStack Query | Data from API (caching, refetching) | `src/store/queries/*.ts` |

> **Note:** Redux has been fully removed from the codebase. All state is now managed by Zustand (UI) and TanStack Query (server).

## Architecture Decision

### Why Multiple Solutions?

Different types of state have different requirements. Using specialized tools for each type results in:
- **Less boilerplate** (70% reduction vs Redux-only)
- **Better performance** (automatic caching, selective re-renders)
- **Simpler mental model** (each tool does one thing well)
- **Easier testing** (isolated concerns)

### State Type Definitions

#### 1. UI State (Zustand)

**Definition:** Ephemeral state that exists only in the browser and doesn't need to persist to the backend.

**Examples:**
- Drawing mode (entity/role/event)
- Selected annotation in workspace
- Dialog open/close state
- Timeline zoom level
- Temporary bounding box while drawing
- Visibility toggles (show/hide overlays)

**Why Zustand?**
- Minimal boilerplate (no actions/reducers)
- No Provider wrapper needed
- Fast (only re-renders components that use changed state)
- Great DevTools integration
- Easy to test

#### 2. Server State (TanStack Query)

**Definition:** Data that comes from the backend API and needs caching, refetching, and synchronization.

**Examples:**
- Annotations fetched from API
- Video metadata
- Detection results from model service
- Persona definitions
- Ontology data

**Why TanStack Query?**
- Automatic caching (reduce API calls)
- Automatic background refetching
- Optimistic updates built-in
- Loading/error states handled automatically
- Cache invalidation on mutations
- Eliminates need for Redux data slices

#### 3. Authentication State (Zustand)

**Definition:** User authentication and session state.

**Examples:**
- Current user information
- Authentication status
- Login/logout actions

**Location:** `src/store/zustand/authStore.ts`

---

## Available Stores

### 1. Annotation UI Store (`annotationUiStore.ts`)

Manages all UI state for the annotation workspace.

**State:**
- Drawing state (isDrawing, drawingMode, temporaryBox)
- Selection state (selectedAnnotation, selectedTypeId, selectedKeyframes)
- Mode state (annotationMode, interpolationMode)
- Link state (linkTargetId, linkTargetType)
- Detection UI state (showDetectionCandidates, detectionQuery, threshold)
- Tracking UI state (showTrackingResults, previewedTrackId)
- Timeline UI state (showMotionPath, timelineZoom, currentFrame)

**Usage:**
```typescript
import { useAnnotationUiStore } from '@/stores/annotationUiStore'

function DrawingCanvas() {
  // Select only the state you need (prevents unnecessary re-renders)
  const isDrawing = useAnnotationUiStore(state => state.isDrawing)
  const setIsDrawing = useAnnotationUiStore(state => state.setIsDrawing)

  const handleMouseDown = () => setIsDrawing(true)
  // ...
}
```

**Testing:**
```typescript
import { useAnnotationUiStore } from '@/stores/annotationUiStore'

it('should handle drawing', () => {
  const { setIsDrawing, isDrawing } = useAnnotationUiStore.getState()
  setIsDrawing(true)
  expect(useAnnotationUiStore.getState().isDrawing).toBe(true)
})
```

### 2. Dialog Store (`dialogStore.ts`)

Centralized management for all application dialogs.

**State:**
- Dialog open/close state for all 20+ dialogs
- Methods to open, close, toggle dialogs
- Utilities to check if any dialog is open

**Usage:**
```typescript
import { useDialogStore, useDialog } from '@/stores/dialogStore'

// Option 1: Using the store directly
function SettingsButton() {
  const openDialog = useDialogStore(state => state.openDialog)
  return <Button onClick={() => openDialog('userSettings')}>Settings</Button>
}

function UserSettingsDialog() {
  const open = useDialogStore(state => state.dialogs.userSettings)
  const closeDialog = useDialogStore(state => state.closeDialog)

  return (
    <Dialog open={open} onClose={() => closeDialog('userSettings')}>
      {/* dialog content */}
    </Dialog>
  )
}

// Option 2: Using the convenience hook (recommended)
function UserSettingsDialog() {
  const { open, close } = useDialog('userSettings')

  return (
    <Dialog open={open} onClose={close}>
      {/* dialog content */}
    </Dialog>
  )
}
```

**Benefits:**
- No more prop drilling of `open` and `onClose`
- Open dialogs from anywhere (e.g., keyboard shortcuts)
- Track which dialog is open for analytics
- Close all dialogs at once

---

## Migration Guide

### Migrating from Redux to Zustand

#### Before (Redux):
```typescript
// Redux slice
const annotationSlice = createSlice({
  name: 'annotations',
  initialState: {
    isDrawing: false,
    selectedAnnotation: null,
    // ... 40+ more fields mixing UI and server state
  },
  reducers: {
    setIsDrawing: (state, action) => {
      state.isDrawing = action.payload
    },
    // ... many more reducers
  }
})

// Component
import { useDispatch, useSelector } from 'react-redux'
import { setIsDrawing } from '@/store/annotationSlice'

function DrawingCanvas() {
  const dispatch = useDispatch()
  const isDrawing = useSelector(state => state.annotations.isDrawing)

  const handleMouseDown = () => dispatch(setIsDrawing(true))
  // ...
}
```

#### After (Zustand):
```typescript
// Component
import { useAnnotationUiStore } from '@/stores/annotationUiStore'

function DrawingCanvas() {
  const isDrawing = useAnnotationUiStore(state => state.isDrawing)
  const setIsDrawing = useAnnotationUiStore(state => state.setIsDrawing)

  const handleMouseDown = () => setIsDrawing(true)
  // ...
}
```

**Benefits:**
- 70% less boilerplate (no actions, no reducers, no dispatch)
- Better performance (only re-renders when selected state changes)
- Simpler mental model (just functions, no magic)
- Easier to test (no Provider needed)

### Migrating from Redux/useState to TanStack Query

#### Before (Redux for server data):
```typescript
// Redux slice
const videoSlice = createSlice({
  name: 'videos',
  initialState: {
    videos: [],
    loading: false,
    error: null,
  },
  reducers: {
    fetchVideosStart: (state) => {
      state.loading = true
    },
    fetchVideosSuccess: (state, action) => {
      state.loading = false
      state.videos = action.payload
    },
    fetchVideosFailure: (state, action) => {
      state.loading = false
      state.error = action.payload
    },
  },
})

// Thunk
export const fetchVideos = () => async (dispatch) => {
  dispatch(fetchVideosStart())
  try {
    const response = await api.getVideos()
    dispatch(fetchVideosSuccess(response.data))
  } catch (error) {
    dispatch(fetchVideosFailure(error.message))
  }
}

// Component
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'

function VideoList() {
  const dispatch = useDispatch()
  const { videos, loading, error } = useSelector(state => state.videos)

  useEffect(() => {
    dispatch(fetchVideos())
  }, [dispatch])

  if (loading) return <Loading />
  if (error) return <Error message={error} />
  // ...
}
```

#### After (TanStack Query):
```typescript
// API hook
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

export function useVideos() {
  return useQuery({
    queryKey: ['videos'],
    queryFn: () => api.getVideos(),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  })
}

// Component
import { useVideos } from '@/api/hooks/useVideos'

function VideoList() {
  const { data: videos, isLoading, error } = useVideos()

  if (isLoading) return <Loading />
  if (error) return <Error message={error.message} />
  // ...
}
```

**Benefits:**
- Automatic caching (reduces API calls)
- Automatic background refetching
- Built-in loading/error states
- Optimistic updates
- Cache invalidation
- 90% less code

---

## Best Practices

### 1. Choosing the Right Tool

**Use Zustand if:**
- State is UI-only (doesn't persist to backend)
- State is scoped to a feature/workspace
- You need fast, frequent updates (e.g., mouse position)
- State doesn't need to be in URL or localStorage

**Use TanStack Query if:**
- Data comes from an API
- Data needs caching
- Data needs automatic refetching
- You want automatic loading/error states
- You need optimistic updates

**Use Zustand authStore if:**
- Managing authentication state (user, login status)
- App-wide settings that don't come from the server

> **Note:** Redux has been fully removed from the codebase. Use Zustand for UI/client state and TanStack Query for server state.

### 2. Selector Pattern (Performance)

Always select only the state you need to minimize re-renders:

```typescript
// ❌ Bad: Component re-renders on ANY store change
function MyComponent() {
  const store = useAnnotationUiStore()
  return <div>{store.isDrawing ? 'Drawing' : 'Idle'}</div>
}

// ✅ Good: Component re-renders only when isDrawing changes
function MyComponent() {
  const isDrawing = useAnnotationUiStore(state => state.isDrawing)
  return <div>{isDrawing ? 'Drawing' : 'Idle'}</div>
}
```

### 3. Reset State on Unmount

For workspace-specific state, reset when leaving:

```typescript
function AnnotationWorkspace() {
  const resetAllState = useAnnotationUiStore(state => state.resetAllState)

  useEffect(() => {
    return () => {
      resetAllState() // Clean up on unmount
    }
  }, [resetAllState])

  // ...
}
```

### 4. DevTools

Both Zustand stores have DevTools enabled:

1. Install [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools)
2. Stores appear as "AnnotationUiStore" and "DialogStore"
3. Can inspect state, see action history, time-travel debug

### 5. Testing

Zustand stores are easy to test (no Provider needed):

```typescript
import { useAnnotationUiStore } from '@/stores/annotationUiStore'

describe('AnnotationUiStore', () => {
  beforeEach(() => {
    useAnnotationUiStore.getState().resetAllState()
  })

  it('should handle drawing', () => {
    const { setIsDrawing } = useAnnotationUiStore.getState()
    setIsDrawing(true)
    expect(useAnnotationUiStore.getState().isDrawing).toBe(true)
  })
})
```

---

## Migration Roadmap

### Phase 1: ✅ Foundation (Complete)
- [x] Install Zustand
- [x] Create `annotationUiStore.ts` with UI state structure
- [x] Create `dialogStore.ts` for dialog management
- [x] Add comprehensive tests
- [x] Document migration strategy (this document)

### Phase 2: ✅ Full Migration (Complete)
- [x] Migrate dialog state from Layout.tsx to `dialogStore`
- [x] Migrate annotation UI state from Redux to `annotationUiStore`
- [x] Set up TanStack Query hooks for server data (`src/store/queries/`)
- [x] Migrate all data fetching to TanStack Query (videos, annotations, personas, world, claims)
- [x] Remove all Redux slices and store
- [x] Uninstall Redux packages (`redux`, `@reduxjs/toolkit`, `react-redux`)

### Phase 3: 🎯 Optimization (Future)
- [ ] Add persistence middleware for user preferences
- [ ] Implement URL sync for shareable workspace state
- [ ] Add analytics tracking for dialog opens
- [ ] Optimize selector patterns across all components

---

## Troubleshooting

### Store not updating in tests?

Make sure to call `resetAllState()` in `beforeEach()`:

```typescript
beforeEach(() => {
  useAnnotationUiStore.getState().resetAllState()
})
```

### Component not re-rendering?

Check your selector - are you selecting the right part of state?

```typescript
// Make sure you're selecting state.isDrawing, not state.drawingMode
const isDrawing = useAnnotationUiStore(state => state.isDrawing)
```

### DevTools not showing store?

Install Redux DevTools extension and refresh the page.

---

## Resources

- [Zustand Documentation](https://docs.pmnd.rs/zustand/)
- [TanStack Query Documentation](https://tanstack.com/query/latest/docs/react/overview)

---

## Questions?

For questions about state management strategy, please refer to:
- This document for usage patterns
- `EVALUATION.md` for architectural decisions
- Individual store files for API documentation
