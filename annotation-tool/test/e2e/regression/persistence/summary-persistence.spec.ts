/**
 * @file summary-persistence.spec.ts
 * @description E2E tests verifying video summaries persist to database and survive page reloads.
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Summary Persistence', () => {
  test('summary content persists after page reload', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
  }) => {
    const uniqueSummaryText = `Test summary content ${Date.now()}`

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

    // Select the test persona by name
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option').filter({ hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' -') })
      await personaOption.click()
    }

    // Wait for all data to load and component to stabilize
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // The VideoSummaryDialog remembers the last active tab across opens,
    // so a prior test (claim-*, etc.) may have left Claims selected.
    // Explicitly switch to the Summary tab so the textarea lives in the
    // active tabpanel before we query for it.
    const summaryTab = dialog.getByRole('tab', { name: /^summary$/i })
    await expect(summaryTab).toBeVisible({ timeout: 5000 })
    await summaryTab.click()

    // Find the summary editor textarea
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 5000 })

    // Type content - use fill() which is faster
    await summaryTextarea.fill(uniqueSummaryText)

    // Verify the text was entered before continuing
    await expect(summaryTextarea).toHaveValue(uniqueSummaryText, { timeout: 1000 })

    // Wait for debounce (1000ms) plus save to complete
    await page.waitForTimeout(1500)

    // Wait for any pending network requests
    await page.waitForLoadState('networkidle')

    // Close the dialog
    const closeButton = dialog.getByRole('button', { name: /close|done/i })
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click()
      await page.waitForTimeout(500)
    }

    // Reload page to clear all client-side state
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back to the video
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Re-open video summary dialog
    const editSummaryButton2 = page.getByRole('button', { name: /edit summary/i })
    await expect(editSummaryButton2).toBeVisible({ timeout: 10000 })
    await editSummaryButton2.click()

    // Wait for dialog
    const dialog2 = page.getByRole('dialog')
    await expect(dialog2).toBeVisible()

    // Re-select the same persona by name
    const personaSelect2 = dialog2.getByLabel(/select persona/i)
    if (await personaSelect2.isVisible()) {
      await personaSelect2.click()
      const personaOption2 = page.getByRole('option').filter({ hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' -') })
      await personaOption2.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Summary tab
    const summaryTab2 = dialog2.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab2.click()
      await page.waitForTimeout(300)
    }

    // Wait for summary data to load from API
    await page.waitForTimeout(1000)

    // Verify summary content persisted
    const summaryTextarea2 = dialog2.locator('textarea').first()
    await expect(summaryTextarea2).toBeVisible({ timeout: 5000 })
    await expect(summaryTextarea2).toHaveValue(uniqueSummaryText)
  })

  test('summary edit persists after page reload', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
  }) => {
    const originalText = `Original summary ${Date.now()}`
    const editedText = `Edited summary ${Date.now()} with updated content`

    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open summary dialog and create initial summary
    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select the test persona by name
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option').filter({ hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' -') })
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    // Switch to Summary tab — the dialog remembers the last active
    // tab across opens, so a previous test may have left Claims active.
    const summaryTab2 = dialog.getByRole('tab', { name: /^summary$/i })
    await expect(summaryTab2).toBeVisible({ timeout: 5000 })
    await summaryTab2.click()

    // Find summary textarea
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 5000 })

    // Type original content character by character
    await summaryTextarea.click()
    await summaryTextarea.pressSequentially(originalText, { delay: 10 })

    // Wait for save
    await page.waitForTimeout(1500)
    await page.waitForLoadState('networkidle')

    // Clear and type edited content
    await summaryTextarea.click()
    await page.keyboard.press('Meta+a')
    await summaryTextarea.pressSequentially(editedText, { delay: 10 })

    // Wait for save
    await page.waitForTimeout(1500)
    await page.waitForLoadState('networkidle')

    // Close and reload
    const closeButton = dialog.getByRole('button', { name: /close|done/i })
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click()
    }

    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back and verify
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog2 = page.getByRole('dialog')
    await expect(dialog2).toBeVisible()

    // Re-select the same persona by name
    const personaSelect2 = dialog2.getByLabel(/select persona/i)
    if (await personaSelect2.isVisible()) {
      await personaSelect2.click()
      const personaOption2 = page.getByRole('option').filter({ hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' -') })
      await personaOption2.click()
      await page.waitForTimeout(500)
    }

    // Wait for summary data to load from API
    await page.waitForTimeout(1000)

    // Verify edited text persists
    const summaryTextarea2 = dialog2.locator('textarea').first()
    await expect(summaryTextarea2).toBeVisible({ timeout: 5000 })
    await expect(summaryTextarea2).toHaveValue(editedText)
  })
})
