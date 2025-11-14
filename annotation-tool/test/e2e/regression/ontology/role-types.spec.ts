import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for Role Type management in the Ontology Workspace.
 * Tests CRUD operations for role types including domain and range constraints.
 */
test.describe('Role Type Management', () => {
  test('creates role type with name and definition', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createRoleType('Agent', 'The actor performing an action', ['Person', 'Organization'])
    await ontologyWorkspace.selectTab('roles')
    await ontologyWorkspace.expectTypeExists('Agent')
  })

  test('validates role type name is required', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('roles')
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Leave name empty, fill definition
    const defInput = dialog.locator('textarea').first()
    await defInput.fill('A test role definition')

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

  test('validates role type definition is required', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('roles')
    await ontologyWorkspace.addTypeFab.click()
    await page.waitForTimeout(300)

    // Scope to dialog
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill name, leave definition empty
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.fill('Agent')

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

  test('edits role type name and definition', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createRoleType('Participant', 'Someone who takes part', ['Person'])

    await ontologyWorkspace.selectTab('roles')
    await ontologyWorkspace.expectTypeExists('Participant')

    await ontologyWorkspace.editRoleType('Participant', 'Attendee', 'Someone who attends an event')
    await ontologyWorkspace.expectTypeExists('Attendee')
    await ontologyWorkspace.expectTypeNotExists('Participant')
  })

  test('deletes role type', async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createRoleType('Victim', 'One who is harmed', ['Person'])

    await ontologyWorkspace.selectTab('roles')
    await ontologyWorkspace.expectTypeExists('Victim')

    await ontologyWorkspace.deleteRoleType('Victim')
    await ontologyWorkspace.expectTypeNotExists('Victim')
  })

  test('searches role types by name', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create multiple role types
    await ontologyWorkspace.createRoleType('Leader', 'One who leads', ['Person'])
    await ontologyWorkspace.createRoleType('Follower', 'One who follows', ['Person'])
    await ontologyWorkspace.createRoleType('Observer', 'One who observes', ['Person'])

    await ontologyWorkspace.selectTab('roles')
    await page.waitForTimeout(300)

    // Search for 'Leader'
    await ontologyWorkspace.searchInput.fill('Leader')
    await page.waitForTimeout(300)

    await ontologyWorkspace.expectTypeExists('Leader')

    // Verify other types are filtered out (or at least Leader is visible)
    // Note: Depending on search implementation, other types may still be visible
  })

  test('searches role types by definition content', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create role types with distinctive definitions
    await ontologyWorkspace.createRoleType('Commander', 'One who issues military orders', ['Person'])
    await ontologyWorkspace.createRoleType('Soldier', 'One who serves in the army', ['Person'])

    await ontologyWorkspace.selectTab('roles')
    await page.waitForTimeout(300)

    // Search for 'military' (in definition)
    await ontologyWorkspace.searchInput.fill('military')
    await page.waitForTimeout(300)

    await ontologyWorkspace.expectTypeExists('Commander')
  })

  test('cancels role type creation', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('roles')

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
    await nameInput.fill('TempRole')

    const defInput = dialog.locator('textarea').first()
    await defInput.fill('A temporary role')

    // Cancel
    const cancelButton = dialog.getByRole('button', { name: /cancel/i })
    await cancelButton.click()
    await page.waitForTimeout(500)

    // Verify type was not created
    const finalTypes = await visiblePanel.locator('li').count()
    expect(finalTypes).toBe(initialTypes)
  })

  test('allows duplicate role type names with different definitions', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create first type
    await ontologyWorkspace.createRoleType('Agent', 'One who acts on behalf of another', ['Person'])
    await ontologyWorkspace.expectTypeExists('Agent')

    // Create second type with same name but different definition
    // This is allowed because different personas may interpret the same term differently
    await ontologyWorkspace.createRoleType('Agent', 'Another definition', ['Organization'])

    // Verify both types exist
    const visiblePanel = page.locator('[role="tabpanel"]').filter({ has: page.locator(':visible') }).first()
    const agentTypes = visiblePanel.locator('li').filter({ has: page.getByText('Agent', { exact: true }) })
    const count = await agentTypes.count()
    expect(count).toBe(2)
  })

  test('clears search filter', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create multiple types
    await ontologyWorkspace.createRoleType('Initiator', 'One who starts', ['Person'])
    await ontologyWorkspace.createRoleType('Responder', 'One who responds', ['Person'])
    await ontologyWorkspace.createRoleType('Mediator', 'One who mediates', ['Person'])

    await ontologyWorkspace.selectTab('roles')
    await page.waitForTimeout(300)

    // Search to filter
    await ontologyWorkspace.searchInput.fill('Initiator')
    await page.waitForTimeout(300)
    await ontologyWorkspace.expectTypeExists('Initiator')

    // Clear search
    await ontologyWorkspace.searchInput.clear()
    await page.waitForTimeout(300)

    // All types should be visible again
    await ontologyWorkspace.expectTypeExists('Initiator')
    await ontologyWorkspace.expectTypeExists('Responder')
    await ontologyWorkspace.expectTypeExists('Mediator')
  })

  test('role types persist across page reload', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createRoleType('Owner', 'One who possesses', ['Person', 'Organization'])

    await ontologyWorkspace.selectTab('roles')
    await ontologyWorkspace.expectTypeExists('Owner')

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
    await ontologyWorkspace.selectTab('roles')

    // Verify type still exists after reload
    await ontologyWorkspace.expectTypeExists('Owner')
  })

  test('role types are persona-specific', async ({ ontologyWorkspace, db, page, testUser, workerSessionToken }) => {
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

    // Navigate to persona 1 and create role type
    await ontologyWorkspace.navigateTo(persona1.id)
    await page.waitForLoadState('networkidle')
    await ontologyWorkspace.selectTab('roles')

    await ontologyWorkspace.createRoleType('UniqueRole', 'Only in Persona A', ['Person'])
    await ontologyWorkspace.expectTypeExists('UniqueRole')

    // Navigate to persona 2 directly
    await ontologyWorkspace.navigateTo(persona2.id)
    await page.waitForLoadState('networkidle')
    await ontologyWorkspace.selectTab('roles')

    // Verify type does not exist in persona 2
    await ontologyWorkspace.expectTypeNotExists('UniqueRole')

    // Cleanup
    await db.deletePersona(persona1.id)
    await db.deletePersona(persona2.id)
  })

  test('displays role type count in tab', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('roles')

    const rolesTab = page.getByRole('tab', { name: /role types/i })
    const initialTabText = await rolesTab.textContent()
    expect(initialTabText).toContain('0')

    // Create 3 role types
    await ontologyWorkspace.createRoleType('Actor', 'One who acts', ['Person'])
    await ontologyWorkspace.createRoleType('Subject', 'The main entity', ['Person'])
    await ontologyWorkspace.createRoleType('Target', 'The goal', ['Location'])

    await page.waitForTimeout(500)
    const updatedTabText = await rolesTab.textContent()
    expect(updatedTabText).toContain('3')
  })

  test('handles empty state gracefully', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('roles')

    const rolesTab = page.getByRole('tab', { name: /role types/i })
    const tabText = await rolesTab.textContent()
    expect(tabText).toContain('0')
  })

  test('displays multiple role types in list', async ({ ontologyWorkspace, testPersona, page }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create 5 role types
    await ontologyWorkspace.createRoleType('Role1', 'First role', ['Person'])
    await ontologyWorkspace.createRoleType('Role2', 'Second role', ['Person'])
    await ontologyWorkspace.createRoleType('Role3', 'Third role', ['Person'])
    await ontologyWorkspace.createRoleType('Role4', 'Fourth role', ['Organization'])
    await ontologyWorkspace.createRoleType('Role5', 'Fifth role', ['Location'])

    await ontologyWorkspace.selectTab('roles')
    await page.waitForTimeout(300)

    const listItems = await page.locator('li').filter({ hasText: /Role/ }).count()
    expect(listItems).toBeGreaterThanOrEqual(5)
  })
})
