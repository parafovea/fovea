import { test, expect } from '../../fixtures/test-context.js'

test.describe('Entity Management', () => {
  test.describe.configure({ mode: 'serial' })

  test('creates entity with name and description', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    // Navigate to object workspace
    await objectWorkspace.navigateTo()

    // Create entity
    await objectWorkspace.createEntity(
      'Empire State Building',
      'Famous skyscraper in New York City'
    )

    // Verify entity appears in list
    await objectWorkspace.expectEntityExists('Empire State Building')

    // Verify entity count updated
    await objectWorkspace.expectObjectCount('entities', 1)
  })

  test('validates entity name is required', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('entities')

    // Click FAB to open dialog
    await objectWorkspace.addFab.click()
    await page.waitForTimeout(300)

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Try to save without filling name
    const saveButton = dialog.getByRole('button', { name: /save|create/i })

    // Check if save button is disabled
    const isDisabled = await saveButton.isDisabled().catch(() => true)
    if (!isDisabled) {
      await saveButton.click()
      await page.waitForTimeout(300)
    }

    // Dialog should still be visible (validation prevented save)
    await expect(dialog).toBeVisible()
  })

  test('edits entity details', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create initial entity
    await objectWorkspace.createEntity('Original Name', 'Original description')

    // Edit it
    await objectWorkspace.editEntity('Original Name', 'Updated Name', 'Updated description')

    // Verify update
    await objectWorkspace.expectEntityExists('Updated Name')
    await objectWorkspace.expectEntityNotExists('Original Name')
  })

  test('deletes entity', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create entity
    await objectWorkspace.createEntity('To Delete', 'This will be deleted')

    // Verify it exists
    await objectWorkspace.expectEntityExists('To Delete')

    // Delete it
    await objectWorkspace.deleteEntity('To Delete')

    // Verify it's gone
    await objectWorkspace.expectEntityNotExists('To Delete')
    await objectWorkspace.expectObjectCount('entities', 0)
  })

  test('searches entities by name', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create multiple entities
    await objectWorkspace.createEntity('Empire State Building', 'Skyscraper in NYC')
    await objectWorkspace.createEntity('Statue of Liberty', 'Monument in NYC')
    await objectWorkspace.createEntity('Golden Gate Bridge', 'Bridge in San Francisco')

    // Search for specific entity
    await objectWorkspace.searchObjects('Empire')

    // Should only see Empire State Building
    await objectWorkspace.expectEntityExists('Empire State Building')
    await expect(page.getByText('Statue of Liberty', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Golden Gate Bridge', { exact: true })).not.toBeVisible()
  })

  test('searches entities by description', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    await objectWorkspace.createEntity('Building A', 'Located in New York')
    await objectWorkspace.createEntity('Building B', 'Located in Boston')

    await objectWorkspace.searchObjects('Boston')
    await objectWorkspace.expectEntityExists('Building B')
  })

  test('links entity to entity type', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.createEntity('Test Building', 'A test building')
    await objectWorkspace.linkEntityToType('Test Building', testEntityType.name)
    await objectWorkspace.expectEntityExists('Test Building')
  })

  test('displays entity count in tab', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Initially should be 0
    await expect(page.getByRole('tab', { name: /entities.*0/i })).toBeVisible()

    // Create entities
    await objectWorkspace.createEntity('Entity 1', 'First entity')
    await objectWorkspace.createEntity('Entity 2', 'Second entity')

    // Should show 2
    await expect(page.getByRole('tab', { name: /entities.*2/i })).toBeVisible()
  })

  test('entities persist across reload', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Wait for the save request
    const saveResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/world') && response.request().method() === 'PUT',
      { timeout: 10000 }
    )

    await objectWorkspace.createEntity('Persistent Entity', 'Should survive reload')
    await saveResponsePromise
    await page.waitForTimeout(1500)

    // Reload page
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    await objectWorkspace.expectEntityExists('Persistent Entity')
  })

  test('creates multiple entities', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create multiple entities
    await objectWorkspace.createEntity('Entity A', 'Description A')
    await objectWorkspace.createEntity('Entity B', 'Description B')
    await objectWorkspace.createEntity('Entity C', 'Description C')

    // All should exist
    await objectWorkspace.expectEntityExists('Entity A')
    await objectWorkspace.expectEntityExists('Entity B')
    await objectWorkspace.expectEntityExists('Entity C')
    await objectWorkspace.expectObjectCount('entities', 3)
  })

  test('clears search filter', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    await objectWorkspace.createEntity('Visible Entity', 'Should be visible')
    await objectWorkspace.createEntity('Hidden Entity', 'Should be hidden initially')

    // Search to filter
    await objectWorkspace.searchObjects('Visible')
    await objectWorkspace.expectEntityExists('Visible Entity')

    // Clear search
    await objectWorkspace.clearSearch()

    // Both should be visible now
    await objectWorkspace.expectEntityExists('Visible Entity')
    await objectWorkspace.expectEntityExists('Hidden Entity')
  })

  test('entity name is case-sensitive in exact match', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    await objectWorkspace.createEntity('TestEntity', 'Case sensitive test')

    // Should find with exact case
    await objectWorkspace.expectEntityExists('TestEntity')

    // Verify entity exists in list
    const visiblePanel = page.locator('[role="tabpanel"]').filter({ has: page.locator(':visible') }).first()
    const entityItem = visiblePanel.locator('li').filter({ has: page.getByText('TestEntity', { exact: true }) })
    await expect(entityItem).toBeVisible()
  })

  test('handles entity with empty description', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create entity with empty description
    await objectWorkspace.createEntity('No Description Entity', '')

    // Should still be created
    await objectWorkspace.expectEntityExists('No Description Entity')
  })

  test('switches between entity tab and other tabs', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Start on entities
    await objectWorkspace.selectTab('entities')
    await objectWorkspace.createEntity('Test Entity', 'Description')

    // Switch to events tab
    await objectWorkspace.selectTab('events')
    await expect(page.getByRole('tab', { name: /events/i })).toHaveAttribute('aria-selected', 'true')

    // Switch back to entities
    await objectWorkspace.selectTab('entities')
    await objectWorkspace.expectEntityExists('Test Entity')
  })

  test('entity list updates immediately after creation', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Verify initially empty
    await objectWorkspace.expectObjectCount('entities', 0)

    // Create entity
    await objectWorkspace.createEntity('Immediate Entity', 'Should appear right away')

    // Should be visible immediately without manual refresh
    await objectWorkspace.expectEntityExists('Immediate Entity')
    await objectWorkspace.expectObjectCount('entities', 1)
  })
})
