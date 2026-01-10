import { test, expect } from '../../fixtures/test-context.js'

/**
 * Ontology Workspace Keyboard Shortcuts Tests
 *
 * Tests verify that ontology workspace shortcuts work correctly:
 * - n: Create new type (simple key, no browser conflicts)
 * - /: Focus search field (vim-style, avoids browser Ctrl+F conflict)
 * - Delete: Delete selected type
 * - Tab/Shift+Tab: Navigate between type tabs (workspace shortcuts, not browser Tab)
 */

test.describe('Keyboard Shortcuts - Ontology Workspace', () => {
  test.beforeEach(async ({ ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
  })

  test('n opens entity type editor when on entities tab', async ({ page, ontologyWorkspace }) => {
    await ontologyWorkspace.selectTab('entities')

    // Press n to create new type
    await page.keyboard.press('n')

    // Verify entity type editor dialog opened with correct title
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 2000 })

    // Check for specific entity type form elements
    const nameInput = dialog.getByRole('textbox', { name: /^name/i })
    await expect(nameInput).toBeVisible()

    // Verify dialog title or heading indicates entity type
    const dialogHeading = dialog.locator('h2, h6, [class*="DialogTitle"]').first()
    await expect(dialogHeading).toContainText(/entity/i)
  })

  test('n opens role editor when on roles tab', async ({ page, ontologyWorkspace }) => {
    await ontologyWorkspace.selectTab('roles')

    await page.keyboard.press('n')

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 2000 })

    // Verify it's a role editor - check for "Allowed Filler Types" which is unique to roles
    const allowedFillersLabel = dialog.getByText(/allowed.*filler/i)
    await expect(allowedFillersLabel).toBeVisible()
  })

  test('n opens event type editor when on events tab', async ({ page, ontologyWorkspace }) => {
    await ontologyWorkspace.selectTab('events')

    await page.keyboard.press('n')

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 2000 })

    // Verify it's an event type editor - check for "Roles" section which is unique to events
    const rolesLabel = dialog.getByText(/^roles$/i)
    await expect(rolesLabel).toBeVisible()
  })

  test('n opens relation type editor when on relations tab', async ({ page, ontologyWorkspace }) => {
    await ontologyWorkspace.selectTab('relations')

    await page.keyboard.press('n')

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 2000 })

    // Verify it's a relation type editor - check for source/target type fields
    const sourceLabel = dialog.getByText(/source.*type/i)
    await expect(sourceLabel).toBeVisible()
  })

  test('/ focuses search field', async ({ page, ontologyWorkspace }) => {
    await ontologyWorkspace.selectTab('entities')

    const searchInput = page.getByPlaceholder(/search.*type/i)
    await expect(searchInput).toBeVisible()
    await expect(searchInput).not.toBeFocused()

    // Press /
    await page.keyboard.press('/')

    // Verify search input is now focused
    await expect(searchInput).toBeFocused({ timeout: 1000 })
  })

  test('Tab cycles to next ontology tab', async ({ page, ontologyWorkspace }) => {
    // Start on entities tab
    await ontologyWorkspace.selectTab('entities')
    const entitiesTab = page.getByRole('tab', { name: /entity types/i })
    await expect(entitiesTab).toHaveAttribute('aria-selected', 'true')

    // Press Tab - should go to roles tab
    await page.keyboard.press('Tab')

    const rolesTab = page.getByRole('tab', { name: /role types/i })
    await expect(rolesTab).toHaveAttribute('aria-selected', 'true', { timeout: 1000 })
  })

  test('Shift+Tab cycles to previous ontology tab', async ({ page, ontologyWorkspace }) => {
    // Start on roles tab
    await ontologyWorkspace.selectTab('roles')
    const rolesTab = page.getByRole('tab', { name: /role types/i })
    await expect(rolesTab).toHaveAttribute('aria-selected', 'true')

    // Press Shift+Tab - should go to entities tab
    await page.keyboard.press('Shift+Tab')

    const entitiesTab = page.getByRole('tab', { name: /entity types/i })
    await expect(entitiesTab).toHaveAttribute('aria-selected', 'true', { timeout: 1000 })
  })

  test('Delete removes selected entity type', async ({ page, ontologyWorkspace }) => {
    await ontologyWorkspace.selectTab('entities')

    // Create a test entity type first via n shortcut
    await page.keyboard.press('n')

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 2000 })

    // Fill required fields
    const nameInput = dialog.getByRole('textbox', { name: /^name/i })
    await nameInput.fill('DeleteMe')

    const glossInput = dialog.locator('textarea').first()
    await glossInput.fill('Entity type to be deleted by keyboard shortcut')

    // Save
    const saveButton = dialog.getByRole('button', { name: /save|create/i })
    await expect(saveButton).toBeEnabled({ timeout: 3000 })
    await saveButton.click()

    // Wait for dialog to close and type to appear
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Find and select the new type
    const typeItem = page.getByText('DeleteMe').first()
    await expect(typeItem).toBeVisible({ timeout: 3000 })
    await typeItem.click()

    // Press Delete to remove it
    await page.keyboard.press('Delete')

    // Verify type is gone
    await expect(typeItem).not.toBeVisible({ timeout: 3000 })
  })

  test('n shortcut is disabled when search field is focused', async ({ page, ontologyWorkspace }) => {
    await ontologyWorkspace.selectTab('entities')

    // Focus search field by clicking
    const searchInput = page.getByPlaceholder(/search.*type/i)
    await searchInput.click()
    await expect(searchInput).toBeFocused()

    // Type "n" - should appear in search field, not open dialog
    await page.keyboard.type('n')

    // Verify search field has the character
    await expect(searchInput).toHaveValue('n')

    // Verify NO dialog opened
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).not.toBeVisible()
  })

  test('Tab wraps from relations back to entities', async ({ page, ontologyWorkspace }) => {
    // Start on relations tab (last tab)
    await ontologyWorkspace.selectTab('relations')
    const relationsTab = page.getByRole('tab', { name: /relation types/i })
    await expect(relationsTab).toHaveAttribute('aria-selected', 'true')

    // Press Tab - should wrap to entities tab
    await page.keyboard.press('Tab')

    const entitiesTab = page.getByRole('tab', { name: /entity types/i })
    await expect(entitiesTab).toHaveAttribute('aria-selected', 'true', { timeout: 1000 })
  })
})
