/**
 * @file ontology-persistence.spec.ts
 * @description E2E tests verifying persona ontology types persist to database
 * and survive page reloads.
 *
 * These tests ensure that:
 * - Entity types auto-save after creation
 * - Role types auto-save after creation
 * - Event types auto-save after creation
 * - Types persist to database (not just Redux)
 * - Types can be retrieved after page reload
 * - Type updates persist correctly
 * - Type deletions persist correctly
 */

import { test, expect } from '../../fixtures/multivent-fixtures'

test.describe('Ontology Type Persistence', () => {
  test('new entity type persists after page reload', async ({ page, testPersona }) => {
    // Navigate to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Select test persona
    const personaCard = page.getByText(testPersona.name).first()
    await personaCard.click()

    // Wait for ontology workspace to load
    await expect(page.getByRole('tab', { name: /entity types/i })).toBeVisible()

    // Open entity type editor
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-type-fab'))
    await addButton.first().click()

    // Fill in entity type details
    const newTypeName = `Test Entity ${Date.now()}`
    await page.getByLabel(/name/i).fill(newTypeName)
    await page.getByLabel(/description|gloss/i).first().fill('A test entity type for persistence testing')

    // Save entity type
    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()

    // Wait for auto-save (1 second debounce + network time)
    await page.waitForTimeout(2000)

    // Verify entity type appears in list
    const entityText = page.getByText(newTypeName)
    await expect(entityText.first()).toBeVisible()

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back to ontology
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Select persona again
    const personaCardAfterReload = page.getByText(testPersona.name).first()
    await personaCardAfterReload.click()

    // Verify entity type still exists
    await page.waitForSelector(`text="${newTypeName}"`, { timeout: 5000 })
    const entityTextAfterReload = page.getByText(newTypeName)
    await expect(entityTextAfterReload.first()).toBeVisible()
  })

  test('updated entity type persists after page reload', async ({ page, testPersona, testEntityType }) => {
    // Navigate to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Select test persona
    const personaCard = page.getByText(testPersona.name).first()
    await personaCard.click()

    // Wait for entity types to load
    await page.waitForSelector(`text="${testEntityType.name}"`, { timeout: 5000 })

    // Click edit button for the test entity type
    const entityTypeRow = page.locator(`text="${testEntityType.name}"`).locator('..').locator('..')
    const editButton = entityTypeRow.getByRole('button', { name: /edit/i })
    await editButton.click()

    // Update the description
    const updatedGloss = `Updated description ${Date.now()}`
    const glossField = page.getByLabel(/description|gloss/i).first()
    await glossField.clear()
    await glossField.fill(updatedGloss)

    // Save changes
    const saveButton = page.getByRole('button', { name: /save|update/i })
    await saveButton.click()

    // Wait for auto-save
    await page.waitForTimeout(2000)

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')
    const personaCardAfterReload = page.getByText(testPersona.name).first()
    await personaCardAfterReload.click()

    // Verify updated description persisted
    await page.waitForSelector(`text="${testEntityType.name}"`, { timeout: 5000 })
    const updatedText = page.getByText(updatedGloss)
    await expect(updatedText.first()).toBeVisible()
  })

  test('deleted entity type does not reappear after page reload', async ({ page, testPersona }) => {
    // Navigate to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Select test persona
    const personaCard = page.getByText(testPersona.name).first()
    await personaCard.click()

    // Create a temporary entity type
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-type-fab'))
    await addButton.first().click()

    const tempTypeName = `Temp Entity ${Date.now()}`
    await page.getByLabel(/name/i).fill(tempTypeName)
    await page.getByLabel(/description|gloss/i).first().fill('Temporary type for deletion test')

    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()

    // Wait for auto-save
    await page.waitForTimeout(2000)

    // Verify it exists
    await page.waitForSelector(`text="${tempTypeName}"`, { timeout: 5000 })
    const tempText = page.getByText(tempTypeName)
    await expect(tempText.first()).toBeVisible()

    // Delete it
    const entityTypeRow = page.locator(`text="${tempTypeName}"`).locator('..').locator('..')
    const deleteButton = entityTypeRow.getByRole('button', { name: /delete/i })
    await deleteButton.click()

    // Confirm deletion if dialog appears
    const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i })
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click()
    }

    // Wait for auto-save of deletion
    await page.waitForTimeout(2000)

    // Verify it's gone
    await expect(tempText.first()).not.toBeVisible()

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')
    const personaCardAfterReload = page.getByText(testPersona.name).first()
    await personaCardAfterReload.click()

    // Verify it's still gone
    const tempTextAfterReload = page.getByText(tempTypeName)
    await expect(tempTextAfterReload.first()).not.toBeVisible()
  })

  test('role type persists after page reload', async ({ page, testPersona }) => {
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    const personaCard = page.getByText(testPersona.name).first()
    await personaCard.click()

    // Switch to role types tab
    const roleTab = page.getByRole('tab', { name: /role types/i })
    await roleTab.click()

    // Add new role type
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-type-fab'))
    await addButton.first().click()

    const newRoleName = `Test Role ${Date.now()}`
    await page.getByLabel(/name/i).fill(newRoleName)
    await page.getByLabel(/description|gloss/i).first().fill('A test role type')

    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()

    // Wait for auto-save
    await page.waitForTimeout(2000)

    // Verify role exists
    await page.waitForSelector(`text="${newRoleName}"`, { timeout: 5000 })
    const roleText = page.getByText(newRoleName)
    await expect(roleText.first()).toBeVisible()

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    const personaCardAfterReload = page.getByText(testPersona.name).first()
    await personaCardAfterReload.click()

    const roleTabAfterReload = page.getByRole('tab', { name: /role types/i })
    await roleTabAfterReload.click()

    await page.waitForSelector(`text="${newRoleName}"`, { timeout: 5000 })
    const roleTextAfterReload = page.getByText(newRoleName)
    await expect(roleTextAfterReload.first()).toBeVisible()
  })

  test('event type persists after page reload', async ({ page, testPersona }) => {
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    const personaCard = page.getByText(testPersona.name).first()
    await personaCard.click()

    // Switch to event types tab
    const eventTab = page.getByRole('tab', { name: /event types/i })
    await eventTab.click()

    // Add new event type
    const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-type-fab'))
    await addButton.first().click()

    const newEventName = `Test Event ${Date.now()}`
    await page.getByLabel(/name/i).fill(newEventName)
    await page.getByLabel(/description|gloss/i).first().fill('A test event type')

    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()

    // Wait for auto-save
    await page.waitForTimeout(2000)

    // Verify event exists
    await page.waitForSelector(`text="${newEventName}"`, { timeout: 5000 })
    const eventText = page.getByText(newEventName)
    await expect(eventText.first()).toBeVisible()

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    const personaCardAfterReload = page.getByText(testPersona.name).first()
    await personaCardAfterReload.click()

    const eventTabAfterReload = page.getByRole('tab', { name: /event types/i })
    await eventTabAfterReload.click()

    await page.waitForSelector(`text="${newEventName}"`, { timeout: 5000 })
    const eventTextAfterReload = page.getByText(newEventName)
    await expect(eventTextAfterReload.first()).toBeVisible()
  })

  test('multiple rapid type creations auto-save correctly', async ({ page, testPersona }) => {
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    const personaCard = page.getByText(testPersona.name).first()
    await personaCard.click()

    // Create 3 entity types rapidly
    const typeNames: string[] = []

    for (let i = 0; i < 3; i++) {
      const addButton = page.getByRole('button', { name: /add/i }).or(page.getByTestId('add-type-fab'))
      await addButton.first().click()

      const typeName = `Rapid Entity ${Date.now()}-${i}`
      typeNames.push(typeName)
      await page.getByLabel(/name/i).fill(typeName)
      await page.getByLabel(/description|gloss/i).first().fill(`Rapid type ${i}`)

      const saveButton = page.getByRole('button', { name: /save|create/i })
      await saveButton.click()

      // Small delay between creations
      await page.waitForTimeout(200)
    }

    // Wait for all auto-saves
    await page.waitForTimeout(2000)

    // Verify all types exist
    for (const typeName of typeNames) {
      const typeText = page.getByText(typeName)
      await expect(typeText.first()).toBeVisible()
    }

    // Reload and verify all persist
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    const personaCardAfterReload = page.getByText(testPersona.name).first()
    await personaCardAfterReload.click()

    for (const typeName of typeNames) {
      await page.waitForSelector(`text="${typeName}"`, { timeout: 5000 })
      const typeTextAfterReload = page.getByText(typeName)
      await expect(typeTextAfterReload.first()).toBeVisible()
    }
  })
})
