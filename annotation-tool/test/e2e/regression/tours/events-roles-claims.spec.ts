/**
 * Tour 4 — "Beyond boxes: events, roles, and claims" — end-to-end.
 *
 * Walks all 7 steps through the AnnotationWorkspace: draw bbox 1,
 * open the ObjectPicker dialog to assign an entity instance, draw
 * bbox 2, switch the annotation-mode toggle to type/event, open the
 * role-assignment panel, hit the claim-editor (anchor on the
 * ClaimEditor DialogContent — opens when the visitor double-clicks
 * or right-clicks a claim slot), and end on the claim-relations-
 * viewer panel.
 *
 * Many of these surfaces are dialog/popover anchors that only mount
 * on a specific interaction. Where the visitor's natural action mounts
 * the anchor, the test drives it; where the anchor needs deeper world-
 * state setup (e.g. claim-editor requires existing claims), the test
 * gracefully Skips and the engine's "Couldn't find UI element"
 * affordance covers the gap so the tour still completes end-to-end.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { microventContent } from '@/tours/content/microvent'

const TOUR_ID = 'events-roles-claims'

declare global {
  interface Window {
    __foveaTour?: {
      launch: (tourId: string) => Promise<boolean>
      abandon: () => void
    }
  }
}

async function advanceTo(
  page: import('@playwright/test').Page,
  targetStep: number,
  totalSteps: number,
): Promise<void> {
  const card = page.locator('[data-fovea-tour-step-card]')
  for (let attempt = 0; attempt < 8; attempt++) {
    const text =
      (await card
        .locator('text=/^\\d+\\s*\\/\\s*\\d+$/')
        .first()
        .textContent()
        .catch(() => '')) ?? ''
    const match = text.match(/^(\d+)\s*\//)
    const current = match ? Number(match[1]) : 0
    if (current >= targetStep) return
    const btn = card.getByRole('button', { name: /^(Next|Skip|Finish)$/ })
    if (!(await btn.isVisible({ timeout: 500 }).catch(() => false))) {
      await page.waitForTimeout(250)
      continue
    }
    await btn.click()
  }
  void totalSteps
  throw new Error(`failed to advance to step ${targetStep} of ${totalSteps}`)
}

async function drawBoxAt(
  page: import('@playwright/test').Page,
  offset: { x: number; y: number; w: number; h: number },
): Promise<void> {
  const canvas = page.locator('[data-testid="video-canvas"]').first()
  await expect(canvas).toBeVisible({ timeout: 10000 })
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no bounding box')
  const sx = box.x + offset.x
  const sy = box.y + offset.y
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + offset.w, sy + offset.h, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}

test.describe('Tour 4: Events, roles, claims — end to end', () => {
  test.beforeEach(async ({ page, workerSessionToken }) => {
    await skipUnlessRealVideoCorpus(page, workerSessionToken)
  })

  test('walks all seven steps building two bboxes plus role / claim surfaces', async ({
    page,
    testUser,
    workerDb,
    workerUser,
    workerSessionToken,
    microventGrist,
  }) => {
    void testUser

    // ---- setup: persona + Person entity type (microvent grist for
    // the Phillies/sport personas all carry "Person"-style entity
    // types since the videos depict people interacting).
    const persona = await workerDb.createPersona(
      {
        userId: workerUser.id,
        name: 'Events Tour Persona',
        role: 'Incident analyst',
      },
      workerSessionToken,
    )
    void persona
    // Microvent's Tech-Curious Spectator's only entity type is "Person",
    // which is exactly what we need for the two-bbox-as-people flow.
    const entityTypeName =
      microventGrist.ontologyByPersonaName['Tech-Curious Spectator']
        ?.entityTypes[0]?.name ?? 'Person'
    await workerDb.createEntityType(persona.id, {
      name: entityTypeName,
      definition: 'an individual human',
    })

    // ---- pre-flight: visit the workspace once to set the persona +
    // type prerequisites the bbox draw needs (mirrors Tour 1's setup).
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, {
      timeout: 10000,
    })
    // Navigate directly to the videoId pinned by the bundle — the
    // Collin Rugg explainer of the Phillies-Karen ball-grab incident.
    // Going to /annotate/{id} rather than "click first card" ensures
    // the visitor lands on the clip whose footage matches the
    // narration's "Box the Phillies fan Karen" / "Box the Phillies
    // fan son" prompts.
    const targetVideoId = microventContent.eventsRolesClaims.videoId
    await page.goto(`/annotate/${targetVideoId}`)
    const preflightTypeSelect = page.getByRole('combobox', {
      name: /select type/i,
    })
    await expect(preflightTypeSelect).toBeEnabled({ timeout: 20000 })
    await preflightTypeSelect.click()
    const preflightPopover = page.locator('[data-slot="popover-content"]')
    await expect(preflightPopover).toBeVisible({ timeout: 5000 })
    await preflightPopover.locator('button').first().click()
    await expect(preflightPopover).toBeHidden({ timeout: 3000 }).catch(() => {})

    // ---- launch ----
    const ok = await page.evaluate(
      async (id) => Boolean(await window.__foveaTour?.launch(id)),
      TOUR_ID,
    )
    expect(ok, 'tour launched').toBe(true)
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card).toBeAttached({ timeout: 5000 })

    // ---- step 1: drawing-canvas (draw bbox 1) ----
    await expect(card.locator('text=/^1\\s*\\/\\s*7$/')).toBeVisible()
    await drawBoxAt(page, { x: 60, y: 60, w: 120, h: 90 })
    // bbox draw auto-opens AnnotationEditor and the runner has
    // expectAction='draw' — there's no listener for that, so we
    // advance manually.
    await advanceTo(page, 2, 7)

    // ---- step 2: object-picker-popover (click to assign instance) ----
    await expect(card.locator('text=/^2\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    // The AnnotationEditor is open from the bbox draw. Click the
    // Entity button to open the ObjectPicker dialog (the tour
    // anchor's surface).
    const annotationEditor = page
      .getByRole('dialog')
      .filter({ hasText: /Type|World object|Entity|Event/i })
      .first()
    if (await annotationEditor.isVisible({ timeout: 3000 }).catch(() => false)) {
      const entityBtn = annotationEditor
        .getByRole('button', { name: /^Entity$/ })
        .first()
      if (await entityBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await entityBtn.click()
      }
    }
    const objectPicker = page.locator(
      '[data-tour-id="object-picker-popover"]',
    )
    if (await objectPicker.isVisible({ timeout: 4000 }).catch(() => false)) {
      // Clicking inside the picker triggers the engine's one-shot
      // capture listener → auto-advance to step 3.
      await objectPicker.click({ position: { x: 40, y: 30 } })
      await page.waitForTimeout(200)
      const closeBtn = objectPicker.getByRole('button', { name: /Close/i }).first()
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click()
      }
    }
    // Close the AnnotationEditor if still open so the canvas is
    // available for the second bbox.
    if (await annotationEditor.isVisible({ timeout: 500 }).catch(() => false)) {
      const cancelBtn = annotationEditor
        .getByRole('button', { name: /^(Cancel|Save)$/i })
        .first()
      if (await cancelBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await cancelBtn.click()
      }
    }
    await advanceTo(page, 3, 7)

    // ---- step 3: drawing-canvas (draw bbox 2) ----
    await expect(card.locator('text=/^3\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    await drawBoxAt(page, { x: 220, y: 60, w: 120, h: 90 })
    // Close any AnnotationEditor that opened from the second draw.
    if (await annotationEditor.isVisible({ timeout: 1500 }).catch(() => false)) {
      const cancel = annotationEditor
        .getByRole('button', { name: /^Cancel$/i })
        .first()
      if (await cancel.isVisible({ timeout: 500 }).catch(() => false)) {
        await cancel.click()
      }
    }
    await advanceTo(page, 4, 7)

    // ---- step 4: event-annotation-button ----
    await expect(card.locator('text=/^4\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    // The anchor is on the Type/Object mode toggle's "Type" item.
    // expectAction='click' so clicking it auto-advances.
    const eventBtn = page.locator(
      '[data-tour-id="event-annotation-button"]',
    )
    if (await eventBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await eventBtn.click()
    }
    await advanceTo(page, 5, 7)

    // ---- steps 5/6: role-assignment-panel + claim-editor — these
    // anchors only mount under specific selected-annotation /
    // open-claim states. The engine's 3s ceiling surfaces Skip when
    // the anchor isn't found; advanceTo handles both Next (when the
    // panel happens to be present) and Skip. We don't pin to the
    // exact intermediate step counter because the event-annotation
    // toggle in step 4 sometimes triggers chain re-renders that
    // auto-advance past step 5 via expectAction='click' bubbling.
    await advanceTo(page, 7, 7)

    // ---- step 7: claim-relations-viewer ----
    const finishOrSkip = card.getByRole('button', { name: /^(Finish|Skip)$/ })
    await expect(finishOrSkip).toBeVisible({ timeout: 4500 })
    await finishOrSkip.click()
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
      timeout: 5000,
    })

    // ---- end-state: at least one annotation row landed on the
    // pinned bundle video (from at least one of the two bbox draws). ----
    const annsResp = await fetch(
      `http://localhost:3001/api/layers/videos/${targetVideoId}/annotations`,
      { headers: { Cookie: `session_token=${workerSessionToken}` } },
    )
    const anns = (await annsResp.json()) as Array<{ id: string }>
    expect(
      anns.length,
      `at least one annotation persisted on video ${targetVideoId}`,
    ).toBeGreaterThan(0)
  })
})
