/**
 * @file world-persistence.spec.ts
 * @description E2E tests verifying world objects (entities, events, times, collections)
 * persist to database and survive page reloads.
 *
 * These tests ensure that:
 * - World objects auto-save after creation (existing functionality)
 * - Objects persist to database (not just Redux)
 * - Objects can be retrieved after page reload
 * - Object updates persist correctly
 * - Object deletions persist correctly
 *
 * Note: World objects already have auto-save implemented. These are regression tests
 * to ensure the existing functionality continues to work correctly.
 */

import { test, expect } from '../../fixtures/multivent-fixtures'

test.describe('World Object Persistence', () => {
  test('new entity persists after page reload', async ({ page }) => {
    // Navigate to objects workspace
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    // Ensure we're on Entities tab
    const entitiesTab = page.getByRole('tab', { name: /entities/i })
    await entitiesTab.click()

    // Open entity editor
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-entity-fab'))
    await addButton.first().click()

    // Fill in entity details
    const newEntityName = `Test Entity ${Date.now()}`
    await page.getByLabel(/name/i).fill(newEntityName)
    await page.getByLabel(/description|gloss/i).first().fill('A test entity for persistence testing')

    // Save entity
    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()

    // Wait for auto-save (1 second debounce + network time)
    await page.waitForTimeout(2000)

    // Verify entity appears in list
    await page.waitForSelector(`text="${newEntityName}"`, { timeout: 5000 })
    const entityText = page.getByText(newEntityName)
    await expect(entityText.first()).toBeVisible()

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back to objects
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    // Verify entity still exists
    await page.waitForSelector(`text="${newEntityName}"`, { timeout: 5000 })
    const entityTextAfterReload = page.getByText(newEntityName)
    await expect(entityTextAfterReload.first()).toBeVisible()
  })

  test('updated entity persists after page reload', async ({ page }) => {
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    const entitiesTab = page.getByRole('tab', { name: /entities/i })
    await entitiesTab.click()

    // Create an entity first
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-entity-fab'))
    await addButton.first().click()

    const entityName = `Update Test Entity ${Date.now()}`
    await page.getByLabel(/name/i).fill(entityName)
    await page.getByLabel(/description|gloss/i).first().fill('Original description')

    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()
    await page.waitForTimeout(2000)

    // Edit the entity
    await page.waitForSelector(`text="${entityName}"`, { timeout: 5000 })
    const entityRow = page.locator(`text="${entityName}"`).locator('..').locator('..')
    const editButton = entityRow.getByRole('button', { name: /edit/i })
    await editButton.click()

    // Update description
    const updatedGloss = `Updated description ${Date.now()}`
    const glossField = page.getByLabel(/description|gloss/i).first()
    await glossField.clear()
    await glossField.fill(updatedGloss)

    const updateButton = page.getByRole('button', { name: /save|update/i })
    await updateButton.click()
    await page.waitForTimeout(2000)

    // Reload and verify
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    await page.waitForSelector(`text="${entityName}"`, { timeout: 5000 })
    const updatedText = page.getByText(updatedGloss)
    await expect(updatedText.first()).toBeVisible()
  })

  test('deleted entity does not reappear after page reload', async ({ page }) => {
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    const entitiesTab = page.getByRole('tab', { name: /entities/i })
    await entitiesTab.click()

    // Create temporary entity
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-entity-fab'))
    await addButton.first().click()

    const tempEntityName = `Temp Entity ${Date.now()}`
    await page.getByLabel(/name/i).fill(tempEntityName)
    await page.getByLabel(/description|gloss/i).first().fill('Temporary entity for deletion test')

    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()
    await page.waitForTimeout(2000)

    // Verify it exists
    await page.waitForSelector(`text="${tempEntityName}"`, { timeout: 5000 })
    const tempText = page.getByText(tempEntityName)
    await expect(tempText.first()).toBeVisible()

    // Delete it
    const entityRow = page.locator(`text="${tempEntityName}"`).locator('..').locator('..')
    const deleteButton = entityRow.getByRole('button', { name: /delete/i })
    await deleteButton.click()

    // Confirm deletion if dialog appears
    const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i })
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click()
    }

    await page.waitForTimeout(2000)

    // Verify it's gone
    await expect(tempText.first()).not.toBeVisible()

    // Reload and verify it's still gone
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    const tempTextAfterReload = page.getByText(tempEntityName)
    await expect(tempTextAfterReload.first()).not.toBeVisible()
  })

  test('new event persists after page reload', async ({ page }) => {
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    // Switch to Events tab
    const eventsTab = page.getByRole('tab', { name: /events/i })
    await eventsTab.click()

    // Add new event
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-event-fab'))
    await addButton.first().click()

    const newEventName = `Test Event ${Date.now()}`
    await page.getByLabel(/name/i).fill(newEventName)
    await page.getByLabel(/description|gloss/i).first().fill('A test event')

    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()
    await page.waitForTimeout(2000)

    // Verify event exists
    await page.waitForSelector(`text="${newEventName}"`, { timeout: 5000 })
    const eventText = page.getByText(newEventName)
    await expect(eventText.first()).toBeVisible()

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    const eventsTabAfterReload = page.getByRole('tab', { name: /events/i })
    await eventsTabAfterReload.click()

    await page.waitForSelector(`text="${newEventName}"`, { timeout: 5000 })
    const eventTextAfterReload = page.getByText(newEventName)
    await expect(eventTextAfterReload.first()).toBeVisible()
  })

  test('new location persists after page reload', async ({ page }) => {
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    // Switch to Locations tab
    const locationsTab = page.getByRole('tab', { name: /locations/i })
    await locationsTab.click()

    // Add new location
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-location-fab'))
    await addButton.first().click()

    const newLocationName = `Test Location ${Date.now()}`
    await page.getByLabel(/name/i).fill(newLocationName)

    // Fill in latitude/longitude for point location
    await page.getByLabel(/latitude/i).fill('40.7128')
    await page.getByLabel(/longitude/i).fill('-74.0060')

    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()
    await page.waitForTimeout(2000)

    // Verify location exists
    await page.waitForSelector(`text="${newLocationName}"`, { timeout: 5000 })
    const locationText = page.getByText(newLocationName)
    await expect(locationText.first()).toBeVisible()

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    const locationsTabAfterReload = page.getByRole('tab', { name: /locations/i })
    await locationsTabAfterReload.click()

    await page.waitForSelector(`text="${newLocationName}"`, { timeout: 5000 })
    const locationTextAfterReload = page.getByText(newLocationName)
    await expect(locationTextAfterReload.first()).toBeVisible()
  })

  test('multiple rapid object creations auto-save correctly', async ({ page }) => {
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    const entitiesTab = page.getByRole('tab', { name: /entities/i })
    await entitiesTab.click()

    // Create 3 entities rapidly
    const entityNames: string[] = []

    for (let i = 0; i < 3; i++) {
      const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-entity-fab'))
      await addButton.first().click()

      const entityName = `Rapid Entity ${Date.now()}-${i}`
      entityNames.push(entityName)
      await page.getByLabel(/name/i).fill(entityName)
      await page.getByLabel(/description|gloss/i).first().fill(`Rapid entity ${i}`)

      const saveButton = page.getByRole('button', { name: /save|create/i })
      await saveButton.click()

      await page.waitForTimeout(200)
    }

    // Wait for all auto-saves
    await page.waitForTimeout(2000)

    // Verify all entities exist
    for (const entityName of entityNames) {
      await page.waitForSelector(`text="${entityName}"`, { timeout: 5000 })
      const entityText = page.getByText(entityName)
      await expect(entityText.first()).toBeVisible()
    }

    // Reload and verify all persist
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    for (const entityName of entityNames) {
      await page.waitForSelector(`text="${entityName}"`, { timeout: 5000 })
      const entityTextAfterReload = page.getByText(entityName)
      await expect(entityTextAfterReload.first()).toBeVisible()
    }
  })

  test('entity collection persists after page reload', async ({ page }) => {
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    // Switch to Collections tab
    const collectionsTab = page.getByRole('tab', { name: /collections/i })
    await collectionsTab.click()

    // Add new collection
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-collection-fab'))
    await addButton.first().click()

    const newCollectionName = `Test Collection ${Date.now()}`
    await page.getByLabel(/name/i).fill(newCollectionName)
    await page.getByLabel(/description|gloss/i).first().fill('A test collection')

    // Select entity collection type if needed
    const typeSelector = page.getByLabel(/type|collection type/i)
    if (await typeSelector.isVisible({ timeout: 1000 }).catch(() => false)) {
      await typeSelector.selectOption({ label: /entity/i })
    }

    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()
    await page.waitForTimeout(2000)

    // Verify collection exists
    await page.waitForSelector(`text="${newCollectionName}"`, { timeout: 5000 })
    const collectionText = page.getByText(newCollectionName)
    await expect(collectionText.first()).toBeVisible()

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto('/objects')
    await page.waitForLoadState('networkidle')

    const collectionsTabAfterReload = page.getByRole('tab', { name: /collections/i })
    await collectionsTabAfterReload.click()

    await page.waitForSelector(`text="${newCollectionName}"`, { timeout: 5000 })
    const collectionTextAfterReload = page.getByText(newCollectionName)
    await expect(collectionTextAfterReload.first()).toBeVisible()
  })
})
