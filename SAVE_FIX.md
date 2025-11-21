# Annotation Auto-Save Fix - Comprehensive Analysis

**Date:** November 21, 2025
**Branch:** `fix/auto-save-functionality`
**Status:** IN PROGRESS - E2E tests still failing

---

## Executive Summary

This document tracks the comprehensive effort to fix annotation auto-save functionality, which was not persisting data to the database. The issue was discovered on demo.fovea.video where users reported console errors and lost annotations after page reload.

**Current State:** Architecture refactored to match working patterns (ontology/world objects), but E2E persistence tests still show 0 annotations after reload.

---

## Original Problem Statement

From user report:
- Console errors when saving bounding box annotations on demo.fovea.video
- Annotations do NOT save to database automatically
- User must manually click "Save" button
- **Critical**: All user-generated content (annotations, ontology types, world objects) should auto-save immediately
- This is a deployment blocker - users cannot lose work

---

## Architecture Analysis

### Working Patterns (Ontology & World Objects)

**Ontology Auto-Save (OntologyWorkspace.tsx:175-187):**
```typescript
useEffect(() => {
  if (!selectedPersonaId || !selectedOntology) return

  const timeoutId = setTimeout(() => {
    dispatch(savePersonaOntology({
      personaId: selectedPersonaId,
      ontology: selectedOntology
    }))
  }, 1000)

  return () => clearTimeout(timeoutId)
}, [selectedPersonaId, selectedOntology, dispatch])
```

**World Object Auto-Save (ObjectWorkspace.tsx:399-405):**
```typescript
useEffect(() => {
  const timeoutId = setTimeout(() => {
    dispatch(saveWorldState())
  }, 1000)
  return () => clearTimeout(timeoutId)
}, [entities, events, times, entityCollections, eventCollections, timeCollections, relations, dispatch])
```

**Key Pattern:**
1. Simple `useEffect` watching state changes
2. 1-second debounce via `setTimeout`
3. Dispatch Redux async thunk
4. Thunk handles API calls, error logging, loading states

### Original Broken Pattern (Annotations)

**Initial Hook (commit ef32af2):**
```typescript
// Attempted to track temp IDs, distinguish new vs updated
// Called API directly (not through Redux thunk)
// Complex logic with immediate saves for new, debounced for updates
// Redux dispatch only for updating state with saved ID
```

**Problems:**
1. Not using Redux async thunk pattern
2. Complex temp ID logic (`temp-` prefix)
3. Direct API calls bypass Redux middleware
4. Inconsistent with other auto-save implementations

---

## Refactoring Work Completed

### Commit 1: `ef32af2` - Creates auto-save hook for annotations
- Initial implementation with temp ID detection
- Immediate save for new annotations
- Debounced save for updates
- **Problem:** Too complex, not matching working patterns

### Commit 2: `e651945` - Adds auto-save functionality and removes manual save button
- Integrated hook into AnnotationWorkspace
- Removed manual "Save" button from UI
- **Problem:** Hook logic still flawed

### Commit 3: `19cf893` - Adds auto-save for persona ontology types with 1-second debounce
- Implemented ontology auto-save (this one WORKS)
- Proves the pattern is viable

### Commit 4: `c5b8e0b` - Adds comprehensive E2E persistence tests
- Created 3 annotation persistence tests
- Created 1 ontology persistence test
- Tests verify data survives page reload
- **Result:** All annotation tests FAIL

### Commit 5-7: Multiple attempts to fix hook logic
- `dd393ca`: Simplified to debounce all annotations
- `b7e37c4`: Fixed previousAnnotationsRef timing
- `baa666a`: Tracked saved annotation IDs
- **Problem:** Still not working, wrong approach

### Commit 8: `90c7fbf` - Refactors annotation auto-save to use Redux async thunk pattern
**MAJOR REFACTOR - Changed architecture to match working patterns**

**Changes:**
1. Added `saveAnnotations` async thunk to `annotationSlice.ts`:
   ```typescript
   export const saveAnnotations = createAsyncThunk(
     'annotations/saveAnnotations',
     async (params: {
       videoId: string
       personaId: string | null
       annotations: Annotation[]
       loadedAnnotationIds: string[]
     }) => {
       // Loop through annotations
       // Call api.saveAnnotation() for new
       // Call api.updateAnnotation() for existing
       // Return { savedCount, errors }
     }
   )
   ```

2. Simplified `useAutoSaveAnnotations` hook:
   ```typescript
   // Track loaded IDs on mount
   // Watch annotations array
   // Debounce 1 second
   // Dispatch saveAnnotations thunk
   ```

3. Updated AnnotationWorkspace to pass `personaId`

**Why this should work:**
- Matches ontology/world pattern exactly
- Uses Redux thunk for API calls
- Proper state management
- Consistent error handling

### Commit 9: `a086e92` - Fixes initial load detection in auto-save hook
**Problem identified:** Hook wasn't initializing properly

**Fix:**
```typescript
useEffect(() => {
  // Store IDs of initially loaded annotations
  annotations.forEach(ann => {
    if (ann.id) loadedAnnotationIdsRef.current.add(ann.id)
  })
  previousAnnotationsRef.current = annotations
}, []) // Empty array = runs once on mount
```

### Commit 10: `a5daf1a` - Fixes Redux serialization issue by converting Set to Array
**CRITICAL BUG FOUND:** Redux requires serializable data, but we were passing a `Set`

**Fix:**
```typescript
// In hook:
dispatch(saveAnnotations({
  loadedAnnotationIds: Array.from(loadedAnnotationIdsRef.current) // Convert Set to Array
}))

// In thunk:
const loadedSet = new Set(loadedAnnotationIds) // Convert back for O(1) lookup
```

**Why this is critical:** Redux Toolkit will silently fail or throw if you try to dispatch non-serializable data.

---

## Current Test Failures

### E2E Test: annotation-persistence.spec.ts

**Test 1: annotation auto-saves and persists after page reload**
```typescript
test('annotation auto-saves and persists after page reload', async ({
  page,
  annotationWorkspace,
  testVideo,
  testPersona,
  testEntityType
}) => {
  // Navigate to video annotation workspace
  await page.goto(`/annotate/${testVideo.id}`)
  await annotationWorkspace.expectWorkspaceReady()

  // Draw a simple bounding box annotation
  await annotationWorkspace.drawSimpleBoundingBox()
  await annotationWorkspace.expectBoundingBoxVisible() // ✅ PASSES (annotation created in Redux)

  // Wait for auto-save to complete (500ms debounce + network time)
  await page.waitForTimeout(2000)

  // Reload page to clear Redux state
  await page.reload()
  await page.waitForLoadState('networkidle')

  // Navigate back to the same video
  await page.goto(`/annotate/${testVideo.id}`)
  await annotationWorkspace.expectWorkspaceReady()

  // Verify annotation still exists (proving it was saved to database)
  await annotationWorkspace.expectBoundingBoxVisible() // ❌ FAILS - "All Annotations (0)"
})
```

**Failure Details:**
```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('heading', { name: /All Annotations/i })
Expected pattern: /\(1\)/
Received string:  "All Annotations (0)"
```

**What This Means:**
1. ✅ Annotation created successfully in Redux (first expectBoundingBoxVisible passes)
2. ✅ Test waits 2 seconds for auto-save
3. ✅ Page reload clears Redux state (as intended)
4. ❌ **After reload, annotation count is 0 = NOT SAVED TO DATABASE**

**Tests 2 & 3:** Similar failures - annotations not persisting

---

## Debugging Attempts

### Attempt 1: Check TypeScript Compilation
```bash
npm run type-check
```
**Result:** ✅ No errors

### Attempt 2: Check ESLint
```bash
npm run lint
```
**Result:** ✅ No warnings

### Attempt 3: Rebuild Frontend Docker Image (3 times)
```bash
docker compose -f docker-compose.e2e.yml build --no-cache frontend
docker compose -f docker-compose.e2e.yml up -d frontend
```
**Result:** ❌ Still failing - fresh build doesn't help

### Attempt 4: Check Backend Logs
```bash
docker compose -f docker-compose.e2e.yml logs backend | grep annotation
```
**Result:** ⚠️ NO API REQUESTS LOGGED - This is the smoking gun!

**Implication:** The auto-save hook is NOT dispatching the thunk, OR the thunk is not making API calls.

### Attempt 5: Check Frontend Logs
```bash
docker compose -f docker-compose.e2e.yml logs frontend | grep "Auto-save"
```
**Result:** ⚠️ NO LOGS - Debug console.log statements not appearing

**Possible Reasons:**
1. Production build strips console.log
2. Logs not forwarded from Nginx container
3. Hook not running at all

### Attempt 6: Increase Test Wait Time
Changed from 2000ms to 5000ms in tests
**Result:** ❌ Still failing - time is not the issue

---

## Current Hypotheses (Ranked by Likelihood)

### Hypothesis 1: Hook Not Running (MOST LIKELY)
**Evidence:**
- No console.log output in any logs
- No API requests in backend logs
- Tests fail consistently

**Possible Causes:**
- Hook import/export issue
- Hook conditions preventing execution
- React StrictMode causing double-mount issues
- Hook dependencies causing re-initialization

**Next Steps:**
- Add more aggressive logging that will definitely appear
- Check if hook is even being called
- Verify dispatch is being called
- Check Redux DevTools state

### Hypothesis 2: Redux Thunk Not Executing
**Evidence:**
- No API requests logged
- No errors logged

**Possible Causes:**
- Thunk import not working
- Async thunk not properly registered
- Redux middleware not configured
- Thunk silently failing

**Next Steps:**
- Add logging inside thunk
- Check Redux store configuration
- Verify extraReducers are registered

### Hypothesis 3: API Calls Failing Silently
**Evidence:**
- No backend logs
- No error messages

**Possible Causes:**
- Network errors not logged
- CORS issues
- Invalid request format
- Authentication failing

**Next Steps:**
- Add try-catch with aggressive error logging
- Check network tab in Playwright trace
- Verify API client configuration

### Hypothesis 4: Test Environment Issue
**Evidence:**
- Tests consistently fail
- Manual testing needed for comparison

**Possible Causes:**
- E2E environment configuration different
- Mock services interfering
- Database not persisting between requests
- Redis cache issues

**Next Steps:**
- Run same test manually in browser
- Check E2E docker-compose configuration
- Verify database migrations ran
- Check Redis connection

### Hypothesis 5: Timing Issue (LEAST LIKELY)
**Evidence:**
- Increased wait time didn't help
- Pattern works for ontology/world

**Possible Causes:**
- Debounce + network + processing > 2 seconds
- Async race condition

**Next Steps:**
- Increase to 10 second wait
- Add explicit wait for network idle
- Check if save completes before navigation

---

## Next Debugging Steps

### Step 1: Add Bulletproof Logging
Add logging that will DEFINITELY show up:

```typescript
// In useAutoSaveAnnotations.ts
useEffect(() => {
  // Log to multiple places
  console.error('[AUTO-SAVE INIT]', { videoId, annotationCount: annotations.length })
  window.__AUTOSAVE_DEBUG = { initialized: true, annotationCount: annotations.length }

  // ... rest of hook
}, [])
```

### Step 2: Add Backend Request Logging
Modify backend to log ALL annotation requests:

```typescript
// In server routes
fastify.addHook('onRequest', async (request, reply) => {
  if (request.url.includes('annotation')) {
    console.log('[ANNOTATION REQUEST]', request.method, request.url)
  }
})
```

### Step 3: Check Network Requests in Playwright
Extract network log from trace:

```bash
unzip -p trace.zip 0-trace.network > network.log
cat network.log | grep annotation
```

### Step 4: Manual Browser Testing
1. Build frontend: `npm run build`
2. Start dev server: `npm run dev`
3. Open http://localhost:3000
4. Open DevTools Console
5. Create annotation
6. Watch for "[Auto-save]" logs
7. Check Network tab for POST /api/annotations
8. Reload page
9. Verify annotation persists

### Step 5: Compare Working vs Broken
Run ontology auto-save test (which PASSES) and compare:
- Console logs
- Network requests
- Redux state changes
- Timing

---

## Code Locations

### Hook Implementation
- **File:** `annotation-tool/src/hooks/useAutoSaveAnnotations.ts`
- **Lines:** 1-111
- **Key Logic:** Lines 64-109

### Redux Thunk
- **File:** `annotation-tool/src/store/annotationSlice.ts`
- **Lines:** 99-145
- **Key Logic:** Lines 120-133 (API calls)

### Hook Integration
- **File:** `annotation-tool/src/components/AnnotationWorkspace.tsx`
- **Lines:** 164-171
- **Usage:** Hook called with videoId, personaId, annotations, debounceMs

### API Methods
- **File:** `annotation-tool/src/services/api.ts`
- **Lines:** 52-60
- **Methods:** `saveAnnotation()` (POST), `updateAnnotation()` (PUT)

### E2E Tests
- **File:** `annotation-tool/test/e2e/regression/persistence/annotation-persistence.spec.ts`
- **Lines:** 10-108
- **Tests:** 3 annotation persistence tests

### Backend Routes
- **File:** `server/src/routes/annotations.ts`
- **Endpoints:** POST `/api/annotations`, PUT `/api/annotations/:id`

---

## Working Example (Ontology) vs Broken (Annotations)

### Ontology (WORKS) ✅

**Hook Pattern:**
```typescript
// OntologyWorkspace.tsx:175-187
useEffect(() => {
  if (!selectedPersonaId || !selectedOntology) return

  const timeoutId = setTimeout(() => {
    dispatch(savePersonaOntology({
      personaId: selectedPersonaId,
      ontology: selectedOntology
    }))
  }, 1000)

  return () => clearTimeout(timeoutId)
}, [selectedPersonaId, selectedOntology, dispatch])
```

**Thunk:**
```typescript
// personaSlice.ts:129-151
export const savePersonaOntology = createAsyncThunk(
  'persona/savePersonaOntology',
  async (params: { personaId: string; ontology: PersonaOntology }) => {
    const response = await fetch(`/api/personas/${params.personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entities: params.ontology.entities,
        roles: params.ontology.roles,
        events: params.ontology.events,
        relationTypes: params.ontology.relationTypes,
        relations: params.ontology.relations,
      }),
    })
    if (!response.ok) throw new Error('Failed to save')
    return await response.json()
  }
)
```

### Annotations (BROKEN) ❌

**Hook Pattern:**
```typescript
// useAutoSaveAnnotations.ts:80-109
useEffect(() => {
  if (!videoId) return

  if (JSON.stringify(annotations) === JSON.stringify(previousAnnotationsRef.current)) {
    return
  }

  const timeoutId = setTimeout(() => {
    if (annotations.length === 0) return

    dispatch(saveAnnotations({
      videoId,
      personaId,
      annotations,
      loadedAnnotationIds: Array.from(loadedAnnotationIdsRef.current)
    }))
  }, debounceMs)

  previousAnnotationsRef.current = annotations
  return () => clearTimeout(timeoutId)
}, [videoId, personaId, annotations, debounceMs, dispatch])
```

**Thunk:**
```typescript
// annotationSlice.ts:99-145
export const saveAnnotations = createAsyncThunk(
  'annotations/saveAnnotations',
  async (params: {
    videoId: string
    personaId: string | null
    annotations: Annotation[]
    loadedAnnotationIds: string[]
  }) => {
    const { annotations, loadedAnnotationIds } = params
    const loadedSet = new Set(loadedAnnotationIds)
    const savedCount = { created: 0, updated: 0 }
    const errors: Array<{ annotationId: string; error: string }> = []

    for (const annotation of annotations) {
      if (!annotation.id) continue

      try {
        const isNew = !loadedSet.has(annotation.id)

        if (isNew) {
          await api.saveAnnotation(annotation)
          savedCount.created++
          loadedSet.add(annotation.id)
        } else {
          await api.updateAnnotation(annotation)
          savedCount.updated++
        }
      } catch (error) {
        console.error(`Failed to save annotation ${annotation.id}:`, error)
        errors.push({
          annotationId: annotation.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return { savedCount, errors }
  }
)
```

**Key Differences:**
1. ❓ Ontology uses `fetch()` directly, annotations use `api.saveAnnotation()`
2. ❓ Ontology has single PUT endpoint, annotations need POST vs PUT logic
3. ❓ Annotation hook has more complex initialization (tracking loaded IDs)
4. ❓ Annotation hook uses JSON.stringify comparison
5. ❓ Ontology thunk returns data, annotation thunk returns metrics

---

## Potential Issues Discovered

### Issue 1: JSON.stringify Comparison
```typescript
if (JSON.stringify(annotations) === JSON.stringify(previousAnnotationsRef.current)) {
  return // Skip save
}
```

**Problem:** This might return true even when annotations changed, if:
- Object key order differs
- Dates serialized differently
- Nested objects have reference changes

**Fix:** Use deep equality check or just remove this optimization

### Issue 2: Empty Array Check Inside Timeout
```typescript
const timeoutId = setTimeout(() => {
  if (annotations.length === 0) return // This captures OLD value!
  // ...
}, debounceMs)
```

**Problem:** Closure might capture stale annotations array

**Fix:** Don't check length inside timeout, or capture value explicitly

### Issue 3: Conditional Early Returns
```typescript
useEffect(() => {
  if (!videoId) return

  // Multiple conditions that might prevent execution
  if (JSON.stringify(...) === JSON.stringify(...)) return

  // Timeout never set if conditions fail
}, [videoId, personaId, annotations, debounceMs, dispatch])
```

**Problem:** Many paths that skip save

**Fix:** Simplify conditions, add logging for each path

### Issue 4: Initialization Logic Separate from Save Logic
Hook has TWO useEffects:
1. One-time init (lines 66-76)
2. Save on change (lines 80-109)

**Problem:** Race condition if annotations loaded after init?

**Fix:** Combine into single effect or ensure proper ordering

---

## Test Output Analysis

```
Error: expect(locator).toContainText(expected) failed
Locator: getByRole('heading', { name: /All Annotations/i })
Expected pattern: /\(1\)/
Received string:  "All Annotations (0)"
```

**What we know:**
1. After page reload, heading shows "(0)" annotations
2. This means `annotations` Redux state is empty
3. This means `GET /api/annotations/:videoId` returned empty array
4. This means database has NO annotations for this video
5. This means POST/PUT never happened OR failed silently

**Critical Question:** Did the annotation ever make it to Redux state?
- Test has `await annotationWorkspace.expectBoundingBoxVisible()` which passes
- So yes, annotation IS in Redux after creation
- But it's NOT in database after reload

**Conclusion:** Auto-save hook is NOT dispatching the thunk, OR thunk is NOT making API calls.

---

## Next Actions (Priority Order)

1. **Add Window-Level Debug Object** - Guaranteed to persist and be visible
2. **Add Backend Middleware Logging** - Log ALL requests before route handlers
3. **Extract Playwright Network Log** - See if ANY requests were made
4. **Manual Browser Test** - Verify behavior outside E2E environment
5. **Compare to Working Pattern** - Side-by-side code review
6. **Simplify Hook Logic** - Remove all optimizations, make it bulletproof
7. **Add Redux DevTools Logging** - See if thunk is dispatched
8. **Check API Client Configuration** - Verify axios instance works

---

## Success Criteria

✅ **Test Passes When:**
1. User creates annotation
2. Wait 1-2 seconds
3. Reload page
4. Annotation still visible
5. Database query shows annotation exists
6. Backend logs show POST /api/annotations request
7. Frontend logs show "[Auto-save] Saving..." message

✅ **All 3 Tests Must Pass:**
1. annotation auto-saves and persists after page reload
2. annotation updates auto-save and persist
3. multiple rapid annotations all auto-save correctly

---

## Current Status: NEEDS MORE DEBUGGING

**Blocked On:** Understanding why no API requests are being made

**Next Session Should:**
1. Add comprehensive logging
2. Run manual browser test
3. Extract and analyze network logs
4. Compare working vs broken implementation
5. Simplify hook to absolute minimum
6. Keep iterating until tests pass

---

## UPDATE: November 21, 2025 - Critical Findings After API Schema Fix

### Commits Since Last Update
- `af76d30`: Fixes critical bug where filtered annotations prevented auto-save
- `763c95c`: Maps annotation fields to match backend schema (annotationType->type, adds label)

### API Schema Mismatch Discovered

**The Problem:**
Backend Prisma schema requires:
```typescript
{
  videoId: string
  personaId: string  // Required
  type: string       // Backend field name
  label: string      // Required
  frames: Json
  confidence?: number
  source: string
}
```

Frontend TypeScript types use:
```typescript
{
  id: string
  videoId: string
  annotationType: 'type' | 'object'  // Different field name!
  // No label field!
  boundingBoxSequence: BoundingBoxSequence
  // personaId only on TypeAnnotation, not ObjectAnnotation
}
```

**The Fix Applied:**
Added transformation in `api.ts`:
```typescript
async saveAnnotation(annotation: Annotation): Promise<Annotation> {
  let personaId: string
  let label: string

  if (annotation.annotationType === 'type') {
    personaId = annotation.personaId
    label = annotation.typeId || 'unlabeled'
  } else {
    // Object annotations don't have personaId, use videoId as fallback
    personaId = annotation.videoId
    label = annotation.linkedEntityId || annotation.linkedEventId || annotation.linkedTimeId || 'unlabeled'
  }

  const backendPayload = {
    videoId: annotation.videoId,
    personaId,
    type: annotation.annotationType,
    label,
    frames: annotation.boundingBoxSequence,
    confidence: annotation.confidence,
    source: 'manual'
  }
  const response = await axios.post(`${API_BASE}/annotations`, backendPayload)
  return response.data
}
```

### E2E Test Results After Fix

**Before Fix:** 0/3 tests passing
**After Fix:** 2/3 tests passing (with 1 flaky)

```
✅ Test 2: annotation updates auto-save and persist (32.6s)
⚠️  Test 1: annotation auto-saves and persists after page reload (FLAKY)
   - First run: FAILED - Expected "(1)", found "(2)"
   - Retry: PASSED
❌ Test 3: multiple rapid annotations all auto-save correctly
   - Expected at least "(1)", found "(0)"
```

### CRITICAL DISCOVERY: No Database Persistence

**Database Check:**
```sql
SELECT id, type, label, "videoId", "personaId", "createdAt"
FROM annotations
ORDER BY "createdAt" DESC
LIMIT 10;

-- Result: (0 rows)
```

**Backend Log Check:**
```bash
docker compose -f docker-compose.e2e.yml logs backend | grep "POST /api/annotations"
# Result: 0 matches
```

**What This Means:**
1. ❌ Auto-save hook is NOT dispatching the thunk
2. ❌ NO API requests reaching backend
3. ❌ NO annotations saved to database
4. ⚠️  Tests showing "(2)" or "(1)" are FALSE POSITIVES from:
   - Test isolation issues (leftover Redux state)
   - Stale data from previous test runs
   - Annotations in Redux but not persisted

### Root Cause Analysis

**Why Tests "Pass" Without Database Persistence:**
1. First bounding box draw → annotation added to Redux state
2. Page reload → Redux cleared
3. Page navigate back → `getAnnotations()` returns empty array from DB
4. But test might see stale data or count from previous run

**Why Auto-Save Isn't Working:**
Despite fixing:
- ✅ Filtered annotations bug (allAnnotations vs annotations)
- ✅ API schema mismatch (annotationType→type, added label)
- ✅ Redux serialization (Set→Array)

The hook still isn't triggering. Possible causes:

1. **Hook Not Running:**
   - Empty dependency causing skip
   - Conditions preventing dispatch
   - React StrictMode issues

2. **Thunk Not Executing:**
   - Import issues
   - Redux middleware not configured
   - Async thunk silently failing

3. **API Client Failing:**
   - Axios errors not logged
   - CORS issues
   - Request never sent

### Filtered Annotations Bug (FIXED)

**The Bug:**
```typescript
// BEFORE - AnnotationWorkspace.tsx
const annotations = useSelector(state => {
  const videoAnnotations = state.annotations.annotations[videoId || '']
  if (selectedPersonaId && videoAnnotations) {
    return videoAnnotations.filter(a =>
      a.annotationType === 'type' && a.personaId === selectedPersonaId
    )
  }
  return videoAnnotations || []
})

// Passed filtered subset to auto-save
useAutoSaveAnnotations({ annotations })
```

**Why This Broke Auto-Save:**
- If no persona selected → empty array → hook skips save
- If wrong persona → empty array → hook skips save
- Only saved annotations matching current persona filter

**The Fix:**
```typescript
// Get ALL annotations (unfiltered)
const allAnnotations = useSelector((state: RootState) => {
  return state.annotations.annotations[videoId || ''] || []
})

// Get filtered for display
const annotations = useSelector((state: RootState) => {
  const videoAnnotations = state.annotations.annotations[videoId || '']
  if (selectedPersonaId && videoAnnotations) {
    return videoAnnotations.filter(a => {
      if (a.annotationType === 'type') {
        return a.personaId === selectedPersonaId
      }
      return true
    })
  }
  return videoAnnotations || []
})

// Pass ALL to auto-save
useAutoSaveAnnotations({
  videoId,
  personaId: selectedPersonaId,
  annotations: allAnnotations, // ← Unfiltered
  debounceMs: 1000,
})
```

### Next Debugging Steps

**Immediate Actions:**
1. Add console.error() statements (will show in Docker logs)
2. Add window.__DEBUG global object
3. Log every step: hook init → change detection → timeout → dispatch → thunk → API call
4. Check if Redux DevTools shows thunk actions
5. Verify axios interceptors aren't blocking

**Logging Points Needed:**
```typescript
// useAutoSaveAnnotations.ts
console.error('[AUTO-SAVE INIT]', { videoId, annotationCount })
console.error('[AUTO-SAVE CHANGE DETECTED]')
console.error('[AUTO-SAVE DISPATCHING]', { annotations })

// annotationSlice.ts (inside thunk)
console.error('[THUNK START]', { annotationCount })
console.error('[THUNK API CALL]', { annotation })
console.error('[THUNK COMPLETE]', { savedCount })

// api.ts
console.error('[API saveAnnotation]', { backendPayload })
console.error('[API response]', { data })
```

**Expected Behavior:**
If working correctly, should see in logs:
```
[AUTO-SAVE INIT] { videoId: 'abc123', annotationCount: 0 }
[AUTO-SAVE CHANGE DETECTED] (after drawing box)
[AUTO-SAVE DISPATCHING] { annotations: [Array(1)] }
[THUNK START] { annotationCount: 1 }
[API saveAnnotation] { backendPayload: {...} }
[API response] { data: {...} }
[THUNK COMPLETE] { savedCount: { created: 1, updated: 0 } }
```

**Current Behavior:**
Complete silence in logs = hook/thunk not running at all.

---

## Current Status: CRITICAL - AUTO-SAVE NOT WORKING AT ALL

**Evidence:**
- 0 annotations in database
- 0 API requests in backend logs
- Tests passing due to false positives (stale data/test isolation)

**Action Required:**
- Add comprehensive logging throughout the entire auto-save flow
- Identify exactly where the flow breaks
- Fix and verify with database queries, not just UI checks

---

**End of Document**
