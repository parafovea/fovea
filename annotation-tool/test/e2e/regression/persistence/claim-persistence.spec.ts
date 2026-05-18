/**
 * @file claim-persistence.spec.ts
 * @description E2E tests verifying claims persist to database and survive page reloads.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { fillClaimEditor } from '../../utils/claim-editor.js'

test.describe('Claim Persistence', () => {
  test('claim persists after page reload', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
  }) => {
    const uniqueClaimText = `Test claim ${Date.now()} about persistence`

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
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      // Select the (only) persona option — shadcn's Select renders no disabled placeholder so the first role=option IS the active persona, unlike MUI which used a non-selectable placeholder at index 0
      const personaOption = page.getByRole('option').first()
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Claims tab
    const claimsTab = dialog.locator('[role="tab"]').filter({ hasText: 'Claims' })
    await expect(claimsTab).toBeVisible({ timeout: 10000 })
    await claimsTab.click()

    // Wait for Add Manual Claim button to be enabled
    await expect(
      dialog.getByRole('button', { name: /add manual claim/i }).first()
    ).toBeEnabled({ timeout: 10000 })

    // Click Add Manual Claim button
    const addClaimButton = dialog.getByRole('button', { name: /add manual claim/i }).first()
    await addClaimButton.click()

    // Wait for claim editor dialog
    const claimEditorDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimEditorDialog).toBeVisible({ timeout: 5000 })

    // Enter claim text
        await fillClaimEditor(claimEditorDialog, { text: uniqueClaimText })

    // Save the claim
    const saveButton = claimEditorDialog.getByRole('button', { name: /create|save/i })
    await expect(saveButton).toBeEnabled()
    await saveButton.click()

    // Wait for dialog to close and claim to appear
    await expect(claimEditorDialog).not.toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)
    await expect(page.getByText(uniqueClaimText)).toBeVisible({ timeout: 5000 })

    // Wait for auto-save to complete
    await page.waitForTimeout(2000)

    // Close the summary dialog
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
      const personaOption2 = page.getByRole('option').first()
      await personaOption2.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Claims tab
    const claimsTab2 = dialog2.locator('[role="tab"]').filter({ hasText: 'Claims' })
    await expect(claimsTab2).toBeVisible({ timeout: 10000 })
    await claimsTab2.click()

    // Wait for claims to load
    await page.waitForTimeout(1000)

    // Verify claim still exists (proving it was saved to database)
    await expect(page.getByText(uniqueClaimText)).toBeVisible({ timeout: 10000 })
  })

  test('edited claim persists after page reload', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
  }) => {
    const originalText = `Original claim ${Date.now()}`
    const editedText = `Edited claim ${Date.now()} with new content`

    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select the (only) persona option — shadcn's Select has no disabled placeholder
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option').first()
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Claims tab
    const claimsTab = dialog.locator('[role="tab"]').filter({ hasText: 'Claims' })
    await claimsTab.click()
    await expect(
      dialog.getByRole('button', { name: /add manual claim/i }).first()
    ).toBeEnabled({ timeout: 10000 })

    // Create a claim
    await dialog.getByRole('button', { name: /add manual claim/i }).first().click()
    const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimDialog).toBeVisible()
    await fillClaimEditor(claimDialog, { text: originalText })
    await claimDialog.getByRole('button', { name: /create|save/i }).click()
    await expect(claimDialog).not.toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Edit the claim
    const editButton = dialog.getByRole('button', { name: /edit claim/i }).first()
    await expect(editButton).toBeVisible({ timeout: 5000 })
    await editButton.click()

    const editClaimDialog = page.getByRole('dialog', { name: /edit claim/i })
    await expect(editClaimDialog).toBeVisible({ timeout: 5000 })
    await fillClaimEditor(editClaimDialog, { text: editedText })
    await editClaimDialog.getByRole('button', { name: /save/i }).click()
    await expect(editClaimDialog).not.toBeVisible({ timeout: 5000 })

    // Wait for auto-save
    await page.waitForTimeout(2000)

    // Close dialog and reload
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
      const personaOption2 = page.getByRole('option').first()
      await personaOption2.click()
      await page.waitForTimeout(500)
    }

    const claimsTab2 = dialog2.locator('[role="tab"]').filter({ hasText: 'Claims' })
    await claimsTab2.click()
    await page.waitForTimeout(1000)

    // Verify edited text persists, original does not
    await expect(page.getByText(editedText)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(originalText)).not.toBeVisible()
  })

  test('deleted claim stays deleted after page reload', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
  }) => {
    const claimToDelete = `Claim to delete ${Date.now()}`

    // Navigate and create a claim
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select the (only) persona option — shadcn's Select has no disabled placeholder
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option').first()
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    const claimsTab = dialog.locator('[role="tab"]').filter({ hasText: 'Claims' })
    await claimsTab.click()
    await expect(
      dialog.getByRole('button', { name: /add manual claim/i }).first()
    ).toBeEnabled({ timeout: 10000 })

    // Create the claim
    await dialog.getByRole('button', { name: /add manual claim/i }).first().click()
    const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimDialog).toBeVisible()
    await fillClaimEditor(claimDialog, { text: claimToDelete })
    await claimDialog.getByRole('button', { name: /create|save/i }).click()
    await expect(claimDialog).not.toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Verify claim exists
    await expect(page.getByText(claimToDelete)).toBeVisible({ timeout: 5000 })

    // Delete the claim
    page.on('dialog', (d) => d.accept())
    const deleteButton = dialog.getByRole('button', { name: /delete claim/i }).first()
    await expect(deleteButton).toBeVisible()
    await deleteButton.click()

    // Wait for deletion to complete
    await page.waitForTimeout(2000)

    // Verify claim is gone
    await expect(page.getByText(claimToDelete)).not.toBeVisible()

    // Close dialog and reload
    const closeButton = dialog.getByRole('button', { name: /close|done/i })
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click()
    }

    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back and verify deletion persisted
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog2 = page.getByRole('dialog')
    await expect(dialog2).toBeVisible()

    // Re-select the same persona - use nth(1) to skip the disabled placeholder
    const personaSelect2 = dialog2.getByLabel(/select persona/i)
    if (await personaSelect2.isVisible()) {
      await personaSelect2.click()
      const personaOption2 = page.getByRole('option').first()
      await personaOption2.click()
      await page.waitForTimeout(500)
    }

    const claimsTab2 = dialog2.locator('[role="tab"]').filter({ hasText: 'Claims' })
    await claimsTab2.click()
    await page.waitForTimeout(1000)

    // Verify claim stays deleted
    await expect(page.getByText(claimToDelete)).not.toBeVisible()
  })
})
