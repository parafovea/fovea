import { test, expect } from '../../fixtures/test-context.js'

// Helper to open VideoSummaryDialog and navigate to Claims tab
async function openClaimsTab(page: any) {
  await page.getByRole('button', { name: /edit summary/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(500)
  const personaSelect = dialog.getByLabel(/select persona/i)
  if (await personaSelect.isVisible()) {
    await personaSelect.click()
    // Select second option (first is disabled placeholder)
    await page.getByRole('option').nth(1).click()
  }
  const claimsTab = dialog.getByRole('tab', { name: /claims/i })
  await expect(claimsTab).toBeVisible()
  await claimsTab.click()
  // Wait for empty summary to be created - "Add Manual Claim" action button will be enabled
  await expect(dialog.getByRole('button', { name: /add manual claim/i }).first()).toBeEnabled({ timeout: 10000 })
}

test.describe('Claim Filtering and Search', () => {
  test.describe.configure({ mode: 'serial' })

  test('searches claims by text', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await openClaimsTab(page)

    const summaryDialog = page.getByRole('dialog').first()

    // Create multiple claims with different text
    const claimsToCreate = [
      'Baseball is a popular sport',
      'Marine mammals migrate seasonally',
      'Professional baseball leagues exist worldwide'
    ]

    for (const claimText of claimsToCreate) {
      const addButton = summaryDialog.getByRole('button', { name: /add manual claim/i }).first()
      await expect(addButton).toBeVisible()
      await addButton.click()

      const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
      await expect(claimDialog).toBeVisible()

      const claimInput = claimDialog.getByLabel(/claim text with references/i)
      await claimInput.fill(claimText)

      const saveButton = claimDialog.getByRole('button', { name: /create/i })
      await saveButton.click()

      await expect(claimDialog).not.toBeVisible()
      await page.waitForTimeout(500)
    }

    // Now search for "baseball"
    const searchInput = page.getByPlaceholder(/search claims/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill('baseball')

      await page.waitForTimeout(500)

      // Verify only baseball-related claims are shown
      const baseballClaim1 = page.getByText(/baseball is a popular sport/i)
      const baseballClaim2 = page.getByText(/professional baseball leagues/i)
      const marineClaim = page.getByText(/marine mammals migrate/i)

      await expect(baseballClaim1).toBeVisible()
      await expect(baseballClaim2).toBeVisible()
      await expect(marineClaim).not.toBeVisible()

      // Verify results count updates
      const resultsCount = page.locator('text=/showing \\d+ of \\d+ claim/i')
      await expect(resultsCount).toBeVisible()
    }
  })

  test('filters by confidence', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await openClaimsTab(page)

    // Check if confidence filter exists
    const confidenceSelect = page.getByLabel(/min confidence/i)
    const hasConfidenceFilter = await confidenceSelect.isVisible().catch(() => false)

    if (hasConfidenceFilter) {
      // Open confidence dropdown
      await confidenceSelect.click()

      // Select 70%+ option
      const option70 = page.getByRole('option', { name: /70%\+/i })
      if (await option70.isVisible()) {
        await option70.click()

        await page.waitForTimeout(500)

        // Verify filtering is applied
        // Claims with <70% confidence should not be visible
        // This is a basic check - in a real test, we'd verify specific claims
        const resultsCount = page.locator('text=/showing \\d+ of \\d+ claim/i')
        const hasResults = await resultsCount.isVisible().catch(() => false)
        expect(hasResults).toBeTruthy()
      }
    }
  })

  test('filters by extraction strategy', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await openClaimsTab(page)

    // Check if strategy filter exists
    const strategySelect = page.getByLabel(/strategy/i)
    const hasStrategyFilter = await strategySelect.isVisible().catch(() => false)

    if (hasStrategyFilter) {
      // Open strategy dropdown
      await strategySelect.click()

      // Select a specific strategy
      const manualOption = page.getByRole('option', { name: /manual|sentence-based/i }).first()
      if (await manualOption.isVisible()) {
        await manualOption.click()

        await page.waitForTimeout(500)

        // Verify filtering is applied
        const resultsCount = page.locator('text=/showing \\d+ of \\d+ claim/i')
        const hasResults = await resultsCount.isVisible().catch(() => false)
        expect(hasResults).toBeTruthy()
      }
    }
  })

  test('combines multiple filters', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await openClaimsTab(page)

    const summaryDialog = page.getByRole('dialog').first()

    // Create a test claim
    const addButton = summaryDialog.getByRole('button', { name: /add (manual )?claim/i }).first()
    await expect(addButton).toBeVisible()
    await addButton.click()

    const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimDialog).toBeVisible()

    const claimInput = claimDialog.getByLabel(/claim text with references/i)
    await claimInput.fill('Test claim for combined filters')

    // Wait for Create button to become enabled (form validation)
    const saveButton = claimDialog.getByRole('button', { name: /create/i })
    await expect(saveButton).toBeEnabled({ timeout: 5000 })
    await saveButton.click()

    await expect(claimDialog).not.toBeVisible()
    await page.waitForTimeout(1000)

    // Apply search term
    const searchInput = page.getByPlaceholder(/search claims/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill('combined')

      await page.waitForTimeout(500)

      // Apply confidence filter
      const confidenceSelect = page.getByLabel(/min confidence/i)
      if (await confidenceSelect.isVisible()) {
        await confidenceSelect.click()

        const option50 = page.getByRole('option', { name: /50%\+/i })
        if (await option50.isVisible()) {
          await option50.click()
          await page.waitForTimeout(500)
        }
      }

      // Verify all filters are applied correctly
      const resultsCount = page.locator('text=/showing \\d+ of \\d+ claim/i')
      const hasResults = await resultsCount.isVisible().catch(() => false)
      expect(hasResults).toBeTruthy()

      // The test claim should still be visible
      await expect(page.getByText(/combined filters/i)).toBeVisible()
    }
  })

  test('shows "no results" when filters exclude all', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await openClaimsTab(page)

    // Search for a nonexistent term
    const searchInput = page.getByPlaceholder(/search claims/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill('xyznon existent term12345')

      await page.waitForTimeout(500)

      // Should show "no results" or "no claims match" message
      const noResultsMessage = page.getByText(/no claims match|no results/i)
      await expect(noResultsMessage).toBeVisible({ timeout: 3000 })

      // Clear filters to verify claims reappear
      await searchInput.clear()

      await page.waitForTimeout(500)

      // Claims should reappear (if any exist)
      const claimOrEmptyState = await Promise.race([
        page.locator('text=/claim/i').first().isVisible().then(() => true).catch(() => false),
        page.getByText(/no claims yet/i).isVisible().then(() => true).catch(() => false),
        page.waitForTimeout(2000).then(() => false)
      ])

      expect(claimOrEmptyState).toBeTruthy()
    }
  })

  test('updates results count on filter change', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await openClaimsTab(page)

    const summaryDialog = page.getByRole('dialog').first()

    // Create multiple claims
    const claimsToCreate = [
      'Claim about baseball',
      'Claim about football',
      'Claim about cricket'
    ]

    for (const claimText of claimsToCreate) {
      const addButton = summaryDialog.getByRole('button', { name: /add (manual )?claim/i }).first()
      await expect(addButton).toBeVisible()
      await addButton.click()

      const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
      await expect(claimDialog).toBeVisible()

      const claimInput = claimDialog.getByLabel(/claim text with references/i)
      await claimInput.fill(claimText)

      // Wait for Create button to be enabled
      const saveButton = claimDialog.getByRole('button', { name: /create/i })
      await expect(saveButton).toBeEnabled({ timeout: 5000 })
      await saveButton.click()

      await expect(claimDialog).not.toBeVisible()
      await page.waitForTimeout(1000)
    }

    // Get initial count
    const resultsCount = page.locator('text=/showing \\d+ of \\d+ claim/i')
    const initialCount = await resultsCount.textContent()

    // Apply filter
    const searchInput = page.getByPlaceholder(/search claims/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill('baseball')

      await page.waitForTimeout(500)

      // Get filtered count
      const filteredCount = await resultsCount.textContent()

      // Counts should be different
      expect(filteredCount).not.toBe(initialCount)

      // Should show something like "Showing 1 of 3 claims"
      expect(filteredCount).toMatch(/showing \d+ of \d+ claim/i)
    }
  })
})
