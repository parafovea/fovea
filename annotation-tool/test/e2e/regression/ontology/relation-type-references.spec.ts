/**
 * @file relation-type-references.spec.ts
 * @description E2E tests for relation type references in summaries and glosses.
 * Tests that relation types can be referenced using the # syntax in GlossEditor.
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Relation Type References in Summaries', () => {
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

    // Select persona
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      // Find the persona option by name
      const personaOption = page.getByRole('option', { name: testPersona.name })
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Summary tab
    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab.click()
      await page.waitForTimeout(300)
    }

    // Find the summary editor textarea
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 5000 })

    // Clear and type text with # to trigger autocomplete
    await summaryTextarea.clear()
    await summaryTextarea.fill('This video shows ')
    await summaryTextarea.press('#')

    // Wait for autocomplete to appear
    const autocompleteList = page.locator('[role="listbox"], [role="list"]').first()
    await expect(autocompleteList).toBeVisible({ timeout: 5000 })

    // Verify "Relation Types" section is visible
    const relationTypesHeader = page.getByText('Relation Types')
    await expect(relationTypesHeader).toBeVisible({ timeout: 5000 })

    // Click on the relation type
    const relationTypeOption = page.getByRole('listitem').filter({ hasText: relationType.name })
    await relationTypeOption.click()

    // Verify the reference was inserted (should contain the relation type name in backticks)
    await expect(summaryTextarea).toHaveValue(new RegExp(`#\`${relationType.name}\``))

    // Wait for auto-save
    await page.waitForTimeout(3000)

    // Close the dialog
    const closeButton = dialog.getByRole('button', { name: /close|done/i })
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click()
      await page.waitForTimeout(500)
    }
  })

  test('relation type reference persists after page reload', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
    db,
  }) => {
    // Create a relation type to reference
    const relationType = await db.createRelationType(testPersona.id, {
      name: 'Manages',
      definition: 'A management relationship',
      sourceTypes: ['Person'],
      targetTypes: ['Team'],
    })

    const summaryWithReference = `This summary references #\`${relationType.name}\` relation type.`

    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select persona
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option', { name: testPersona.name })
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Summary tab
    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab.click()
      await page.waitForTimeout(300)
    }

    // Enter summary with relation type reference
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 5000 })
    await summaryTextarea.clear()
    await summaryTextarea.fill(summaryWithReference)

    // Wait for auto-save
    await page.waitForTimeout(3000)

    // Close dialog
    const closeButton = dialog.getByRole('button', { name: /close|done/i })
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click()
      await page.waitForTimeout(500)
    }

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back to video
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Re-open summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog2 = page.getByRole('dialog')
    await expect(dialog2).toBeVisible()

    // Re-select persona
    const personaSelect2 = dialog2.getByLabel(/select persona/i)
    if (await personaSelect2.isVisible()) {
      await personaSelect2.click()
      const personaOption2 = page.getByRole('option', { name: testPersona.name })
      await personaOption2.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Summary tab
    const summaryTab2 = dialog2.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab2.click()
      await page.waitForTimeout(300)
    }

    // Verify the relation type reference persisted
    await page.waitForTimeout(1000)
    const summaryTextarea2 = dialog2.locator('textarea').first()
    await expect(summaryTextarea2).toBeVisible({ timeout: 5000 })
    await expect(summaryTextarea2).toHaveValue(summaryWithReference)
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

    const summaryWithReference = `Testing #\`${relationType.name}\` reference.`

    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open video summary dialog
    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Select persona
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option', { name: testPersona.name })
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Summary tab
    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab.click()
      await page.waitForTimeout(300)
    }

    // Enter summary with relation type reference
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 5000 })
    await summaryTextarea.clear()
    await summaryTextarea.fill(summaryWithReference)

    // Wait for preview to update
    await page.waitForTimeout(500)

    // Verify the relation type reference renders as a chip in the preview
    // The preview should contain a Chip with the relation type name
    const previewSection = dialog.locator('text=Preview:').locator('..')
    const chip = previewSection.locator('.MuiChip-root', { hasText: relationType.name })
    await expect(chip).toBeVisible({ timeout: 5000 })
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

    // Select persona
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      const personaOption = page.getByRole('option', { name: testPersona.name })
      await personaOption.click()
      await page.waitForTimeout(500)
    }

    // Navigate to Summary tab
    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: /summary/i }).first()
    if (await summaryTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await summaryTab.click()
      await page.waitForTimeout(300)
    }

    // Type # to trigger autocomplete
    const summaryTextarea = dialog.locator('textarea').first()
    await expect(summaryTextarea).toBeVisible({ timeout: 5000 })
    await summaryTextarea.fill('#')

    // Wait for autocomplete to appear
    await page.waitForTimeout(500)

    // Verify both Entity Types and Relation Types sections are visible
    const entityTypesHeader = page.getByText('Entity Types')
    await expect(entityTypesHeader).toBeVisible({ timeout: 5000 })

    const relationTypesHeader = page.getByText('Relation Types')
    await expect(relationTypesHeader).toBeVisible({ timeout: 5000 })

    // Verify specific types are listed
    await expect(page.getByRole('listitem').filter({ hasText: entityType.name })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: relationType.name })).toBeVisible()
  })
})
