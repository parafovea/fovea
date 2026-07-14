import type { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test-context.js'
import { fillClaimEditor } from '../../utils/claim-editor.js'

/**
 * Deterministic waits for the claim mutation round-trips. The ClaimEditor
 * closes its dialog synchronously and fires the mutation in the background,
 * so each helper must be invoked BEFORE the save/delete click and awaited
 * after it — replacing the arbitrary `waitForTimeout` sleeps that previously
 * guessed at how long the request would take.
 */
function waitForClaimCreated(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/summaries\/[^/]+\/claims$/.test(new URL(r.url()).pathname) &&
      r.ok(),
    { timeout: 15000 },
  )
}

function waitForClaimUpdated(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === 'PUT' &&
      /\/api\/summaries\/[^/]+\/claims\/[^/]+$/.test(new URL(r.url()).pathname) &&
      r.ok(),
    { timeout: 15000 },
  )
}

function waitForClaimDeleted(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === 'DELETE' &&
      /\/api\/summaries\/[^/]+\/claims\/[^/]+$/.test(new URL(r.url()).pathname) &&
      r.ok(),
    { timeout: 15000 },
  )
}

test.describe('Manual Claim Management', () => {
  test.describe.configure({ mode: 'serial' })

  test('creates a manual claim', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
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

    // Select persona if not already selected
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      // Select the (only) persona option — shadcn's Select renders no disabled placeholder so the first role=option IS the active persona, unlike MUI which used a non-selectable placeholder at index 0
      const personaOption = page.getByRole('option').first()
      await personaOption.click()
    }

    // Navigate to Claims tab - MUI Tab with Badge may have varying accessible name
    const claimsTab = dialog.locator('[role="tab"]').filter({ hasText: 'Claims' })
    await expect(claimsTab).toBeVisible({ timeout: 10000 })
    await claimsTab.click()

    // Wait for empty summary to be created - "Add Manual Claim" action button will be enabled
    await expect(dialog.getByRole('button', { name: /add manual claim/i }).first()).toBeEnabled({ timeout: 10000 })

    // Click "Add Manual Claim" button (may be in empty state or as button)
    const addClaimButton = page.getByRole('button', { name: /add (manual )?claim/i }).first()
    if (await addClaimButton.isVisible()) {
      await addClaimButton.click()

      // Wait for claim editor dialog (be specific to avoid video player dialogs)
      const claimEditorDialog = page.getByRole('dialog', { name: /add manual claim/i })
      await expect(claimEditorDialog).toBeVisible({ timeout: 5000 })

      // Enter claim text + tick a modality checkbox so the shadcn
      // ClaimEditor's isValid (gloss + modality + confidence) is true
      // and Create becomes clickable. Default modality is audio.speech
      // (the most common modality for video claims).
      await fillClaimEditor(claimEditorDialog, { text: 'This is a test claim about baseball' })

      // Confidence defaults to 0.9 on mount; no adjustment needed.

      // Save the claim and wait for the create request to resolve so the
      // claims list is populated deterministically rather than after a sleep.
      const saveButton = claimEditorDialog.getByRole('button', { name: /create|save/i })
      await expect(saveButton).not.toBeDisabled()
      const created = waitForClaimCreated(page)
      await saveButton.click()
      await created

      // The editor closes and the new claim renders in the list.
      await expect(claimEditorDialog).not.toBeVisible({ timeout: 10000 })
      await expect(page.getByText(/test claim about baseball/i)).toBeVisible({ timeout: 10000 })
    }
  })

  test('edits existing claim', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    const editSummaryButton = page.getByRole('button', { name: /edit summary/i })
    await expect(editSummaryButton).toBeVisible({ timeout: 10000 })
    await editSummaryButton.click()

    // Wait for dialog and select persona
    const summaryDialog = page.getByRole('dialog')
    await expect(summaryDialog).toBeVisible()
    const personaSelect = summaryDialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option').first()
      await personaOption.click()
    }

    const claimsTab = summaryDialog.getByRole('tab', { name: /claims/i })
    await expect(claimsTab).toBeVisible()
    await claimsTab.click()

    // Wait for empty summary to be created - "Add Manual Claim" button will be enabled
    await expect(summaryDialog.getByRole('button', { name: /add manual claim/i }).first()).toBeEnabled({ timeout: 10000 })

    // Create a claim first
    const addButton = summaryDialog.getByRole('button', { name: /add manual claim/i }).first()
    await addButton.click()

    const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimDialog).toBeVisible()

        await fillClaimEditor(claimDialog, { text: 'Original claim text' })

    const saveButton = claimDialog.getByRole('button', { name: /create|save/i })
    const created = waitForClaimCreated(page)
    await saveButton.click()
    await created

    await expect(claimDialog).not.toBeVisible({ timeout: 10000 })
    // Wait for the created claim to render before editing it.
    await expect(summaryDialog.getByText(/original claim text/i)).toBeVisible({ timeout: 10000 })

    // Now edit the claim
    const editButton = summaryDialog.getByRole('button', { name: /edit claim/i }).first()
    await expect(editButton).toBeVisible({ timeout: 10000 })
    await editButton.click()

    const editClaimDialog = page.getByRole('dialog', { name: /edit claim/i })
    await expect(editClaimDialog).toBeVisible({ timeout: 10000 })

    // Modify the claim text
    await fillClaimEditor(editClaimDialog, { text: 'Modified claim text' })

    // Save changes and wait for the update request to resolve.
    const editSaveButton = editClaimDialog.getByRole('button', { name: /save/i })
    const updated = waitForClaimUpdated(page)
    await editSaveButton.click()
    await updated

    await expect(editClaimDialog).not.toBeVisible({ timeout: 10000 })
    // The edited text replaces the original in the claims list.
    await expect(summaryDialog.getByText(/modified claim text/i)).toBeVisible({ timeout: 10000 })
  })

  test('deletes claim', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const summaryDialog = page.getByRole('dialog')
    await expect(summaryDialog).toBeVisible()
    const personaSelect = summaryDialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      await page.getByRole('option').first().click()
    }

    const claimsTab = summaryDialog.getByRole('tab', { name: /claims/i })
    await expect(claimsTab).toBeVisible()
    await claimsTab.click()

    // Wait for empty summary to be created - "Add Manual Claim" button will be enabled
    await expect(summaryDialog.getByRole('button', { name: /add manual claim/i }).first()).toBeEnabled({ timeout: 10000 })

    // Create a claim to delete
    const addButton = summaryDialog.getByRole('button', { name: /add manual claim/i }).first()
    await addButton.click()

    const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimDialog).toBeVisible()

        await fillClaimEditor(claimDialog, { text: 'Claim to be deleted' })

    const saveButton = claimDialog.getByRole('button', { name: /create/i })
    const created = waitForClaimCreated(page)
    await saveButton.click()
    await created

    await expect(claimDialog).not.toBeVisible({ timeout: 10000 })
    // Wait for the claim to render before deleting it.
    await expect(summaryDialog.getByText(/claim to be deleted/i)).toBeVisible({ timeout: 10000 })

    // Click delete button
    const deleteButton = summaryDialog.getByRole('button', { name: /delete claim/i }).first()
    await expect(deleteButton).toBeVisible({ timeout: 10000 })

    // Set up dialog handler for confirmation
    page.on('dialog', dialog => dialog.accept())

    const deleted = waitForClaimDeleted(page)
    await deleteButton.click()
    await deleted

    // The claim is removed from the list once the delete request resolves.
    await expect(summaryDialog.getByText(/claim to be deleted/i)).toBeHidden({ timeout: 10000 })
  })

  test('adds subclaim to parent', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const summaryDialog = page.getByRole('dialog')
    await expect(summaryDialog).toBeVisible()
    const personaSelect = summaryDialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      await page.getByRole('option').first().click()
    }

    const claimsTab = summaryDialog.getByRole('tab', { name: /claims/i })
    await expect(claimsTab).toBeVisible()
    await claimsTab.click()

    // Wait for empty summary to be created - "Add Manual Claim" button will be enabled
    await expect(summaryDialog.getByRole('button', { name: /add manual claim/i }).first()).toBeEnabled({ timeout: 10000 })

    // Create a parent claim
    const addButton = summaryDialog.getByRole('button', { name: /add manual claim/i }).first()
    await addButton.click()

    const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimDialog).toBeVisible()

        await fillClaimEditor(claimDialog, { text: 'Parent claim' })

    let saveButton = claimDialog.getByRole('button', { name: /create/i })
    let created = waitForClaimCreated(page)
    await saveButton.click()
    await created

    await expect(claimDialog).not.toBeVisible({ timeout: 10000 })

    // Click "Add Subclaim" button — it renders on the parent claim's card.
    const addSubclaimButton = summaryDialog.getByRole('button', { name: /add subclaim/i }).first()
    await expect(addSubclaimButton).toBeVisible({ timeout: 10000 })
    await addSubclaimButton.click()

    const subclaimDialog = page.getByRole('dialog', { name: /add subclaim/i })
    await expect(subclaimDialog).toBeVisible({ timeout: 10000 })

    // Enter subclaim text
        await fillClaimEditor(subclaimDialog, { text: 'This is a subclaim' })

    // Save and wait for the subclaim create request to resolve.
    saveButton = subclaimDialog.getByRole('button', { name: /create/i })
    created = waitForClaimCreated(page)
    await saveButton.click()
    await created

    await expect(subclaimDialog).not.toBeVisible({ timeout: 10000 })

    // Switch to the Summary tab and back to remount the claims viewer so the
    // parent card re-reads the refreshed claims tree and shows its subclaim.
    // (The parent's ClaimTreeNode is memoized on claim.updatedAt, which does
    // not change when a child is added, so a remount is what surfaces it.)
    const summaryTab = summaryDialog.getByRole('tab', { name: /summary/i })
    await summaryTab.click()
    await expect(summaryTab).toHaveAttribute('aria-selected', 'true')
    await claimsTab.click()
    await expect(claimsTab).toHaveAttribute('aria-selected', 'true')

    // The parent claim now carries a subclaim, shown as a "1 subclaim" badge.
    await expect(summaryDialog.getByText(/1 subclaim/i)).toBeVisible({ timeout: 10000 })
  })

  test('cascade deletes subclaims', async ({
    page,
    testVideo,
    testPersona,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const summaryDialog = page.getByRole('dialog')
    await expect(summaryDialog).toBeVisible()
    const personaSelect = summaryDialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      await page.getByRole('option').first().click()
    }

    const claimsTab = summaryDialog.getByRole('tab', { name: /claims/i })
    await expect(claimsTab).toBeVisible()
    await claimsTab.click()

    // Wait for empty summary to be created - "Add Manual Claim" button will be enabled
    await expect(summaryDialog.getByRole('button', { name: /add manual claim/i }).first()).toBeEnabled({ timeout: 10000 })

    // Create parent claim
    const addButton = summaryDialog.getByRole('button', { name: /add manual claim/i }).first()
    await expect(addButton).toBeVisible()
    await addButton.click()

    const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimDialog).toBeVisible()

        await fillClaimEditor(claimDialog, { text: 'Parent to be deleted' })

    let saveButton = claimDialog.getByRole('button', { name: /create/i })
    let created = waitForClaimCreated(page)
    await saveButton.click()
    await created

    await expect(claimDialog).not.toBeVisible({ timeout: 10000 })

    // Add subclaim
    const addSubclaimButton = summaryDialog.getByRole('button', { name: /add subclaim/i }).first()
    await expect(addSubclaimButton).toBeVisible({ timeout: 10000 })
    await addSubclaimButton.click()

    const subclaimDialog = page.getByRole('dialog', { name: /add subclaim/i })
    await expect(subclaimDialog).toBeVisible({ timeout: 10000 })

        await fillClaimEditor(subclaimDialog, { text: 'Subclaim to be cascade deleted' })

    saveButton = subclaimDialog.getByRole('button', { name: /create/i })
    created = waitForClaimCreated(page)
    await saveButton.click()
    await created

    await expect(subclaimDialog).not.toBeVisible({ timeout: 10000 })

    // Delete the parent claim; the confirm() prompt is auto-accepted.
    const deleteButton = summaryDialog.getByRole('button', { name: /delete claim/i }).first()
    await expect(deleteButton).toBeVisible({ timeout: 10000 })

    page.on('dialog', dialog => dialog.accept())
    const deleted = waitForClaimDeleted(page)
    await deleteButton.click()
    await deleted

    // The parent is removed once the delete resolves; its subclaim cascades
    // with it, so neither text remains in the claims viewer.
    await expect(summaryDialog.getByText(/parent to be deleted/i)).toBeHidden({ timeout: 10000 })
    await expect(summaryDialog.getByText(/subclaim to be cascade deleted/i)).toBeHidden({ timeout: 10000 })
  })
})
