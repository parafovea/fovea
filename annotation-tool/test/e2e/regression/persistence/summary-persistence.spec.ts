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

    // Select persona - use nth(1) to skip the disabled placeholder
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option').nth(1)
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Summary tab (should be default, but ensure it's selected)
    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab.click()
      await page.waitForTimeout(300)
    }

    // Find the summary editor textarea and enter content
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 5000 })
    await summaryTextarea.clear()
    await summaryTextarea.fill(uniqueSummaryText)

    // Wait for auto-save to complete
    await page.waitForTimeout(3000)

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

    // Re-select the same persona - use nth(1) to skip the disabled placeholder
    const personaSelect2 = dialog2.getByLabel(/select persona/i)
    if (await personaSelect2.isVisible()) {
      await personaSelect2.click()
      const personaOption2 = page.getByRole('option').nth(1)
      await personaOption2.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Summary tab
    const summaryTab2 = dialog2.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab2.click()
      await page.waitForTimeout(300)
    }

    // Wait for summary to load
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

    // Select persona - use nth(1) to skip the disabled placeholder
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option').nth(1)
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    // Enter original summary
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 5000 })
    await summaryTextarea.clear()
    await summaryTextarea.fill(originalText)
    await page.waitForTimeout(2000) // Wait for auto-save

    // Now edit the summary
    await summaryTextarea.clear()
    await summaryTextarea.fill(editedText)
    await page.waitForTimeout(3000) // Wait for auto-save

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

    // Re-select the same persona - use nth(1) to skip the disabled placeholder
    const personaSelect2 = dialog2.getByLabel(/select persona/i)
    if (await personaSelect2.isVisible()) {
      await personaSelect2.click()
      const personaOption2 = page.getByRole('option').nth(1)
      await personaOption2.click()
      await page.waitForTimeout(500)
    }

    await page.waitForTimeout(1000)

    // Verify edited text persists
    const summaryTextarea2 = dialog2.locator('textarea').first()
    await expect(summaryTextarea2).toBeVisible({ timeout: 5000 })
    await expect(summaryTextarea2).toHaveValue(editedText)
  })
})
