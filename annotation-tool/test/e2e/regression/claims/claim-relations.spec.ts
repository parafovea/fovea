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

test.describe('Claim Relations', () => {
  test.describe.configure({ mode: 'serial' })

  test('creates relation between two claims', async ({
    page,
    testPersona,
    testVideo,
    testClaimRelationType,
    annotationWorkspace
  }) => {
    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)

    // First, ensure we have a summary with claims
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })
    await openClaimsTab(page)

    const summaryDialog = page.getByRole('dialog').first()

    // Create at least 2 claims for relation testing
    const claimsToCreate = [
      'The economy is growing',
      'Unemployment is decreasing'
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

    // Re-navigate to Claims tab (creating claims may have switched tabs)
    const claimsTab = summaryDialog.getByRole('tab', { name: /claims/i })
    await expect(claimsTab).toBeVisible()
    await claimsTab.click()

    // Verify we're actually on Claims tab by checking it's selected
    await expect(claimsTab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 })

    // Wait for claims to render
    await page.waitForTimeout(1000)

    // Verify claims are visible before trying to interact with them
    await expect(summaryDialog.getByText(/the economy is growing/i)).toBeVisible({ timeout: 5000 })

    // Click "Show relations" button on first claim
    const showRelationsButton = summaryDialog.getByRole('button', { name: /show relations/i }).first()
    await expect(showRelationsButton).toBeVisible({ timeout: 5000 })
    await showRelationsButton.click()

    // Wait for relations panel to load
    await page.waitForTimeout(1000)

    // Click "Add Relation" button
    const addRelationButton = page.getByRole('button', { name: /add relation/i })
    await expect(addRelationButton).toBeVisible({ timeout: 5000 })
    await addRelationButton.click()

    // Dialog should open with relation types
    const relationDialog = page.getByRole('dialog', { name: /create.*relation/i })
    await expect(relationDialog).toBeVisible({ timeout: 5000 })

    // Select relation type (should have "Supports" from testClaimRelationType)
    const relationTypeSelect = relationDialog.getByLabel(/relation type/i)
    await expect(relationTypeSelect).toBeVisible()
    await relationTypeSelect.click()
    await page.waitForTimeout(300)

    const supportsOption = page.getByRole('option', { name: /supports/i })
    await expect(supportsOption).toBeVisible()
    await supportsOption.click()

    // Select target claim using autocomplete
    const targetClaimInput = relationDialog.getByLabel(/target claim/i)
    await expect(targetClaimInput).toBeVisible()
    await targetClaimInput.click()
    await page.waitForTimeout(300)

    const firstClaimOption = page.getByRole('option').first()
    await expect(firstClaimOption).toBeVisible()
    await firstClaimOption.click()

    // Save the relation
    const saveButton = relationDialog.getByRole('button', { name: /save relation/i })
    await expect(saveButton).toBeEnabled({ timeout: 5000 })
    await saveButton.click()
    await page.waitForTimeout(1000)

    // Verify relation was created (dialog should close)
    await expect(relationDialog).not.toBeVisible({ timeout: 5000 })
  })

  test('displays outgoing and incoming relations separately', async ({
    page,
    testPersona,
    testVideo,
    testClaimRelationType,
    annotationWorkspace
  }) => {
    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await openClaimsTab(page)

    const summaryDialog = page.getByRole('dialog').first()

    // Create a single test claim
    const addButton = summaryDialog.getByRole('button', { name: /add manual claim/i }).first()
    await expect(addButton).toBeVisible()
    await addButton.click()

    const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimDialog).toBeVisible()

    const claimInput = claimDialog.getByLabel(/claim text with references/i)
    await claimInput.fill('Test claim for relations')

    const saveButton = claimDialog.getByRole('button', { name: /create/i })
    await saveButton.click()

    await expect(claimDialog).not.toBeVisible()
    await page.waitForTimeout(500)

    // Click "Show relations" button
    const showRelationsButton = summaryDialog.getByRole('button', { name: /show relations/i }).first()
    await expect(showRelationsButton).toBeVisible()
    await showRelationsButton.click()
    await page.waitForTimeout(2000) // Wait for relations to load

    // Check for outgoing/incoming sections or empty state
    const outgoingSection = page.locator('text=/outgoing/i')
    const incomingSection = page.locator('text=/incoming/i')

    // At least one section should be visible (even if empty)
    const hasOutgoing = await outgoingSection.isVisible({ timeout: 5000 }).catch(() => false)
    const hasIncoming = await incomingSection.isVisible({ timeout: 5000 }).catch(() => false)

    expect(hasOutgoing || hasIncoming).toBeTruthy()
  })

  test('deletes a claim relation', async ({
    page,
    testPersona,
    testVideo,
    testClaimRelationType,
    annotationWorkspace
  }) => {
    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await openClaimsTab(page)

    const summaryDialog = page.getByRole('dialog').first()

    // Create two claims for relation testing
    const claimsToCreate = ['Source claim', 'Target claim']
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

    // Re-navigate to Claims tab (creating claims may have switched tabs)
    const claimsTab = summaryDialog.getByRole('tab', { name: /claims/i })
    await expect(claimsTab).toBeVisible()
    await claimsTab.click()
    await page.waitForTimeout(1000)

    // Verify claims are visible
    await expect(summaryDialog.getByText(/source claim/i)).toBeVisible({ timeout: 5000 })
    await expect(summaryDialog.getByText(/target claim/i)).toBeVisible({ timeout: 5000 })

    // Click "Show relations" button on first claim
    const showRelationsButton = summaryDialog.getByRole('button', { name: /show relations/i }).first()
    await expect(showRelationsButton).toBeVisible({ timeout: 5000 })
    await showRelationsButton.click()
    await page.waitForTimeout(2000)

    // Create a relation
    const addRelationButton = page.getByRole('button', { name: /add relation/i })
    await expect(addRelationButton).toBeVisible()
    await addRelationButton.click()

    const relationDialog = page.getByRole('dialog', { name: /create claim relation/i })
    await expect(relationDialog).toBeVisible()

    // Select relation type
    const relationTypeSelect = relationDialog.getByLabel(/relation type/i)
    await relationTypeSelect.click()
    const supportsOption = page.getByRole('option', { name: /supports/i })
    await supportsOption.click()

    // Select target claim
    const targetClaimInput = relationDialog.getByLabel(/target claim/i)
    await targetClaimInput.click()
    const targetOption = page.getByRole('option').first()
    await targetOption.click()

    // Save relation
    const saveButton = relationDialog.getByRole('button', { name: /save relation/i })
    await expect(saveButton).toBeEnabled()
    await saveButton.click()
    await expect(relationDialog).not.toBeVisible()
    await page.waitForTimeout(1000)

    // Now delete the relation
    const deleteRelationButton = page.getByRole('button', { name: /delete.*relation/i }).first()
    await expect(deleteRelationButton).toBeVisible({ timeout: 5000 })

    // Set up dialog handler for confirmation
    page.on('dialog', dialog => dialog.accept())

    await deleteRelationButton.click()
    await page.waitForTimeout(1000)

    // Verify relation was deleted - delete button should not be visible anymore
    const relationStillExists = await deleteRelationButton.isVisible().catch(() => false)
    expect(relationStillExists).toBeFalsy()
  })

  test('validates relation type supports claim-to-claim', async ({
    page,
    testPersona,
    testVideo,
    testClaimRelationType,
    annotationWorkspace
  }) => {
    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    await openClaimsTab(page)

    const summaryDialog = page.getByRole('dialog').first()

    // Create a test claim
    const addButton = summaryDialog.getByRole('button', { name: /add manual claim/i }).first()
    await expect(addButton).toBeVisible()
    await addButton.click()

    const claimDialog = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimDialog).toBeVisible()

    const claimInput = claimDialog.getByLabel(/claim text with references/i)
    await claimInput.fill('Test claim')

    const saveButton = claimDialog.getByRole('button', { name: /create/i })
    await saveButton.click()

    await expect(claimDialog).not.toBeVisible()
    await page.waitForTimeout(500)

    // Click "Show relations" button
    const showRelationsButton = summaryDialog.getByRole('button', { name: /show relations/i }).first()
    await expect(showRelationsButton).toBeVisible()
    await showRelationsButton.click()
    await page.waitForTimeout(500)

    // Click "Add Relation" button
    const addRelationButton = page.getByRole('button', { name: /add relation/i })
    await expect(addRelationButton).toBeVisible({ timeout: 5000 })
    await addRelationButton.click()
    await page.waitForTimeout(1000)

    // Dialog should open
    const relationDialog = page.getByRole('dialog', { name: /create.*relation/i })
    await expect(relationDialog).toBeVisible({ timeout: 5000 })

    // Verify that claim-to-claim relation type "Supports" is available
    const relationTypeSelect = relationDialog.getByLabel(/relation type/i)
    await expect(relationTypeSelect).toBeVisible()
    await relationTypeSelect.click()
    await page.waitForTimeout(300)

    const supportsOption = page.getByRole('option', { name: /supports/i })
    await expect(supportsOption).toBeVisible()

    // Close dialog
    const cancelButton = relationDialog.getByRole('button', { name: /cancel/i })
    await cancelButton.click()
    await expect(relationDialog).not.toBeVisible()
  })
})
