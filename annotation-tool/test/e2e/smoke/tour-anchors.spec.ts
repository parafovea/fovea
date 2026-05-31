/**
 * Tour-anchor smoke test — asserts that every `data-tour-id` referenced
 * by a built-in tour script resolves to at least one element on the
 * route it's expected to live on. Catches the most likely failure mode
 * of the tour system: a component rename or refactor that quietly drops
 * the anchor.
 *
 * Each entry below is intentionally duplicated from the corresponding
 * tour script in src/tours/scripts/. The E2E suite runs against the
 * built frontend bundle, not the source, so we want the assertion to
 * fail loudly if a rename diverges this list from the script.
 *
 * Anchors that live inside lazily-mounted Dialogs / Popovers / pages
 * the test doesn't navigate to are explicitly excluded with a note —
 * those are covered by the engine's `waitForAnchor` 3 s ceiling at
 * runtime rather than by static smoke.
 */

import { test, expect } from '../fixtures/test-context.js'

interface AnchorSpec {
  anchor: string
  route: 'home' | 'workspace' | 'ontology' | 'world' | 'projects' | 'groups' | 'shared' | 'admin'
  /** Anchors that conditionally render (transient toast / status). */
  optional?: boolean
}

// Tour 1 — First annotation in 90 seconds
const TOUR_1: AnchorSpec[] = [
  { anchor: 'app-shell', route: 'home' },
  { anchor: 'app-sidebar', route: 'home' },
  { anchor: 'video-browser-card-first', route: 'home' },
  { anchor: 'video-player-scrubber', route: 'workspace' },
  { anchor: 'drawing-canvas', route: 'workspace' },
  // timeline is hidden by default behind a "Show Timeline" toggle.
  // The runtime tour at step 6 still resolves it via the engine's
  // 3 s wait once the visitor clicks Show Timeline, but the static
  // smoke cannot simulate that interaction, so mark optional.
  { anchor: 'timeline', route: 'workspace', optional: true },
  // save-indicator only renders when there's a recent save event.
  { anchor: 'save-indicator', route: 'workspace', optional: true },
  // object-picker-popover is dialog-mounted on user click; runtime-only.
]

// Tour 2 — Ontology authoring
const TOUR_2: AnchorSpec[] = [
  { anchor: 'ontology-workspace-tabs', route: 'ontology' },
  // entity-type-editor / event-type-editor / role-editor /
  // relation-type-editor / gloss-editor live inside dialogs that open
  // on click; runtime-only.
]

// Tour 3 — Wikidata augmentation (augmenter UI lives inside the
// ontology workspace; the search + results anchors are conditional on
// expanding the augmenter, runtime-only).

// Tour 4 — Events, roles, claims (claim-editor / claim-relations-viewer
// live in dialogs mounted from the summary surface; runtime-only).

// Tour 5 — World layer
const TOUR_5: AnchorSpec[] = [
  { anchor: 'world-panel-tabs', route: 'world' },
  // entity-editor / event-editor / location-map-picker / time-editor /
  // collection-builder / time-collection-builder live inside dialogs.
]

// Tour 7 — Summaries (claims-viewer / video-summary-editor live inside
// the Video Summary dialog; transcript-viewer / audio-config-panel
// mount when audio config is open — all runtime-only).

// Tour 8 — Collaboration
const TOUR_8: AnchorSpec[] = [
  { anchor: 'projects-page', route: 'projects' },
  { anchor: 'groups-page', route: 'groups' },
  { anchor: 'shared-annotations-page', route: 'shared' },
]

// Tour 9 — Admin
const TOUR_9: AnchorSpec[] = [
  { anchor: 'admin-panel', route: 'admin' },
  { anchor: 'user-management-page', route: 'admin' },
  // model-management-page / session-management-page / system-config-panel
  // are tabs inside admin — first-tab-by-default reaches user-management,
  // others would need a click. Cover those via runtime waitForAnchor.
]

// Tour 10 — Import/export (all dialogs; runtime-only).

const ALL_STATIC_ANCHORS: AnchorSpec[] = [
  ...TOUR_1,
  ...TOUR_2,
  ...TOUR_5,
  ...TOUR_8,
  ...TOUR_9,
]

test.describe('Tour anchors smoke', () => {
  test('every statically-reachable anchor for built-in tours resolves to at least one element', async ({
    page,
    annotationWorkspace,
    testVideo,
    testPersona,
    testEntityType,
    testUser,
  }) => {
    void testEntityType
    void testUser

    async function checkRoute(specs: AnchorSpec[]): Promise<void> {
      for (const { anchor, optional } of specs) {
        const count = await page.locator(`[data-tour-id="${anchor}"]`).count()
        if (optional) {
          expect(count, `optional anchor [data-tour-id="${anchor}"] must resolve to 0 or 1`).toBeLessThanOrEqual(1)
        } else {
          expect(count, `anchor [data-tour-id="${anchor}"] must resolve to >= 1`).toBeGreaterThanOrEqual(1)
        }
      }
    }

    // Home (video browser).
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await checkRoute(ALL_STATIC_ANCHORS.filter((a) => a.route === 'home'))

    // Annotation workspace.
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })
    await checkRoute(ALL_STATIC_ANCHORS.filter((a) => a.route === 'workspace'))

    // Ontology workspace. The TabsList anchor only mounts once a persona is
    // selected; click the seeded persona's Open button to enter the editor.
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')
    await page
      .locator(`[data-persona-id="${testPersona.id}"]`)
      .getByRole('button', { name: 'Open' })
      .click()
    await page.waitForSelector('[data-tour-id="ontology-workspace-tabs"]', { timeout: 5000 })
    await checkRoute(ALL_STATIC_ANCHORS.filter((a) => a.route === 'ontology'))

    // World / object workspace.
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')
    await checkRoute(ALL_STATIC_ANCHORS.filter((a) => a.route === 'world'))

    // Projects index.
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')
    await checkRoute(ALL_STATIC_ANCHORS.filter((a) => a.route === 'projects'))

    // Groups index.
    await page.goto('/groups')
    await page.waitForLoadState('networkidle')
    await checkRoute(ALL_STATIC_ANCHORS.filter((a) => a.route === 'groups'))

    // Shared annotations index.
    await page.goto('/shared')
    await page.waitForLoadState('networkidle')
    await checkRoute(ALL_STATIC_ANCHORS.filter((a) => a.route === 'shared'))

    // Admin panel — only reachable for admin users, which the
    // test fixture provisions by default.
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await checkRoute(ALL_STATIC_ANCHORS.filter((a) => a.route === 'admin'))
  })
})
