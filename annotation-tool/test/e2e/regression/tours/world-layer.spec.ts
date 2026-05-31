/**
 * Tour 5 — "The world layer: instances, places, times" — end-to-end.
 *
 * Walks all 7 steps of Tour 5 through ObjectWorkspace. For each
 * world-state step that requires an editor (entity / location / time /
 * time-collection / collection), the test opens the editor via the
 * floating "+" FAB to make the tour's anchor resolve, then cancels out
 * (each editor's required-fields schema is complex enough that pure-UI
 * end-state assertions would dwarf the engine coverage we're after).
 * The final annotation-world-reference step gracefully Skips because
 * its anchor only mounts inside an open AnnotationEditor.
 *
 * Content per the microvent demo set: the videos depict baseball-game
 * incidents (Phillies-Karen at LoanDepot Park) so the running example
 * is "build LoanDepot Park as a Stadium / drop a pin in Miami / etc."
 * — narrative content; the test exercises the anchor + opens the
 * editor surface for each layer.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { microventContent } from '@/tours/content/microvent'

const TOUR_ID = 'world-layer'

declare global {
  interface Window {
    __foveaTour?: {
      launch: (tourId: string) => Promise<boolean>
      abandon: () => void
    }
  }
}

async function openTabAndOpenEditor(
  page: Awaited<ReturnType<typeof import('@playwright/test').chromium.launch>> extends never ? never : import('@playwright/test').Page,
  tabName: RegExp,
): Promise<void> {
  await page.getByRole('tab', { name: tabName }).click()
  await page.getByRole('button', { name: 'add', exact: true }).click()
}

async function advanceTo(
  page: import('@playwright/test').Page,
  targetStep: number,
  totalSteps: number,
): Promise<void> {
  // Wait until either the target step is showing OR the runner is on
  // a step strictly before the target (in which case we click Next/
  // Skip until we reach it). This tolerates expectAction='click' auto-
  // advances that may have happened during dialog interactions.
  const card = page.locator('[data-fovea-tour-step-card]')
  for (let attempt = 0; attempt < 6; attempt++) {
    const text = (await card
      .locator('text=/^\\d+\\s*\\/\\s*\\d+$/')
      .first()
      .textContent()
      .catch(() => '')) ?? ''
    const match = text.match(/^(\d+)\s*\//)
    const current = match ? Number(match[1]) : 0
    if (current >= targetStep) return
    const btn = card.getByRole('button', { name: /^(Next|Skip|Finish)$/ })
    if (!(await btn.isVisible({ timeout: 500 }).catch(() => false))) {
      await page.waitForTimeout(200)
      continue
    }
    await btn.click()
  }
  void totalSteps
  throw new Error(`failed to advance to step ${targetStep} of ${totalSteps}`)
}

async function dismissDialog(
  page: import('@playwright/test').Page,
  anchor: string,
): Promise<void> {
  const dialog = page.locator(`[data-tour-id="${anchor}"]`)
  if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
    const cancel = dialog.getByRole('button', { name: /^Cancel$/i }).first()
    if (await cancel.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cancel.click()
    } else {
      // Some editors have an X close button instead of Cancel.
      const closeBtn = dialog.getByRole('button', { name: /Close/i }).first()
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click()
      }
    }
    await expect(dialog).toBeHidden({ timeout: 5000 }).catch(() => {})
  }
}

test.describe('Tour 5: The world layer — end to end', () => {
  test('walks all seven steps opening editors for each world-state layer', async ({
    page,
    testUser,
    workerDb,
    workerUser,
    workerSessionToken,
  }) => {
    void testUser

    await workerDb.createPersona(
      {
        userId: workerUser.id,
        name: 'World Layer Tour Persona',
        role: 'Sports incidents analyst',
      },
      workerSessionToken,
    )

    // The world-layer tour is centred on /objects, but its narrative
    // ("Create entity 'LoanDepot Park'") references content from a
    // specific clip. Visit /annotate/{bundle.videoId} first so a
    // visitor switching back to the workspace sees the right venue
    // — then navigate to /objects to start the tour.
    const venueVideoId = microventContent.worldLayer.videoId
    await page.goto(`/annotate/${venueVideoId}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.goto('/objects')
    await page.waitForFunction(
      () => Boolean(window.__foveaTour),
      undefined,
      { timeout: 10000 },
    )
    await page.waitForSelector('[data-tour-id="world-panel-tabs"]', {
      timeout: 10000,
    })

    const ok = await page.evaluate(
      async (id) => Boolean(await window.__foveaTour?.launch(id)),
      TOUR_ID,
    )
    expect(ok, 'tour launched').toBe(true)
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card).toBeAttached({ timeout: 5000 })

    // step 1: world-panel-tabs informational
    await expect(card.locator('text=/^1\\s*\\/\\s*7$/')).toBeVisible()
    await card.getByRole('button', { name: 'Next' }).click()

    // step 2: entity-editor
    await expect(card.locator('text=/^2\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    await openTabAndOpenEditor(page, /^Entities/)
    await page.waitForSelector('[data-tour-id="entity-editor"]', {
      timeout: 5000,
    })
    await dismissDialog(page, 'entity-editor')
    await advanceTo(page, 3, 7)

    // step 3: location-map-picker
    await expect(card.locator('text=/^3\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    await openTabAndOpenEditor(page, /^Locations/)
    await page.waitForSelector('[data-tour-id="location-map-picker"]', {
      timeout: 5000,
    })
    await dismissDialog(page, 'location-map-picker')
    await advanceTo(page, 4, 7)

    // step 4: time-editor
    await expect(card.locator('text=/^4\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    await openTabAndOpenEditor(page, /^Times/)
    await page.waitForSelector('[data-tour-id="time-editor"]', {
      timeout: 5000,
    })
    await dismissDialog(page, 'time-editor')
    await advanceTo(page, 5, 7)

    // step 5: time-collection-builder. Collections tab now has three
    // explicit "+ X Collection" buttons; the "+ Time Pattern" one
    // opens the TimeCollectionEditorDialog which carries the
    // time-collection-builder anchor.
    await expect(card.locator('text=/^5\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    await page.getByRole('tab', { name: /^Collections/ }).click()
    await page
      .getByRole('button', { name: /\+ Time Pattern/ })
      .click()
    await page.waitForSelector('[data-tour-id="time-collection-builder"]', {
      timeout: 5000,
    })
    await dismissDialog(page, 'time-collection-builder')
    await advanceTo(page, 6, 7)

    // step 6: collection-builder (entity collection)
    await expect(card.locator('text=/^6\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    await page
      .getByRole('button', { name: /\+ Entity Collection/ })
      .click()
    await page.waitForSelector('[data-tour-id="collection-builder"]', {
      timeout: 5000,
    })
    await dismissDialog(page, 'collection-builder')
    await advanceTo(page, 7, 7)

    // step 7: annotation-world-reference (Skip)
    await expect(card.locator('text=/^7\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    const finishOrSkip = card.getByRole('button', { name: /^(Finish|Skip)$/ })
    await expect(finishOrSkip).toBeVisible({ timeout: 4500 })
    await finishOrSkip.click()
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
      timeout: 5000,
    })
  })
})
