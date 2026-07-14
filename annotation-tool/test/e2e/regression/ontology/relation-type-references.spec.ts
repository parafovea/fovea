/**
 * @file relation-type-references.spec.ts
 * @description E2E tests for relation type references in summaries and glosses.
 * Tests that relation types can be referenced using the # syntax in GlossEditor.
 */

import { test, expect } from '../../fixtures/test-context.js'

/**
 * Create a promise that resolves when a summary save API call completes.
 * Call this BEFORE performing actions that trigger saves, then await the returned promise.
 * @param page - Playwright page object
 * @param timeout - Maximum time to wait in milliseconds
 * @returns Promise that resolves when save API responds successfully
 */
function createSummarySavePromise(
  page: import('@playwright/test').Page,
  timeout = 15000
): Promise<import('@playwright/test').Response> {
  return page.waitForResponse(
    (response) => {
      const url = response.url()
      const method = response.request().method()
      const isSummaryEndpoint = url.includes('/api/summaries')
      const isSuccessStatus = response.status() === 200 || response.status() === 201
      const isSaveMethod = method === 'POST' || method === 'PUT'
      return isSummaryEndpoint && isSuccessStatus && isSaveMethod
    },
    { timeout }
  )
}

test.describe('Relation Type References in Summaries', () => {
  // These tests verify relation type references in the GlossEditor
  // component. GlossEditor previously raced its own `gloss` prop effect
  // against the parent's React Query auto-save: every onChange triggered
  // a parent re-render whose echoed `gloss` prop reset the local
  // `inputValue` via the [gloss, glossToString] effect, clobbering
  // characters the user had typed in the interim. With Playwright's
  // keyboard simulation firing keystrokes faster than the cache-
  // invalidation cycle settles, this surfaced as missing characters. The
  // fix tracks the most recently emitted gloss in a ref and suppresses
  // the prop-driven re-sync when the incoming gloss structurally matches
  // what we just emitted (see GlossEditor.tsx's `lastEmittedGlossRef`).
  //
  // The autocomplete popover derives its Entity/Relation Types sections
  // reactively from the persona ontology (a `useMemo` over the React
  // Query `activeOntology`), so once `#` is typed the popover repopulates
  // on its own the moment the ontology fetch lands. Every wait below is
  // therefore a web-first assertion on the rendered popover/section/
  // option (which auto-retries until the data arrives) or a
  // `waitForResponse` on the save/fetch — no fixed sleeps.

  test('can insert relation type reference in summary using autocomplete', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
    db,
  }) => {
    // Create a relation type to reference
    const relationType = await db.createRelationType(testPersona.id, {
      name: 'Employs',
      definition: 'An employment relationship',
      sourceTypes: ['Organization'],
      targetTypes: ['Person'],
    })

    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    const editSummaryButton = page.getByRole('button', { name: /edit summary/i })
    await expect(editSummaryButton).toBeVisible({ timeout: 10000 })
    await editSummaryButton.click()

    // Wait for dialog to open
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select the (only) persona option — shadcn's Select has no disabled placeholder
    const personaSelect = dialog.getByLabel(/select persona/i)
    await personaSelect.click()
    const personaOption = page.getByRole('option').first()
    await expect(personaOption).toBeVisible({ timeout: 10000 })
    await personaOption.click()

    // Navigate to Summary tab
    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab.click()
    }

    // Find the summary editor textarea
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 10000 })

    // Use Playwright's native typing which properly triggers React's synthetic events.
    // Focus the element first, then insert the trigger text.
    await summaryTextarea.click()
    await page.keyboard.insertText('This video shows #')

    // Wait for autocomplete popover to appear (GlossEditor renders an absolute-positioned bg-popover container).
    // The Relation Types section is derived from the persona ontology, so this assertion
    // auto-retries until the ontology fetch lands and the section renders.
    const autocompletePopper = dialog.locator('.bg-popover').first()
    await expect(autocompletePopper).toBeVisible({ timeout: 10000 })

    // Verify "Relation Types" section header is visible
    const relationTypesHeader = autocompletePopper.getByText('Relation Types', { exact: true })
    await expect(relationTypesHeader).toBeVisible({ timeout: 10000 })

    // Click on the relation type option
    const relationTypeOption = autocompletePopper.getByText(relationType.name, { exact: true })
    await expect(relationTypeOption).toBeVisible({ timeout: 10000 })
    await relationTypeOption.click()

    // Verify the reference was inserted (should contain the relation type name in backticks)
    await expect(summaryTextarea).toHaveValue(new RegExp(`#\`${relationType.name}\``), { timeout: 10000 })

    // Close the dialog
    const closeButton = dialog.getByRole('button', { name: /close|done/i })
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click()
    }
  })

  test('relation type reference persists after page reload', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
  }) => {
    // Use a simple text summary for persistence test
    const summaryText = `Test summary content ${Date.now()}`

    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select the (only) persona option — shadcn's Select has no disabled placeholder
    const personaSelect = dialog.getByLabel(/select persona/i)
    await personaSelect.click()
    const personaOption = page.getByRole('option').first()
    await expect(personaOption).toBeVisible({ timeout: 10000 })
    await personaOption.click()

    // Navigate to Summary tab
    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab.click()
    }

    // Find the summary editor textarea
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 10000 })

    // Create save promise BEFORE entering content
    const savePromise = createSummarySavePromise(page)

    // Use Playwright's native typing which properly triggers React's synthetic events
    await summaryTextarea.click()
    await page.keyboard.insertText(summaryText)

    // Wait for the debounced auto-save to reach the API
    await savePromise

    // Verify the value was saved
    await expect(summaryTextarea).toHaveValue(summaryText, { timeout: 10000 })

    // Close dialog and wait for it to unmount before reloading
    const closeButton = dialog.getByRole('button', { name: /close|done/i })
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click()
      await expect(dialog).toBeHidden({ timeout: 10000 })
    }

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back to video
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // The workspace persona persists across the reload (annotation UI store),
    // so the reopened dialog inherits it and fetches its summary the moment it
    // opens. Arm the GET wait BEFORE opening the dialog to observe that fetch
    // rather than racing it; re-selecting the same persona afterward is a no-op
    // that fires no second fetch, so an arm placed after the open would wait
    // forever for a request that already landed.
    const summariesLoaded = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/videos/${testVideo.id}/summaries`) &&
        resp.request().method() === 'GET' &&
        resp.status() === 200,
      { timeout: 10000 },
    )

    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog2 = page.getByRole('dialog')
    await expect(dialog2).toBeVisible()

    // Reassert the persona so the summary loads even if the dialog restored
    // none; when it did, this selects the same value and adds no second fetch.
    const personaSelect2 = dialog2.getByLabel(/select persona/i)
    await personaSelect2.click()
    const personaOption2 = page.getByRole('option').first()
    await expect(personaOption2).toBeVisible({ timeout: 10000 })
    await personaOption2.click()

    await summariesLoaded

    // Navigate to Summary tab
    const summaryTab2 = dialog2.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab2.click()
    }

    // Verify the summary text persisted
    const summaryTextarea2 = dialog2.locator('textarea').first()
    await expect(summaryTextarea2).toBeVisible({ timeout: 10000 })
    await expect(summaryTextarea2).toHaveValue(summaryText, { timeout: 10000 })
  })

  test('relation type reference renders as chip in preview', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
    db,
  }) => {
    // Create a relation type to reference
    const relationType = await db.createRelationType(testPersona.id, {
      name: 'Contains',
      definition: 'A containment relationship',
      sourceTypes: ['Location'],
      targetTypes: ['Entity'],
    })

    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select the (only) persona option — shadcn's Select has no disabled placeholder
    const personaSelect = dialog.getByLabel(/select persona/i)
    await personaSelect.click()
    const personaOption = page.getByRole('option').first()
    await expect(personaOption).toBeVisible({ timeout: 10000 })
    await personaOption.click()

    // Navigate to Summary tab
    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab.click()
    }

    // Find the summary editor textarea
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 10000 })

    // Use Playwright's native typing which properly triggers React's synthetic events
    await summaryTextarea.click()
    await page.keyboard.insertText('Testing #')

    // Wait for autocomplete popover to appear (its Relation Types section is
    // derived reactively from the ontology, so this auto-retries until it loads)
    const autocompletePopper = dialog.locator('.bg-popover').first()
    await expect(autocompletePopper).toBeVisible({ timeout: 10000 })

    // Click on the relation type in the autocomplete
    const relationTypeOption = autocompletePopper.getByText(relationType.name, { exact: true })
    await expect(relationTypeOption).toBeVisible({ timeout: 10000 })
    await relationTypeOption.click()

    // Continue typing
    await page.keyboard.type(' reference.')

    // Verify the relation type reference renders as a Badge in the preview (shadcn Badge spans).
    // Filter to badges (small inline-flex spans with rounded-4xl), excluding the autocomplete option text.
    const chip = dialog.locator('span.inline-flex').filter({ hasText: relationType.name })
    await expect(chip.first()).toBeVisible({ timeout: 10000 })
  })

  test('relation types appear in autocomplete alongside other types', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
    db,
  }) => {
    // Create multiple type categories to verify all appear in autocomplete
    const entityType = await db.createEntityType(testPersona.id, {
      name: 'TestEntity',
      definition: 'A test entity type',
    })
    const relationType = await db.createRelationType(testPersona.id, {
      name: 'TestRelation',
      definition: 'A test relation type',
      sourceTypes: ['Person'],
      targetTypes: ['Organization'],
    })

    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select the (only) persona option — shadcn's Select has no disabled placeholder
    const personaSelect = dialog.getByLabel(/select persona/i)
    await personaSelect.click()
    const personaOption = page.getByRole('option').first()
    await expect(personaOption).toBeVisible({ timeout: 10000 })
    await personaOption.click()

    // Navigate to Summary tab
    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab.click()
    }

    // Find the summary editor textarea and type # to trigger autocomplete
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 10000 })

    // Use Playwright's native typing which properly triggers React's synthetic events
    await summaryTextarea.click()
    await page.keyboard.insertText('#')

    // Wait for autocomplete popover to appear
    const autocompletePopper = dialog.locator('.bg-popover').first()
    await expect(autocompletePopper).toBeVisible({ timeout: 10000 })

    // Verify both Entity Types and Relation Types section headers are visible.
    // Both sections are derived reactively from the ontology, so these
    // assertions auto-retry until the fetch lands.
    const entityTypesHeader = autocompletePopper.getByText('Entity Types', { exact: true })
    await expect(entityTypesHeader).toBeVisible({ timeout: 10000 })

    const relationTypesHeader = autocompletePopper.getByText('Relation Types', { exact: true })
    await expect(relationTypesHeader).toBeVisible({ timeout: 10000 })

    // Verify specific types are listed within the popover
    await expect(autocompletePopper.getByText(entityType.name, { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(autocompletePopper.getByText(relationType.name, { exact: true })).toBeVisible({ timeout: 10000 })
  })
})
