import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for Event Type management in the Ontology Workspace.
 * Tests CRUD operations, validation, search, and temporal properties.
 */
test.describe('Event Type Management', () => {
  test('creates event type with name and definition', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createEventType('Meeting', 'A gathering of people for discussion')
    await ontologyWorkspace.selectTab('events')
    await ontologyWorkspace.expectTypeExists('Meeting')
  })

  test('validates event type name is required', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('events')
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Leave name empty, fill definition
    const defInput = dialog.locator('textarea').first()
    await defInput.fill('A test event definition')

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

  test('validates event type definition is required', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('events')
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill name, leave definition empty
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.fill('Conference')

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

  test('edits event type name and definition', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createEventType('Attack', 'A hostile action')
    await ontologyWorkspace.selectTab('events')
    await ontologyWorkspace.expectTypeExists('Attack')

    await ontologyWorkspace.editEventType('Attack', 'Assault', 'A violent physical attack')
    await ontologyWorkspace.expectTypeExists('Assault')
    await ontologyWorkspace.expectTypeNotExists('Attack')
  })

  test('deletes event type', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createEventType('Explosion', 'A sudden violent burst')
    await ontologyWorkspace.selectTab('events')
    await ontologyWorkspace.expectTypeExists('Explosion')

    await ontologyWorkspace.deleteEventType('Explosion')
    await ontologyWorkspace.expectTypeNotExists('Explosion')
  })

  test('searches event types by name', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create multiple event types
    await ontologyWorkspace.createEventType('Meeting', 'A gathering')
    await ontologyWorkspace.createEventType('Conference', 'A large meeting')
    await ontologyWorkspace.createEventType('Protest', 'A public demonstration')

    await ontologyWorkspace.selectTab('events')
    await page.waitForTimeout(300)

    // Search for 'Meeting'
    await ontologyWorkspace.searchInput.fill('Meeting')
    await page.waitForTimeout(300)

    await ontologyWorkspace.expectTypeExists('Meeting')
  })

  test('searches event types by definition content', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create event types with distinctive definitions
    await ontologyWorkspace.createEventType('Combat', 'A military engagement with hostile forces')
    await ontologyWorkspace.createEventType('Negotiation', 'A peaceful discussion')

    await ontologyWorkspace.selectTab('events')
    await page.waitForTimeout(300)

    // Search for 'military' (in definition)
    await ontologyWorkspace.searchInput.fill('military')
    await page.waitForTimeout(300)

    await ontologyWorkspace.expectTypeExists('Combat')
  })

  test('cancels event type creation', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('events')

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
    await nameInput.fill('TempEvent')

    const defInput = dialog.locator('textarea').first()
    await defInput.fill('A temporary event')

    // Cancel
    const cancelButton = dialog.getByRole('button', { name: /cancel/i })
    await cancelButton.click()
    await page.waitForTimeout(500)

    // Verify type was not created
    const finalTypes = await visiblePanel.locator('li').count()
    expect(finalTypes).toBe(initialTypes)
  })

  test('allows duplicate event type names with different definitions', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create first type
    await ontologyWorkspace.createEventType('Battle', 'A combat engagement')
    await ontologyWorkspace.selectTab('events')
    await ontologyWorkspace.expectTypeExists('Battle')

    // Create second type with same name but different definition
    // This is allowed because different personas may interpret the same term differently
    await ontologyWorkspace.createEventType('Battle', 'Another definition')

    // Verify both types exist
    const visiblePanel = page.locator('[role="tabpanel"]').filter({ has: page.locator(':visible') }).first()
    const battleTypes = visiblePanel.locator('li').filter({ has: page.getByText('Battle', { exact: true }) })
    const count = await battleTypes.count()
    expect(count).toBe(2)
  })

  test('event types persist across page reload', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createEventType('Incident', 'An event requiring attention')
    await ontologyWorkspace.expectTypeExists('Incident')

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
    await ontologyWorkspace.selectTab('events')

    // Verify type still exists after reload
    await ontologyWorkspace.expectTypeExists('Incident')
  })

  test('event types are persona-specific', async ({ ontologyWorkspace, db, page, testUser }) => {
    // Create two personas
    const persona1 = await db.createPersona({
      userId: testUser.id,
      name: 'Analyst A',
      role: 'Intelligence Analyst'
    })

    const persona2 = await db.createPersona({
      userId: testUser.id,
      name: 'Analyst B',
      role: 'Strategic Analyst'
    })

    // Navigate to persona 1 and create event type
    await ontologyWorkspace.navigateTo(persona1.id)
    await page.waitForLoadState('networkidle')
    await ontologyWorkspace.selectTab('events')

    await ontologyWorkspace.createEventType('UniqueEvent', 'Only in Persona A')
    await ontologyWorkspace.expectTypeExists('UniqueEvent')

    // Navigate to persona 2 directly
    await ontologyWorkspace.navigateTo(persona2.id)
    await page.waitForLoadState('networkidle')
    await ontologyWorkspace.selectTab('events')

    // Verify type does not exist in persona 2
    await ontologyWorkspace.expectTypeNotExists('UniqueEvent')

    // Cleanup
    await db.deletePersona(persona1.id)
    await db.deletePersona(persona2.id)
  })

  test('displays event type count in tab', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('events')

    const eventsTab = page.getByRole('tab', { name: /event types/i })
    const initialTabText = await eventsTab.textContent()
    expect(initialTabText).toContain('0')

    // Create 3 event types
    await ontologyWorkspace.createEventType('Meeting', 'A gathering')
    await ontologyWorkspace.createEventType('Conference', 'A large meeting')
    await ontologyWorkspace.createEventType('Rally', 'A mass gathering')

    await page.waitForTimeout(500)
    const updatedTabText = await eventsTab.textContent()
    expect(updatedTabText).toContain('3')
  })

  test('clears search filter', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create multiple types
    await ontologyWorkspace.createEventType('Alpha', 'First event')
    await ontologyWorkspace.createEventType('Beta', 'Second event')
    await ontologyWorkspace.createEventType('Gamma', 'Third event')

    await ontologyWorkspace.selectTab('events')

    // Search to filter
    await ontologyWorkspace.searchInput.fill('Alpha')
    await page.waitForTimeout(300)
    await ontologyWorkspace.expectTypeExists('Alpha')

    // Clear search
    await ontologyWorkspace.searchInput.clear()
    await page.waitForTimeout(300)

    // All should be visible
    await ontologyWorkspace.expectTypeExists('Alpha')
    await ontologyWorkspace.expectTypeExists('Beta')
    await ontologyWorkspace.expectTypeExists('Gamma')
  })

  test('handles empty state gracefully', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('events')

    const eventsTab = page.getByRole('tab', { name: /event types/i })
    const tabText = await eventsTab.textContent()
    expect(tabText).toContain('0')
  })

  test('displays multiple event types in list', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create 5 event types
    await ontologyWorkspace.createEventType('Event1', 'First')
    await ontologyWorkspace.createEventType('Event2', 'Second')
    await ontologyWorkspace.createEventType('Event3', 'Third')
    await ontologyWorkspace.createEventType('Event4', 'Fourth')
    await ontologyWorkspace.createEventType('Event5', 'Fifth')

    await ontologyWorkspace.selectTab('events')
    await page.waitForTimeout(300)

    const listItems = await page.locator('li').filter({ hasText: /Event/ }).count()
    expect(listItems).toBeGreaterThanOrEqual(5)
  })
})
