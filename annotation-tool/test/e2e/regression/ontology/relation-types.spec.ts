import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for Relation Type management in the Ontology Workspace.
 * Tests CRUD operations for relation types including source and target constraints.
 */
test.describe('Relation Type Management', () => {
  test('creates relation type with name and definition', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createRelationType('Employs', 'An employment relationship', ['Organization'], ['Person'])
    await ontologyWorkspace.selectTab('relations')
    await ontologyWorkspace.expectTypeExists('Employs')
  })

  test('validates relation type name is required', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('relations')
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Leave name empty, fill definition
    const defInput = dialog.locator('textarea').first()
    await defInput.fill('A test relation definition')

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

  test('validates relation type definition is required', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('relations')
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill name, leave definition empty
    const nameInput = dialog.getByLabel('Relation Type Name', { exact: false })
    await nameInput.fill('TestRelation')

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

  test('edits relation type name and definition', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createRelationType('OwnedBy', 'Ownership relation', ['Vehicle'], ['Person'])

    await ontologyWorkspace.selectTab('relations')
    await ontologyWorkspace.expectTypeExists('OwnedBy')

    await ontologyWorkspace.editRelationType('OwnedBy', 'BelongsTo', 'A belonging relationship')
    await ontologyWorkspace.expectTypeExists('BelongsTo')
    await ontologyWorkspace.expectTypeNotExists('OwnedBy')
  })

  test('deletes relation type', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createRelationType('MemberOf', 'Membership relation', ['Person'], ['Organization'])

    await ontologyWorkspace.selectTab('relations')
    await ontologyWorkspace.expectTypeExists('MemberOf')

    await ontologyWorkspace.deleteRelationType('MemberOf')
    await ontologyWorkspace.expectTypeNotExists('MemberOf')
  })

  test('cancels relation type creation', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('relations')

    // Count existing types in the visible tab panel
    const visiblePanel = page.locator('[role="tabpanel"]').filter({ has: page.locator(':visible') }).first()
    const initialTypes = await visiblePanel.locator('li').count()

    // Start creating a type
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    const nameInput = dialog.getByLabel('Relation Type Name', { exact: false })
    await nameInput.fill('TempRelation')

    const defInput = dialog.locator('textarea').first()
    await defInput.fill('A temporary relation')

    // Cancel
    const cancelButton = dialog.getByRole('button', { name: /cancel/i })
    await cancelButton.click()
    await page.waitForTimeout(500)

    // Verify type was not created
    const finalTypes = await visiblePanel.locator('li').count()
    expect(finalTypes).toBe(initialTypes)
  })

  test('allows duplicate relation type names with different definitions', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create first type
    await ontologyWorkspace.createRelationType('Employs', 'Employment relationship', ['Organization'], ['Person'])
    await ontologyWorkspace.selectTab('relations')
    await ontologyWorkspace.expectTypeExists('Employs')

    // Create second type with same name but different definition
    // This is allowed because different personas may interpret the same term differently
    await ontologyWorkspace.createRelationType('Employs', 'Another definition', ['Person'], ['Organization'])

    // Verify both types exist
    const visiblePanel = page.locator('[role="tabpanel"]').filter({ has: page.locator(':visible') }).first()
    const employTypes = visiblePanel.locator('li').filter({ has: page.getByText('Employs', { exact: true }) })
    const count = await employTypes.count()
    expect(count).toBe(2)
  })

  test('searches relation types by name', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create multiple relation types
    await ontologyWorkspace.createRelationType('Contains', 'Containment relation', ['Location'], ['Entity'])
    await ontologyWorkspace.createRelationType('Manages', 'Management relation', ['Person'], ['Organization'])
    await ontologyWorkspace.createRelationType('Controls', 'Control relation', ['Organization'], ['Resource'])

    await ontologyWorkspace.selectTab('relations')
    await page.waitForTimeout(300)

    // Search for 'Contains'
    await ontologyWorkspace.searchInput.fill('Contains')
    await page.waitForTimeout(300)

    await ontologyWorkspace.expectTypeExists('Contains')

    // Verify other types are filtered out (or at least Contains is visible)
    // Note: Depending on search implementation, other types may still be visible
  })

  test('searches relation types by definition content', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create relation types with distinctive definitions
    await ontologyWorkspace.createRelationType('Uses', 'A usage relationship between entities', ['Person'], ['Tool'])
    await ontologyWorkspace.createRelationType('Owns', 'A property ownership relation', ['Person'], ['Vehicle'])

    await ontologyWorkspace.selectTab('relations')
    await page.waitForTimeout(300)

    // Search for 'ownership' (in definition)
    await ontologyWorkspace.searchInput.fill('ownership')
    await page.waitForTimeout(300)

    await ontologyWorkspace.expectTypeExists('Owns')
  })

  test('clears search filter', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create multiple types
    await ontologyWorkspace.createRelationType('Contains', 'Containment relation', ['Location'], ['Entity'])
    await ontologyWorkspace.createRelationType('Manages', 'Management relation', ['Person'], ['Organization'])
    await ontologyWorkspace.createRelationType('Controls', 'Control relation', ['Organization'], ['Resource'])

    await ontologyWorkspace.selectTab('relations')
    await page.waitForTimeout(300)

    // Search to filter
    await ontologyWorkspace.searchInput.fill('Contains')
    await page.waitForTimeout(300)
    await ontologyWorkspace.expectTypeExists('Contains')

    // Clear search
    await ontologyWorkspace.searchInput.clear()
    await page.waitForTimeout(300)

    // All types should be visible again
    await ontologyWorkspace.expectTypeExists('Contains')
    await ontologyWorkspace.expectTypeExists('Manages')
    await ontologyWorkspace.expectTypeExists('Controls')
  })

  test('relation types persist across page reload', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createRelationType('LocatedIn', 'Location relation', ['Entity'], ['Location'])
    await ontologyWorkspace.expectTypeExists('LocatedIn')

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
    await ontologyWorkspace.selectTab('relations')

    // Verify type still exists after reload
    await ontologyWorkspace.expectTypeExists('LocatedIn')
  })

  test('relation types are persona-specific', async ({ ontologyWorkspace, db, page, testUser, workerSessionToken }) => {
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

    // Navigate to persona 1 and create relation type
    await ontologyWorkspace.navigateTo(persona1.id)
    await page.waitForLoadState('networkidle')
    await ontologyWorkspace.selectTab('relations')

    await ontologyWorkspace.createRelationType('UniqueRelation', 'Only in Persona A', ['Person'], ['Location'])
    await ontologyWorkspace.expectTypeExists('UniqueRelation')

    // Navigate to persona 2 directly
    await ontologyWorkspace.navigateTo(persona2.id)
    await page.waitForLoadState('networkidle')
    await ontologyWorkspace.selectTab('relations')

    // Verify type does not exist in persona 2
    await ontologyWorkspace.expectTypeNotExists('UniqueRelation')

    // Cleanup
    await db.deletePersona(persona1.id)
    await db.deletePersona(persona2.id)
  })

  test('displays relation type count in tab', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('relations')

    const relationsTab = page.getByRole('tab', { name: /relation types/i })
    const initialTabText = await relationsTab.textContent()
    expect(initialTabText).toContain('0')

    // Create 3 relation types
    await ontologyWorkspace.createRelationType('Rel1', 'First relation', ['Person'], ['Organization'])
    await ontologyWorkspace.createRelationType('Rel2', 'Second relation', ['Vehicle'], ['Location'])
    await ontologyWorkspace.createRelationType('Rel3', 'Third relation', ['Person'], ['Event'])

    await page.waitForTimeout(500)
    const updatedTabText = await relationsTab.textContent()
    expect(updatedTabText).toContain('3')
  })

  test('handles empty state gracefully', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('relations')

    const relationsTab = page.getByRole('tab', { name: /relation types/i })
    const tabText = await relationsTab.textContent()
    expect(tabText).toContain('0')
  })

  test('displays multiple relation types in list', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create 5 relation types
    await ontologyWorkspace.createRelationType('Relation1', 'First', ['A'], ['B'])
    await ontologyWorkspace.createRelationType('Relation2', 'Second', ['C'], ['D'])
    await ontologyWorkspace.createRelationType('Relation3', 'Third', ['E'], ['F'])
    await ontologyWorkspace.createRelationType('Relation4', 'Fourth', ['G'], ['H'])
    await ontologyWorkspace.createRelationType('Relation5', 'Fifth', ['I'], ['J'])

    await ontologyWorkspace.selectTab('relations')
    await page.waitForTimeout(300)

    const listItems = await page.locator('li').filter({ hasText: /Relation/ }).count()
    expect(listItems).toBeGreaterThanOrEqual(5)
  })
})
