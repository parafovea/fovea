import { test, expect } from '../../fixtures/test-context.js'

test.describe('Collection Management', () => {
  test.describe.configure({ mode: 'serial' })

  test('creates entity collection', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('collections')

    // First create some entities to add to collection
    await objectWorkspace.createEntity('Entity 1', 'First entity')
    await objectWorkspace.createEntity('Entity 2', 'Second entity')

    // Create collection with entities
    await objectWorkspace.createEntityCollection(
      'Test Entity Collection',
      'A collection of test entities',
      ['Entity 1', 'Entity 2']
    )

    await objectWorkspace.expectCollectionExists('Test Entity Collection')
    await objectWorkspace.expectCollectionHasMembers('Test Entity Collection', 2)
  })

  test('adds entities to collection', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create entities first
    await objectWorkspace.createEntity('Entity A', 'Entity A description')
    await objectWorkspace.createEntity('Entity B', 'Entity B description')
    await objectWorkspace.createEntity('Entity C', 'Entity C description')

    // Create collection with initial entities
    await objectWorkspace.createEntityCollection(
      'Growing Collection',
      'Collection that grows',
      ['Entity A']
    )

    await objectWorkspace.expectCollectionHasMembers('Growing Collection', 1)

    // Edit collection to add more entities
    await objectWorkspace.selectTab('collections')
    const editButton = page.locator('li').filter({ hasText: 'Growing Collection' }).locator('button').first()
    await editButton.click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    const autocomplete = dialog.getByLabel(/select entities/i).first()

    // Add Entity B
    await autocomplete.click()
    await autocomplete.fill('Entity B')
    await page.waitForTimeout(300)
    const optionB = page.getByRole('option', { name: /Entity B/i }).first()
    if (await optionB.isVisible({ timeout: 2000 }).catch(() => false)) {
      await optionB.click()
      await page.waitForTimeout(300)
    }

    // Add Entity C
    await autocomplete.click()
    await autocomplete.fill('Entity C')
    await page.waitForTimeout(300)
    const optionC = page.getByRole('option', { name: /Entity C/i }).first()
    if (await optionC.isVisible({ timeout: 2000 }).catch(() => false)) {
      await optionC.click()
      await page.waitForTimeout(300)
    }

    // Save
    const saveButton = page.getByRole('button', { name: /save|update/i })
    await saveButton.click()
    await page.waitForTimeout(1500)

    await objectWorkspace.expectCollectionHasMembers('Growing Collection', 3)
  })

  test('removes entities from collection', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create entities
    await objectWorkspace.createEntity('Keep Entity', 'Keep this one')
    await objectWorkspace.createEntity('Remove Entity', 'Remove this one')

    // Create collection with both
    await objectWorkspace.createEntityCollection(
      'Shrinking Collection',
      'Collection that shrinks',
      ['Keep Entity', 'Remove Entity']
    )

    await objectWorkspace.expectCollectionHasMembers('Shrinking Collection', 2)

    // Remove one entity from the collection
    await objectWorkspace.removeCollectionMember('Shrinking Collection', 'Remove Entity')

    // Verify only 1 entity remains
    await objectWorkspace.expectCollectionHasMembers('Shrinking Collection', 1)
  })

  test('creates event collection', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create events first
    await objectWorkspace.createEvent('Event 1', 'First event')
    await objectWorkspace.createEvent('Event 2', 'Second event')

    // Create event collection
    await objectWorkspace.createEventCollection(
      'Test Event Collection',
      'A collection of test events',
      ['Event 1', 'Event 2']
    )

    await objectWorkspace.expectCollectionExists('Test Event Collection')
    await objectWorkspace.expectCollectionHasMembers('Test Event Collection', 2)
  })

  test('adds events to collection', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create events
    await objectWorkspace.createEvent('Meeting 1', 'First meeting')
    await objectWorkspace.createEvent('Meeting 2', 'Second meeting')
    await objectWorkspace.createEvent('Meeting 3', 'Third meeting')

    // Create collection with one event
    await objectWorkspace.createEventCollection(
      'Meeting Series',
      'All team meetings',
      ['Meeting 1']
    )

    await objectWorkspace.expectCollectionHasMembers('Meeting Series', 1)

    // Edit to add more events
    await objectWorkspace.selectTab('collections')
    const editButton = page.locator('li').filter({ hasText: 'Meeting Series' }).locator('button').first()
    await editButton.click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    const autocomplete = dialog.getByLabel(/select events/i).first()

    // Add Meeting 2
    await autocomplete.click()
    await autocomplete.fill('Meeting 2')
    await page.waitForTimeout(300)
    const option2 = page.getByRole('option', { name: /Meeting 2/i }).first()
    if (await option2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await option2.click()
      await page.waitForTimeout(300)
    }

    // Save
    const saveButton = page.getByRole('button', { name: /save|update/i })
    await saveButton.click()
    await page.waitForTimeout(1500)

    await objectWorkspace.expectCollectionHasMembers('Meeting Series', 2)
  })

  test('edits collection metadata', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create entity and collection
    await objectWorkspace.createEntity('Test Entity', 'For collection')
    await objectWorkspace.createEntityCollection(
      'Original Name',
      'Original description',
      ['Test Entity']
    )

    await objectWorkspace.expectCollectionExists('Original Name')

    // Edit collection
    await objectWorkspace.editCollection(
      'Original Name',
      'Updated Name',
      'Updated description'
    )

    await objectWorkspace.expectCollectionExists('Updated Name')
    await objectWorkspace.expectCollectionNotExists('Original Name')
  })

  test('deletes collection', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create entity and collection
    await objectWorkspace.createEntity('Temp Entity', 'Temporary')
    await objectWorkspace.createEntityCollection(
      'Temporary Collection',
      'To be deleted',
      ['Temp Entity']
    )

    await objectWorkspace.expectCollectionExists('Temporary Collection')

    // Delete collection
    await objectWorkspace.deleteCollection('Temporary Collection')

    await objectWorkspace.expectCollectionNotExists('Temporary Collection')

    // Verify entity still exists (collections don't delete members)
    await objectWorkspace.selectTab('entities')
    await objectWorkspace.expectEntityExists('Temp Entity')
  })

  test('searches collections', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Create entities
    await objectWorkspace.createEntity('Entity 1', 'First')
    await objectWorkspace.createEntity('Entity 2', 'Second')

    // Create collections with distinctive names
    await objectWorkspace.createEntityCollection(
      'Alpha Collection',
      'First collection',
      ['Entity 1']
    )
    await objectWorkspace.createEntityCollection(
      'Beta Collection',
      'Second collection',
      ['Entity 2']
    )

    // Search for specific collection
    await objectWorkspace.selectTab('collections')
    await objectWorkspace.searchObjects('Alpha')

    await objectWorkspace.expectCollectionExists('Alpha Collection')
    // Beta might be visible or hidden depending on search implementation
  })

  test('collections persist across reload', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()

    // Wait for entity save
    const entitySavePromise = page.waitForResponse(
      response => response.url().includes('/api/world') && response.request().method() === 'PUT',
      { timeout: 10000 }
    )
    await objectWorkspace.createEntity('Persistent Entity', 'Stays around')
    await entitySavePromise
    await page.waitForTimeout(1500)

    // Wait for collection save
    const collectionSavePromise = page.waitForResponse(
      response => response.url().includes('/api/world') && response.request().method() === 'PUT',
      { timeout: 10000 }
    )
    await objectWorkspace.createEntityCollection(
      'Persistent Collection',
      'Should persist',
      ['Persistent Entity']
    )
    await objectWorkspace.expectCollectionExists('Persistent Collection')
    await collectionSavePromise
    await page.waitForTimeout(1500)

    // Reload page
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    await objectWorkspace.selectTab('collections')

    // Verify collection still exists
    await objectWorkspace.expectCollectionExists('Persistent Collection')
    await objectWorkspace.expectCollectionHasMembers('Persistent Collection', 1)
  })

  test('displays collection count in tab', async ({
    objectWorkspace,
    testPersona,
    page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('collections')

    // Initially should be 0
    await expect(page.getByRole('tab', { name: /collections.*0/i })).toBeVisible()

    // Create entities
    await objectWorkspace.createEntity('Entity A', 'First')
    await objectWorkspace.createEntity('Entity B', 'Second')

    // Create collections
    await objectWorkspace.createEntityCollection('Collection 1', 'First', ['Entity A'])
    await objectWorkspace.createEventCollection('Collection 2', 'Second', [])

    // Should show 2
    await expect(page.getByRole('tab', { name: /collections.*2/i })).toBeVisible()
  })
})
