import { test, expect } from '../../fixtures/test-context.js'
import { verifyNoBrowserCapture } from '../helpers/keyboard-test-utils.js'

/**
 * Ontology Workspace Keyboard Shortcuts Tests
 *
 * Tests verify that ontology workspace shortcuts work correctly:
 * - n: Create new type (simple key, no browser conflicts)
 * - /: Focus search field (vim-style, avoids browser Ctrl+F conflict)
 * - Delete: Delete selected type
 * - Enter: Edit selected type
 * - Tab/Shift+Tab: Navigate between type tabs
 */

test.describe('Keyboard Shortcuts - Ontology Workspace', () => {
  test.beforeEach(async ({ page, testUser, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
  })

  test('n creates new entity type', async ({ page, testUser, ontologyWorkspace, testPersona }) => {
    // Ensure on entities tab
    await ontologyWorkspace.selectTab('entities')

    // Press n to create new type
    await page.keyboard.press('n')
    await page.waitForTimeout(500)

    // Verify dialog opened
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Verify it's the create entity type dialog
    await expect(dialog.getByText(/entity type/i)).toBeVisible()
  })

  test('n creates different types based on active tab', async ({ page, testUser, ontologyWorkspace, testPersona }) => {
    // Test on roles tab
    await ontologyWorkspace.selectTab('roles')

    await page.keyboard.press('n')
    await page.waitForTimeout(500)

    let dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/role/i)).toBeVisible()

    // Close dialog
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Test on events tab
    await ontologyWorkspace.selectTab('events')

    await page.keyboard.press('n')
    await page.waitForTimeout(500)

    dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/event type/i)).toBeVisible()
  })

  test('/ focuses search field', async ({ page, testUser, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.selectTab('entities')

    // Wait for search input to be visible (ensures persona is selected and commands are enabled)
    const searchInput = page.getByRole('textbox', { name: /search|filter/i })
    await expect(searchInput).toBeVisible()

    // Press /
    await page.keyboard.press('/')
    await page.waitForTimeout(300)

    // Verify search input is focused
    await expect(searchInput).toBeFocused()
  })

  test('Tab navigates to next type tab', async ({ page, testUser, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.selectTab('entities')

    // Press Tab (should go to next tab)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)

    // Verify moved to roles tab
    const rolesTab = page.getByRole('tab', { name: /role types/i })
    await expect(rolesTab).toHaveAttribute('aria-selected', 'true')
  })

  test('Shift+Tab navigates to previous type tab', async ({ page, testUser, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.selectTab('roles')

    // Press Shift+Tab (should go to previous tab)
    await page.keyboard.press('Shift+Tab')
    await page.waitForTimeout(300)

    // Verify moved to entities tab
    const entitiesTab = page.getByRole('tab', { name: /entity types/i })
    await expect(entitiesTab).toHaveAttribute('aria-selected', 'true')
  })

  test('Delete removes selected type', async ({ page, testUser, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.selectTab('entities')

    // Create a test entity type first
    await page.keyboard.press('n')
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Fill name input
    const nameInput = dialog.getByRole('textbox', { name: /^name$/i })
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Test Type To Delete')
    await page.waitForTimeout(200)

    // Fill gloss definition (required field)
    const glossInput = dialog.getByRole('textbox', { name: /gloss definition/i })
    await expect(glossInput).toBeVisible()
    await glossInput.fill('Test entity type for deletion')
    await page.waitForTimeout(200)

    const saveButton = dialog.getByRole('button', { name: /save|create/i })

    // Wait for save button to be enabled
    await expect(saveButton).toBeEnabled({ timeout: 5000 })
    await saveButton.click()
    await page.waitForTimeout(1000)

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible()

    // Find and click the newly created type to select it
    const typeItem = page.getByText('Test Type To Delete').first()
    await expect(typeItem).toBeVisible()
    await typeItem.click()
    await page.waitForTimeout(300)

    // Press Delete
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)

    // Verify type was deleted (no longer in list)
    await expect(typeItem).not.toBeVisible()
  })

  test('shortcuts disabled when typing in search', async ({ page, testUser, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.selectTab('entities')

    // Click search field to focus it
    const searchInput = page.getByRole('textbox', { name: /search|filter/i })
    await searchInput.click()
    await page.waitForTimeout(200)

    // Verify search input is focused
    await expect(searchInput).toBeFocused()

    // Type "n" using keyboard
    await page.keyboard.type('n')
    await page.waitForTimeout(300)

    // Verify no dialog opened (main test - shortcut was disabled)
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).not.toBeVisible()
  })

  test('keyboard shortcuts work across all ontology tabs', async ({ page, testUser, ontologyWorkspace, testPersona }) => {
    // Test that n works on each tab
    const tabs = ['entities', 'roles', 'events', 'relations'] as const

    for (const tab of tabs) {
      await ontologyWorkspace.selectTab(tab)
      await page.waitForTimeout(300)

      await page.keyboard.press('n')
      await page.waitForTimeout(500)

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      // Close dialog
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }
  })
})
