import { test, expect } from '../../fixtures/test-context.js'

/**
 * Persona Deletion E2E Tests
 *
 * Tests verify that persona deletion works correctly:
 * - Delete button is visible on persona cards
 * - Clicking delete opens confirmation dialog
 * - Confirmation dialog shows affected items count
 * - Confirming deletion removes the persona
 * - Cancel closes dialog without deleting
 *
 * Uses test-context fixtures for proper authentication and test isolation.
 */

test.describe('Persona Deletion', () => {
  // testPersona fixture creates a test persona that we can delete
  test.beforeEach(async ({ testUser }) => {
    // Auth is set up by testUser fixture
    void testUser
  })

  test('delete button is visible on persona cards in PersonaBrowser', async ({ page, db, testUser, workerSessionToken }) => {
    // Create a persona to delete
    const persona = await db.createPersona({
      name: 'Persona To Delete',
      role: 'Test Role'
    }, workerSessionToken)

    try {
      // Navigate to ontology workspace (persona browser)
      await page.goto('/ontology')
      await page.waitForLoadState('networkidle', { timeout: 15000 })

      // Wait for personas to load
      await page.waitForSelector(`[data-persona-id="${persona.id}"]`, { timeout: 10000 })

      // Find the persona card
      const personaCard = page.locator(`[data-persona-id="${persona.id}"]`)
      await expect(personaCard).toBeVisible()

      // Find the delete button within the card
      const deleteButton = personaCard.getByRole('button', { name: /delete persona/i })
      await expect(deleteButton).toBeVisible()
    } finally {
      // Cleanup
      await db.deletePersona(persona.id)
    }
  })

  test('clicking delete opens confirmation dialog with warning', async ({ page, db, testUser, workerSessionToken }) => {
    // Create a persona to delete
    const persona = await db.createPersona({
      name: 'Delete Confirmation Test',
      role: 'Test Role'
    }, workerSessionToken)

    try {
      // Navigate to ontology workspace
      await page.goto('/ontology')
      await page.waitForLoadState('networkidle', { timeout: 15000 })

      // Wait for persona card
      await page.waitForSelector(`[data-persona-id="${persona.id}"]`, { timeout: 10000 })

      // Click delete button
      const personaCard = page.locator(`[data-persona-id="${persona.id}"]`)
      const deleteButton = personaCard.getByRole('button', { name: /delete persona/i })
      await deleteButton.click()

      // Confirm dialog appears
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Check dialog title
      const dialogTitle = dialog.getByText('Delete Persona')
      await expect(dialogTitle).toBeVisible()

      // Check for confirmation message with persona name
      const confirmMessage = dialog.getByText(/are you sure you want to delete/i)
      await expect(confirmMessage).toBeVisible()
      await expect(dialog.getByText(/Delete Confirmation Test/)).toBeVisible()

      // Check for "cannot be undone" warning
      const warning = dialog.getByText(/cannot be undone/i)
      await expect(warning).toBeVisible()

      // Check for Delete and Cancel buttons
      const deleteConfirmButton = dialog.getByRole('button', { name: /^delete$/i })
      const cancelButton = dialog.getByRole('button', { name: /cancel/i })
      await expect(deleteConfirmButton).toBeVisible()
      await expect(cancelButton).toBeVisible()

      // Click cancel to close without deleting
      await cancelButton.click()
      await expect(dialog).not.toBeVisible()
    } finally {
      // Cleanup
      await db.deletePersona(persona.id)
    }
  })

  test('confirming deletion removes persona from list', async ({ page, db, testUser, workerSessionToken }) => {
    // Create a persona to delete
    const persona = await db.createPersona({
      name: 'Persona To Be Deleted',
      role: 'Deletion Test'
    }, workerSessionToken)

    // Navigate to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Wait for persona card
    await page.waitForSelector(`[data-persona-id="${persona.id}"]`, { timeout: 10000 })

    // Verify persona is visible
    const personaCard = page.locator(`[data-persona-id="${persona.id}"]`)
    await expect(personaCard).toBeVisible()

    // Click delete button
    const deleteButton = personaCard.getByRole('button', { name: /delete persona/i })
    await deleteButton.click()

    // Wait for dialog
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Confirm deletion
    const deleteConfirmButton = dialog.getByRole('button', { name: /^delete$/i })
    await deleteConfirmButton.click()

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    // Verify persona is no longer in the list
    await expect(personaCard).not.toBeVisible({ timeout: 5000 })
  })

  test('cancel button closes dialog without deleting', async ({ page, db, testUser, workerSessionToken }) => {
    // Create a persona to test cancel
    const persona = await db.createPersona({
      name: 'Cancel Test Persona',
      role: 'Test Role'
    }, workerSessionToken)

    try {
      // Navigate to ontology workspace
      await page.goto('/ontology')
      await page.waitForLoadState('networkidle', { timeout: 15000 })

      // Wait for persona card
      await page.waitForSelector(`[data-persona-id="${persona.id}"]`, { timeout: 10000 })

      // Click delete button
      const personaCard = page.locator(`[data-persona-id="${persona.id}"]`)
      const deleteButton = personaCard.getByRole('button', { name: /delete persona/i })
      await deleteButton.click()

      // Wait for dialog
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Click cancel
      const cancelButton = dialog.getByRole('button', { name: /cancel/i })
      await cancelButton.click()

      // Dialog should close
      await expect(dialog).not.toBeVisible()

      // Persona should still be visible
      await expect(personaCard).toBeVisible()
      await expect(personaCard.getByText('Cancel Test Persona')).toBeVisible()
    } finally {
      // Cleanup
      await db.deletePersona(persona.id)
    }
  })

  test('deletion preview shows affected items count', async ({ page, db, testUser, workerSessionToken }) => {
    // Create a persona with ontology types
    const persona = await db.createPersona({
      name: 'Persona With Types',
      role: 'Test Role'
    }, workerSessionToken)

    // Add an entity type to the persona's ontology
    await db.createEntityType(persona.id, {
      name: 'Test Entity',
      definition: 'A test entity type'
    })

    try {
      // Navigate to ontology workspace
      await page.goto('/ontology')
      await page.waitForLoadState('networkidle', { timeout: 15000 })

      // Wait for persona card
      await page.waitForSelector(`[data-persona-id="${persona.id}"]`, { timeout: 10000 })

      // Click delete button
      const personaCard = page.locator(`[data-persona-id="${persona.id}"]`)
      const deleteButton = personaCard.getByRole('button', { name: /delete persona/i })
      await deleteButton.click()

      // Wait for dialog
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Wait for deletion preview to load and show types count
      // The preview should mention "1 ontology type" since we added one
      await expect(dialog.getByText(/ontology type/i)).toBeVisible({ timeout: 5000 })
    } finally {
      // Cleanup
      await db.deletePersona(persona.id)
    }
  })

  test('can delete persona from PersonaManager menu', async ({ page, db, testUser, workerSessionToken }) => {
    // Create a persona to delete
    const persona = await db.createPersona({
      name: 'Manager Delete Test',
      role: 'Test Role'
    }, workerSessionToken)

    // Navigate to ontology workspace and select the persona
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Wait for and click on the persona to select it
    await page.waitForSelector(`[data-persona-id="${persona.id}"]`, { timeout: 10000 })
    const openButton = page.locator(`[data-persona-id="${persona.id}"]`).getByRole('button', { name: /open/i })
    await openButton.click()

    // Wait for ontology workspace to load (tabs should be visible)
    await page.waitForSelector('[role="tab"]', { timeout: 10000 })

    // Find the persona manager dropdown button (shows current persona name)
    const personaSelector = page.getByRole('button', { name: /Manager Delete Test/i })
    await expect(personaSelector).toBeVisible({ timeout: 5000 })

    // Click to open menu
    await personaSelector.click()

    // Wait for menu
    const menu = page.locator('[role="menu"]')
    await expect(menu).toBeVisible({ timeout: 5000 })

    // Find delete button in menu
    const deleteButtons = menu.getByRole('button', { name: /delete persona/i })
    const firstDeleteButton = deleteButtons.first()
    await expect(firstDeleteButton).toBeVisible()
    await firstDeleteButton.click()

    // Confirmation dialog should appear
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText(/Manager Delete Test/)).toBeVisible()

    // Confirm deletion
    const confirmButton = dialog.getByRole('button', { name: /^delete$/i })
    await confirmButton.click()

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10000 })
  })
})
