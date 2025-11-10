# Claim Relations E2E Test Issues

## Problem Summary

The E2E tests for claim relations (`annotation-tool/test/e2e/regression/claims/claim-relations.spec.ts`) are failing because the ClaimRelationEditor dialog never appears. The root cause is that clicking the "Add Relation" button causes the UI to switch from the Claims tab back to the Summary tab, preventing the dialog from opening.

## Test Failure Details

**Failing Test**: `creates relation between two claims`

**Error**:
```
Error: expect(locator).toBeVisible() failed
Locator: getByRole('dialog', { name: /create.*relation/i })
Expected: visible
Received: <element(s) not found>
```

**Screenshot Evidence**: The dialog shows the Summary tab is selected instead of the Claims tab when the test fails.

## Root Cause Analysis

### Issue 1: Missing Claim-Compatible Relation Type Fixture ✅ FIXED

**Problem**: Tests didn't have a relation type that supports claim-to-claim relations.

**Why It Matters**: The `ClaimRelationEditor` component filters relation types to only show those where both `sourceTypes` and `targetTypes` include `'claim'`:

```typescript
// ClaimRelationEditor.tsx:69-72
const claimRelationTypes = relationTypes.filter(
  (rt) => rt.sourceTypes.includes('claim') && rt.targetTypes.includes('claim')
)
```

The existing `testRelationType` fixture had:
```typescript
sourceTypes: ['Person']
targetTypes: ['Organization']
```

**Fix Applied**:
- Added `testClaimRelationType` fixture to `test/e2e/fixtures/test-context.ts`:
```typescript
testClaimRelationType: async ({ db, testPersona }, use) => {
  const relationType = await db.createRelationType(testPersona.id, {
    name: 'Supports',
    definition: 'One claim supports another claim',
    sourceTypes: ['claim'],
    targetTypes: ['claim']
  })
  await use(relationType)
  // Cleanup is handled by persona deletion
}
```

- Updated all test signatures to include `testClaimRelationType` parameter

### Issue 2: PersonaOntology Not Loaded ✅ FIXED

**Problem**: The `VideoSummaryEditor` component wasn't fetching the persona ontology, so `ClaimRelationEditor` had no relation types available.

**Fix Applied**:
Added ontology fetch in `VideoSummaryEditor.tsx`:
```typescript
// Import
import { fetchPersonaOntology } from '../store/personaSlice'

// useEffect
useEffect(() => {
  if (personaId) {
    dispatch(fetchPersonaOntology(personaId))
  }
}, [personaId, dispatch])
```

### Issue 3: Tab Switching Bug ⚠️ IN PROGRESS

**Problem**: When clicking the "Add Relation" button, the UI switches from the Claims tab back to the Summary tab, preventing the dialog from appearing.

**Root Cause**: Event propagation issue in the Claims UI structure.

#### Component Structure
```
Paper (Card) - onClick={handleClick} switches to Summary tab
  └─ Stack (claim header with buttons)
       └─ IconButton "Show relations" - e.stopPropagation() ✅
  └─ Box (Relations Section) - e.stopPropagation() ✅ ADDED
       └─ Divider
       └─ ClaimRelationsViewer
            └─ Button "Add Relation" - e.stopPropagation() ✅ ADDED
```

**The Issue**: The entire claim Card (`Paper` component in `ClaimsViewer.tsx:121-277`) has an `onClick={handleClick}` handler that calls `onClaimSelect`, which in turn calls `handleClaimSelect` in `VideoSummaryEditor.tsx:236-241`:

```typescript
const handleClaimSelect = (claimId: string, sourceSpans: ClaimTextSpan[]) => {
  // Switch to Summary tab to show highlighted text
  setActiveTab(0)  // ⚠️ This switches to Summary tab!
  setHighlightedSpans(sourceSpans)
  setHighlightedClaimId(claimId)
}
```

Any click inside the Card bubbles up to this handler unless explicitly stopped.

## Fixes Attempted

### Fix 1: Stop Propagation on "Add Relation" Button ✅ APPLIED
**File**: `annotation-tool/src/components/claims/ClaimRelationsViewer.tsx:99-109`

```typescript
<Button
  size="small"
  startIcon={<AddIcon />}
  onClick={(e) => {
    e.stopPropagation()  // ✅ Added
    onAddRelation()
  }}
  variant="outlined"
>
  Add Relation
</Button>
```

**Result**: Still failing - tab still switches to Summary

### Fix 2: Wrap Relations Section with Stop Propagation ✅ APPLIED
**File**: `annotation-tool/src/components/claims/ClaimsViewer.tsx:265-276`

```typescript
{/* Relations Section */}
{showRelations && (
  <Box onClick={(e) => e.stopPropagation()}>  {/* ✅ Added wrapper */}
    <Divider sx={{ my: 2 }} />
    <ClaimRelationsViewer
      claimId={claim.id}
      summaryId={summaryId}
      personaId={personaId || ''}
      onAddRelation={() => setRelationEditorOpen(true)}
    />
  </Box>
)}
```

**Result**: Still failing - tab still switches to Summary

## Current Test State

The test successfully:
1. ✅ Creates two claims
2. ✅ Clicks the Claims tab
3. ✅ Verifies the Claims tab is selected (aria-selected="true")
4. ✅ Verifies claims are visible
5. ✅ Clicks "Show relations" button
6. ✅ Verifies "Add Relation" button is visible
7. ✅ Clicks "Add Relation" button
8. ❌ **FAILS**: Dialog never appears, Summary tab is selected instead

## Files Modified

### Test Files
- `annotation-tool/test/e2e/fixtures/test-context.ts` - Added testClaimRelationType fixture
- `annotation-tool/test/e2e/regression/claims/claim-relations.spec.ts` - Updated tests to use fixture and verify tab state

### Source Files
- `annotation-tool/src/components/VideoSummaryEditor.tsx` - Added fetchPersonaOntology call
- `annotation-tool/src/components/claims/ClaimRelationsViewer.tsx` - Added stopPropagation to "Add Relation" button
- `annotation-tool/src/components/claims/ClaimsViewer.tsx` - Wrapped relations section with stopPropagation

## Next Steps to Investigate

### 1. Verify stopPropagation is Actually Working
The stopPropagation calls might not be working as expected. Need to:
- Check if there are multiple click handlers in the event chain
- Verify the Box wrapper's stopPropagation is actually being called
- Check browser dev tools console for any errors

### 2. Check for Async Tab Switching
The tab might be switching after the button click due to:
- Redux state updates causing re-renders
- useEffect hooks triggering tab changes
- The `handleClaimSelect` being called from somewhere else

### 3. Alternative Solutions

#### Option A: Remove onClick from Claim Card
Instead of making the entire Card clickable, only make specific elements clickable (like the claim text). This would prevent propagation issues entirely.

```typescript
// Instead of Card onClick, add onClick to specific text element
<Box onClick={handleClick} sx={{ flex: 1, cursor: 'pointer' }}>
  <GlossRenderer gloss={claim.gloss} />
</Box>
```

#### Option B: Conditional onClick Handler
Only attach the Card's onClick handler when relations are NOT showing:

```typescript
<Paper
  onClick={!showRelations ? handleClick : undefined}
>
```

#### Option C: Check Click Target
In handleClick, check if the click came from the relations section and ignore it:

```typescript
const handleClick = (e: React.MouseEvent) => {
  // Check if click came from relations section
  const target = e.target as HTMLElement
  if (target.closest('[data-relations-section]')) {
    return
  }

  if (onSelect) {
    onSelect(claim.id, claim.textSpans || [])
  }
}
```

### 4. Check Test Timing
The test might need to wait for React state updates after clicking the tab:
- Add wait for Claims tab content to be fully rendered
- Wait for ontology to be loaded before clicking buttons
- Check if fetchPersonaOntology is actually completing before the button click

## Debugging Commands

### Run Tests in Headed Mode
```bash
npm --prefix annotation-tool run test:e2e -- \
  test/e2e/regression/claims/claim-relations.spec.ts \
  --headed --reporter=list --timeout=60000
```

### View Test Trace
```bash
npx playwright show-trace \
  test-results/claims-claim-relations-Cla-58c24-relation-between-two-claims-regression-retry1/trace.zip
```

### Run Single Test
```bash
npm --prefix annotation-tool run test:e2e -- \
  test/e2e/regression/claims/claim-relations.spec.ts \
  --reporter=list --timeout=60000 --max-failures=1
```

## Related Code Locations

### Key Files
- `annotation-tool/src/components/claims/ClaimsViewer.tsx:119-277` - ClaimTreeNode component with the clickable Card
- `annotation-tool/src/components/claims/ClaimRelationsViewer.tsx:94-110` - Add Relation button
- `annotation-tool/src/components/VideoSummaryEditor.tsx:236-241` - handleClaimSelect that switches tabs
- `annotation-tool/src/components/claims/ClaimRelationEditor.tsx` - The dialog that should appear

### Key State Management
- `activeTab` state in VideoSummaryEditor (0 = Summary, 1 = Claims)
- `showRelations` state in ClaimTreeNode
- `relationEditorOpen` state in ClaimTreeNode
- `personaOntologies` in Redux persona slice

## Screenshot Evidence

The test failure screenshots consistently show:
- The Edit Video Summary dialog is open
- The SUMMARY tab is selected (underlined)
- The CLAIMS tab shows a badge with "2" (claims were created successfully)
- The video player is visible in the background
- No ClaimRelationEditor dialog is visible

This confirms the tab switching is happening but the cause is still unclear after applying stopPropagation fixes.
