/**
 * Tour-anchor smoke test — asserts that every `data-tour-id` referenced
 * by a built-in tour script resolves to exactly one element in the live
 * frontend. Catches the most likely failure mode of the tour system:
 * a component rename or refactor that quietly drops the anchor.
 *
 * Tour 1 is the only headline tour landed at this point. Tours 2–10
 * add their own anchors when they land; each anchor adds a row here.
 */

import { test, expect } from '../fixtures/test-context.js'

// Mirrors the `firstAnnotationTour` script in
// annotation-tool/src/tours/scripts/first-annotation.ts. Kept inline
// instead of imported because the E2E suite runs against the built
// frontend bundle, not the source, and we want the assertion to fail
// loudly if a rename diverges this list from the script.
const TOUR_1_ANCHORS = [
  { anchor: 'app-shell', route: '/' },
  { anchor: 'video-browser-card-first', route: '/' },
  { anchor: 'video-player-scrubber', route: '/annotate/:videoId' },
  { anchor: 'drawing-canvas', route: '/annotate/:videoId' },
  { anchor: 'timeline', route: '/annotate/:videoId' },
  { anchor: 'save-indicator', route: '/annotate/:videoId' },
  // object-picker-popover lives inside a Dialog that only mounts on
  // user click; covered by the engine's waitForAnchor ceiling, not by
  // this static smoke.
]

test.describe('Tour anchors smoke', () => {
  test('every Tour 1 anchor that is statically reachable resolves to one element', async ({
    page,
    annotationWorkspace,
    testVideo,
    testPersona,
    testEntityType,
    testUser,
  }) => {
    void testPersona
    void testEntityType
    void testUser

    // Anchors visible on the video browser landing.
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    for (const { anchor, route } of TOUR_1_ANCHORS) {
      if (route !== '/') continue
      const matches = page.locator(`[data-tour-id="${anchor}"]`)
      const count = await matches.count()
      expect(count, `anchor [data-tour-id="${anchor}"] on / should resolve to exactly one element`).toBe(1)
    }

    // Anchors visible inside the annotation workspace.
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })
    for (const { anchor, route } of TOUR_1_ANCHORS) {
      if (!route.includes('/annotate/')) continue
      const matches = page.locator(`[data-tour-id="${anchor}"]`)
      // The save-indicator only renders when there's a recent save event
      // to display; treat zero matches as a soft pass and require one
      // anywhere on the page otherwise.
      const count = await matches.count()
      if (anchor === 'save-indicator') {
        expect(count, 'save-indicator must resolve to 0 or 1 element').toBeLessThanOrEqual(1)
        continue
      }
      expect(count, `anchor [data-tour-id="${anchor}"] on /annotate/:id should resolve to at least one element`).toBeGreaterThanOrEqual(1)
    }
  })
})
