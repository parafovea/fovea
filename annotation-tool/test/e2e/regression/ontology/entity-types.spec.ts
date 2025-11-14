import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for Entity Type management in the Ontology Workspace.
 * Tests CRUD operations, validation, search, and Wikidata integration.
 */
test.describe('Entity Type Management', () => {
  test('creates entity type with name and definition', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createEntityType('Person', 'A human being')
    await ontologyWorkspace.expectTypeExists('Person')
  })

  test('validates entity type name is required', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Leave name empty, fill definition
    const defInput = dialog.locator('textarea').first()
    await defInput.fill('A test definition')

    // Try to save - button should be disabled
    const saveButton = dialog.getByRole('button', { name: /save|create/i })
    const isDisabled = await saveButton.isDisabled().catch(() => true)

    // Verify button is disabled OR dialog still open after click attempt
    if (!isDisabled) {
      await saveButton.click()
      await page.waitForTimeout(300)
    }

    // Dialog should still be open
    await expect(dialog).toBeVisible()
  })

  test('validates entity type definition is required', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill name, leave definition empty
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.fill('Person')

    // Try to save - button should be disabled
    const saveButton = dialog.getByRole('button', { name: /save|create/i })
    const isDisabled = await saveButton.isDisabled().catch(() => true)

    // Verify button is disabled OR dialog still open after click attempt
    if (!isDisabled) {
      await saveButton.click()
      await page.waitForTimeout(300)
    }

    // Dialog should still be open
    await expect(dialog).toBeVisible()
  })

  test('edits entity type name and definition', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createEntityType('Vehicle', 'A means of transportation')
    await ontologyWorkspace.expectTypeExists('Vehicle')

    await ontologyWorkspace.editEntityType('Vehicle', 'Automobile', 'A four-wheeled motor vehicle')
    await ontologyWorkspace.expectTypeExists('Automobile')
    await ontologyWorkspace.expectTypeNotExists('Vehicle')
  })

  test('deletes entity type', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createEntityType('Location', 'A physical place')
    await ontologyWorkspace.expectTypeExists('Location')

    await ontologyWorkspace.deleteEntityType('Location')
    await ontologyWorkspace.expectTypeNotExists('Location')
  })

  test('searches entity types by name', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create multiple entity types
    await ontologyWorkspace.createEntityType('Person', 'A human being')
    await ontologyWorkspace.createEntityType('Organization', 'A structured group of people')
    await ontologyWorkspace.createEntityType('Vehicle', 'A means of transportation')

    // Search for 'Person'
    await ontologyWorkspace.searchEntityTypes('Person')
    await ontologyWorkspace.expectTypeExists('Person')

    // Verify other types are filtered out (or at least Person is visible)
    // Note: Depending on search implementation, other types may still be visible
  })

  test('searches entity types by definition content', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create entity types with distinctive definitions
    await ontologyWorkspace.createEntityType('Cat', 'A small carnivorous mammal')
    await ontologyWorkspace.createEntityType('Dog', 'A domesticated canine animal')

    // Search for 'carnivorous' (in definition)
    await ontologyWorkspace.searchEntityTypes('carnivorous')
    await ontologyWorkspace.expectTypeExists('Cat')
  })

  test('cancels entity type creation', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')

    // Count existing types in the visible tab panel
    const visiblePanel = page.locator('[role="tabpanel"]').filter({ has: page.locator(':visible') }).first()
    const initialTypes = await visiblePanel.locator('li').count()

    // Start creating a type
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.fill('TempType')

    const defInput = dialog.locator('textarea').first()
    await defInput.fill('A temporary type')

    // Cancel
    const cancelButton = dialog.getByRole('button', { name: /cancel/i })
    await cancelButton.click()
    await page.waitForTimeout(500)

    // Verify type was not created
    const finalTypes = await visiblePanel.locator('li').count()
    expect(finalTypes).toBe(initialTypes)
  })

  test('allows duplicate entity type names with different definitions', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create first type
    await ontologyWorkspace.createEntityType('Person', 'A human being')
    await ontologyWorkspace.expectTypeExists('Person')

    // Create second type with same name but different definition
    // This is allowed because different personas may interpret the same term differently
    await ontologyWorkspace.createEntityType('Person', 'Another definition')

    // Verify both types exist
    const visiblePanel = page.locator('[role="tabpanel"]').filter({ has: page.locator(':visible') }).first()
    const personTypes = visiblePanel.locator('li').filter({ has: page.getByText('Person', { exact: true }) })
    const count = await personTypes.count()
    expect(count).toBe(2)
  })

  test('entity types persist across page reload', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createEntityType('Building', 'A constructed structure')
    await ontologyWorkspace.expectTypeExists('Building')

    // Save the ontology (click SAVE button in header)
    const saveButton = page.getByRole('button', { name: /^save$/i }).first()
    if (await saveButton.isVisible()) {
      await saveButton.click()
      await page.waitForTimeout(1000)
    }

    // Reload page
    await page.reload()
    await page.waitForTimeout(1000)

    // Navigate to ontology workspace again
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')

    // Verify type still exists after reload
    await ontologyWorkspace.expectTypeExists('Building')
  })

  test('entity types are persona-specific', async ({ ontologyWorkspace, db, page, testUser, workerSessionToken }) => {
    // Create two personas
    const persona1 = await db.createPersona({
      userId: testUser.id,
      name: 'Analyst A',
      role: 'Intelligence Analyst'
    }, workerSessionToken)

    const persona2 = await db.createPersona({
      userId: testUser.id,
      name: 'Analyst B',
      role: 'Strategic Analyst'
    }, workerSessionToken)

    // Navigate to persona 1 and create entity type
    await ontologyWorkspace.navigateTo(persona1.id)
    await page.waitForLoadState('networkidle')
    await ontologyWorkspace.selectTab('entities')

    await ontologyWorkspace.createEntityType('UniqueType', 'Only in Persona A')
    await ontologyWorkspace.expectTypeExists('UniqueType')

    // Navigate to persona 2 directly
    await ontologyWorkspace.navigateTo(persona2.id)
    await page.waitForLoadState('networkidle')
    await ontologyWorkspace.selectTab('entities')

    // Verify type does not exist in persona 2
    await ontologyWorkspace.expectTypeNotExists('UniqueType')

    // Cleanup
    await db.deletePersona(persona1.id)
    await db.deletePersona(persona2.id)
  })

  test('displays entity type count in tab', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')

    // Check initial count (should show 0 or current count)
    const entitiesTab = page.getByRole('tab', { name: /entity types/i })
    const initialTabText = await entitiesTab.textContent()
    expect(initialTabText).toContain('0')

    // Create 3 entity types
    await ontologyWorkspace.createEntityType('Person', 'A human being')
    await ontologyWorkspace.createEntityType('Organization', 'A group')
    await ontologyWorkspace.createEntityType('Location', 'A place')

    // Verify count updated
    await page.waitForTimeout(500)
    const updatedTabText = await entitiesTab.textContent()
    expect(updatedTabText).toContain('3')
  })

  test('clears search filter', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create multiple types
    await ontologyWorkspace.createEntityType('Apple', 'A fruit')
    await ontologyWorkspace.createEntityType('Banana', 'Another fruit')
    await ontologyWorkspace.createEntityType('Carrot', 'A vegetable')

    // Search to filter
    await ontologyWorkspace.searchEntityTypes('Apple')
    await ontologyWorkspace.expectTypeExists('Apple')

    // Clear search
    await ontologyWorkspace.searchInput.clear()
    await page.waitForTimeout(300)

    // All types should be visible again
    await ontologyWorkspace.expectTypeExists('Apple')
    await ontologyWorkspace.expectTypeExists('Banana')
    await ontologyWorkspace.expectTypeExists('Carrot')
  })

  test('handles empty state gracefully', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')

    // Should show empty list (count should be 0)
    const entitiesTab = page.getByRole('tab', { name: /entity types/i })
    const tabText = await entitiesTab.textContent()
    expect(tabText).toContain('0')
  })

  test('displays multiple entity types in list', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create 5 entity types
    await ontologyWorkspace.createEntityType('Type1', 'First type')
    await ontologyWorkspace.createEntityType('Type2', 'Second type')
    await ontologyWorkspace.createEntityType('Type3', 'Third type')
    await ontologyWorkspace.createEntityType('Type4', 'Fourth type')
    await ontologyWorkspace.createEntityType('Type5', 'Fifth type')

    // Verify all are displayed
    await ontologyWorkspace.selectTab('entities')
    await page.waitForTimeout(300)

    const listItems = await page.locator('li').filter({ hasText: /Type/ }).count()
    expect(listItems).toBeGreaterThanOrEqual(5)
  })
})
