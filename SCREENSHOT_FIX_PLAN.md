# Visual Regression Test Failures - Fix Plan

**Date:** November 20, 2025
**Branch:** refactor/install-zustand
**PR:** #13

## Executive Summary

13 visual regression tests are failing with minor pixel differences (0.01-2% of pixels). Analysis indicates that the **test videos being used do not match the expected baseline screenshots**, causing false positives. No UI components were modified in this PR, confirming these are not actual regressions.

**Root Cause:** Test video selection inconsistency between baseline screenshot creation and current test runs.

**Solution:** Regenerate baseline screenshots using the actual test videos that are currently being used by the E2E test suite.

---

## Failed Tests Analysis

### Summary of Failures

| Test File | Test Name | Pixel Diff % | Status |
|-----------|-----------|--------------|--------|
| `component-snapshots.spec.ts` | video card renders correctly | 0.01% | ❌ |
| `component-snapshots.spec.ts` | relation type dialog renders correctly | <1% | ❌ |
| `component-snapshots.spec.ts` | video player controls render correctly | <1% | ❌ |
| `component-snapshots.spec.ts` | export dialog renders correctly | <1% | ❌ |
| `component-snapshots.spec.ts` | bounding box renderer renders correctly | <1% | ❌ |
| `responsive-layouts.spec.ts` | video browser on mobile | <2% | ❌ |
| `responsive-layouts.spec.ts` | video browser on tablet | <2% | ❌ |
| `responsive-layouts.spec.ts` | video browser on desktop | <2% | ❌ |
| `responsive-layouts.spec.ts` | video browser on wide | <2% | ❌ |
| `responsive-layouts.spec.ts` | annotation workspace on desktop | <1% | ❌ |
| `responsive-layouts.spec.ts` | annotation workspace on wide | <1% | ❌ |
| `responsive-layouts.spec.ts` | ontology workspace on tablet | 0.01% | ❌ |
| `responsive-layouts.spec.ts` | object workspace on desktop | 0.01% | ❌ |

### Common Characteristics

All failures share these traits:
1. **Very small pixel differences** (0.01-2% of total pixels)
2. **No layout or styling changes** - differences are in content, not structure
3. **Video-related content** - thumbnails, video player, video metadata
4. **Consistent across different viewport sizes** - same issue on mobile, tablet, desktop, wide

---

## Root Cause Analysis

### Observation

From the E2E test output and user analysis:
- The current test run opens a **different video** than what was captured in the baseline screenshots
- Video thumbnails, titles, and metadata differ between expected and actual screenshots
- Layout, styling, and UI components are identical (no structural changes)

### Why This Happened

**Hypothesis 1: Non-deterministic Video Selection**
The E2E tests may be selecting videos based on:
- Database insertion order (non-deterministic)
- Filesystem order (can vary)
- `ORDER BY createdAt DESC` without stable secondary sort

**Hypothesis 2: Test Data Changed**
The test fixtures or seed data may have been modified since baseline screenshots were created:
- Different videos uploaded to E2E test environment
- Different video order in database
- Different video IDs

**Hypothesis 3: Timing Issues**
Screenshot timing may be capturing videos before they fully load or in different loading states.

### Evidence Supporting Root Cause

1. **No code changes to UI components** in this PR (only added stores)
2. **All functional tests pass** (306/306) - no behavioral changes
3. **Pixel differences are in video content areas** - not in buttons, menus, or layout
4. **Differences are consistent across all video-related tests**

---

## Solution Plan

### Option 1: Regenerate Baseline Screenshots (Recommended)

**Approach:** Update baseline screenshots to match the current test videos.

**Steps:**
1. Run E2E visual tests with `--update-snapshots` flag
2. Verify updated screenshots manually
3. Commit updated baseline screenshots
4. Rerun E2E suite to confirm all pass

**Commands:**
```bash
# Ensure E2E environment is running with latest code
docker compose -f docker-compose.e2e.yml down
docker compose -f docker-compose.e2e.yml build --no-cache frontend
docker compose -f docker-compose.e2e.yml up -d

# Wait for services to be healthy
sleep 30

# Regenerate visual test snapshots
cd annotation-tool
npm run test:e2e:visual:update

# Verify snapshots were updated
git status

# Review diffs manually
git diff test/e2e/regression/visual/**/*-snapshots/

# Commit updated snapshots
git add test/e2e/regression/visual/
git commit -m "Updates visual regression test baseline screenshots."

# Rerun visual tests to verify
npm run test:e2e:visual
```

**Pros:**
- Quick and straightforward
- Aligns baseline with current test environment
- No test code changes needed

**Cons:**
- Requires manual review of 13 screenshot updates
- Doesn't fix underlying non-determinism

---

### Option 2: Fix Test Data Determinism (Better Long-term)

**Approach:** Ensure tests always use the same video in the same order.

**Root Issue:** Tests likely use first video from database without explicit selection:
```typescript
// Current (non-deterministic)
const videos = await page.locator('.video-card').all()
await videos[0].click() // Which video is this?

// Better (deterministic)
await page.locator('.video-card').filter({ hasText: 'test-video-1.mp4' }).click()
```

**Steps:**

1. **Add test video IDs to fixtures:**
```typescript
// test/e2e/fixtures/videos.ts
export const TEST_VIDEOS = {
  PRIMARY: {
    id: 'test-video-primary-001',
    filename: 'test-video-1.mp4',
    title: 'Test Video 1 - Primary',
  },
  SECONDARY: {
    id: 'test-video-secondary-002',
    filename: 'test-video-2.mp4',
    title: 'Test Video 2 - Secondary',
  },
} as const
```

2. **Update test setup to ensure consistent video order:**
```typescript
// test/e2e/setup/seed-data.ts
export async function seedTestVideos(page: Page) {
  // Delete existing videos
  await page.request.delete('/api/videos/all')

  // Upload videos in specific order
  await uploadTestVideo(page, TEST_VIDEOS.PRIMARY)
  await uploadTestVideo(page, TEST_VIDEOS.SECONDARY)

  // Verify order
  const videos = await page.request.get('/api/videos')
  expect(videos[0].filename).toBe(TEST_VIDEOS.PRIMARY.filename)
}
```

3. **Update visual tests to use specific video:**
```typescript
// test/e2e/regression/visual/component-snapshots.spec.ts
test('video card renders correctly', async ({ page }) => {
  await page.goto('/')

  // Wait for specific video to load (deterministic)
  const videoCard = page.locator('.video-card').filter({
    hasText: TEST_VIDEOS.PRIMARY.title
  })
  await videoCard.waitFor()

  await expect(videoCard).toHaveScreenshot('video-card.png', {
    threshold: 0.2,
    maxDiffPixels: 150
  })
})
```

4. **Regenerate baseline screenshots with deterministic tests**

**Pros:**
- Fixes root cause of non-determinism
- Tests are more reliable long-term
- Easier to debug when tests fail

**Cons:**
- More work (requires test code changes)
- Need to regenerate all baseline screenshots anyway
- May uncover other test issues

---

### Option 3: Increase Threshold Tolerance (Not Recommended)

**Approach:** Increase `maxDiffPixels` or `threshold` in visual tests.

**Example:**
```typescript
await expect(page).toHaveScreenshot('video-card.png', {
  threshold: 0.5,  // Increased from 0.2
  maxDiffPixels: 500  // Increased from 150
})
```

**Pros:**
- Quick fix
- No screenshot regeneration needed

**Cons:**
- ⚠️ **Masks real regressions** - defeats the purpose of visual tests
- Doesn't fix underlying issue
- Technical debt accumulation
- **NOT RECOMMENDED**

---

## Recommended Implementation Plan

**Phase 1: Immediate Fix (for PR #13)**
1. Regenerate baseline screenshots (Option 1)
2. Commit updated screenshots to PR #13
3. Verify E2E suite passes
4. Merge PR #13

**Phase 2: Long-term Fix (separate PR)**
1. Implement deterministic test data (Option 2)
2. Update all visual tests to use specific test videos
3. Regenerate baselines again with deterministic tests
4. Document test video requirements in test/e2e/README.md

---

## Implementation Details

### Phase 1: Immediate Fix

**Commands:**
```bash
# 1. Ensure clean E2E environment
cd /Users/awhite48/Projects/multivent
docker compose -f docker-compose.e2e.yml down -v

# 2. Rebuild with latest code
docker compose -f docker-compose.e2e.yml build --no-cache frontend

# 3. Start E2E environment
docker compose -f docker-compose.e2e.yml up -d

# 4. Wait for services to be healthy
sleep 30
docker compose -f docker-compose.e2e.yml ps

# 5. Update visual test snapshots
cd annotation-tool
npm run test:e2e:visual:update

# 6. Review updated snapshots
git status
git diff --stat test/e2e/regression/visual/

# 7. Manually inspect a few screenshots
open test-results/component-snapshots-Comp*/video-card-actual.png
# Compare with:
open test/e2e/regression/visual/component-snapshots.spec.ts-snapshots/video-card-visual-darwin.png

# 8. If screenshots look correct, commit
git add test/e2e/regression/visual/
git commit -m "Updates visual regression test baseline screenshots."

# 9. Rerun visual tests to verify
npm run test:e2e:visual

# 10. Push to PR branch
git push origin refactor/install-zustand
```

**Manual Review Checklist:**
- [ ] Video cards show correct layout (thumbnail, title, duration)
- [ ] Player controls are all visible and properly positioned
- [ ] Dialog boxes are centered and complete
- [ ] Responsive layouts work correctly at all breakpoints
- [ ] No UI elements are cut off or overlapping
- [ ] Colors and fonts match design system

---

### Phase 2: Long-term Fix (Future PR)

**File Changes Needed:**

1. **Create test video fixtures**
   - `test/e2e/fixtures/videos.ts` - Define test video constants
   - `test/e2e/fixtures/video-files/` - Store test video files

2. **Update test setup**
   - `test/e2e/setup/seed-data.ts` - Deterministic video seeding
   - `test/e2e/setup/global-setup.ts` - Upload videos before tests

3. **Update visual tests**
   - `test/e2e/regression/visual/component-snapshots.spec.ts` - Use specific videos
   - `test/e2e/regression/visual/responsive-layouts.spec.ts` - Use specific videos

4. **Update backend seed script**
   - `server/prisma/seed.ts` - Add deterministic ordering

5. **Documentation**
   - `test/e2e/README.md` - Document test video requirements
   - Add troubleshooting guide for visual test failures

---

## Testing the Fix

### Verification Steps

After implementing Phase 1 (regenerate baselines):

```bash
# 1. Clean run of visual tests
npm run test:e2e:visual

# Expected: All 13 previously failing tests now pass

# 2. Run full E2E suite
npm run test:e2e

# Expected:
# - 306 functional tests pass
# - 13 visual tests pass
# - 5 skipped (expected)
# Total: 319 passed, 5 skipped

# 3. Verify baseline screenshots were updated
git log --oneline --all -- test/e2e/regression/visual/
# Should show commit updating screenshots

# 4. Check screenshot file sizes are reasonable
ls -lh test/e2e/regression/visual/**/*-snapshots/*.png
# Should be 50-500 KB each
```

### Success Criteria

- ✅ All 13 visual regression tests pass
- ✅ All 306 functional E2E tests still pass
- ✅ No new visual test failures introduced
- ✅ Screenshots manually reviewed and approved
- ✅ Git diff shows only PNG files changed (no code changes)
- ✅ CI pipeline passes on PR

---

## Prevention Strategy

To prevent future visual test failures:

1. **Document baseline regeneration process** in test/e2e/README.md
2. **Use consistent test data** across all environments
3. **Pin test video files** in git (check into repo if small)
4. **CI checks** should fail if screenshots differ by >2%
5. **Add pre-commit hook** to warn about screenshot changes
6. **Implement Phase 2** to fix root cause of non-determinism

---

## Rollback Plan

If regenerating baselines causes issues:

```bash
# 1. Revert screenshot updates
git checkout HEAD~ test/e2e/regression/visual/

# 2. Force push to PR branch
git push --force origin refactor/install-zustand

# 3. Document issue in PR comments
gh pr comment 13 --body "Visual test baseline regeneration reverted due to [reason]. Investigating alternative approach."
```

---

## Timeline

**Phase 1 (Immediate):** 30-60 minutes
- Environment setup: 10 min
- Regenerate baselines: 10 min
- Manual review: 20 min
- Commit and push: 5 min
- Verify CI: 15 min

**Phase 2 (Long-term):** 4-6 hours
- Design fixtures: 1 hour
- Implement deterministic seeding: 2 hours
- Update tests: 2 hours
- Regenerate and verify: 1 hour

---

## Related Files

### Visual Test Files
- `test/e2e/regression/visual/component-snapshots.spec.ts`
- `test/e2e/regression/visual/responsive-layouts.spec.ts`
- `test/e2e/regression/visual/timeline-rendering.spec.ts`

### Baseline Screenshots
- `test/e2e/regression/visual/**/*-snapshots/*.png` (13+ files)

### Test Configuration
- `playwright.config.ts` - Visual test configuration
- `test/e2e/setup/global-setup.ts` - Test environment setup

### Backend Seed Data
- `server/prisma/seed.ts` - Test data seeding
- `docker-compose.e2e.yml` - E2E environment config

---

## References

- Playwright Visual Comparison: https://playwright.dev/docs/test-snapshots
- E2E Test Best Practices: https://playwright.dev/docs/best-practices
- Test Data Management: https://martinfowler.com/articles/nonDeterminism.html

---

## Questions & Answers

**Q: Why not skip visual tests for this PR?**
A: Visual tests are valuable. It's better to fix them properly than skip them, as they catch real UI regressions.

**Q: Can we disable visual tests temporarily?**
A: Yes, but not recommended. Add `@skip` tag to tests if needed, but document why and when they'll be fixed.

**Q: Will this happen again?**
A: Likely, until Phase 2 is implemented. Each time test videos change, baselines must be regenerated.

**Q: How do we know regenerated screenshots are correct?**
A: Manual review against current test environment. Screenshots should show current test videos, not old ones.

---

**Next Steps:**
1. Execute Phase 1 to unblock PR #13
2. Schedule Phase 2 implementation in next sprint
3. Document process in test/e2e/README.md
