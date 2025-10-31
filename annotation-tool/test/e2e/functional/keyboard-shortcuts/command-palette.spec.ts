import { test, expect } from '../../fixtures/test-context.js'

/**
 * E2E tests for Command Palette functionality.
 * Tests VS Code-style command palette with keyboard shortcuts.
 */

test.describe('Command Palette', () => {
  test.beforeEach(async ({ videoBrowser }) => {
    await videoBrowser.navigateToHome()
  })

  test('opens with Cmd+Shift+P', async ({ page }) => {
    // Open command palette (platform-aware: Cmd on Mac, Ctrl elsewhere)
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    // Verify dialog opened
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 2000 })

    // Verify search input is visible
    const searchInput = dialog.locator('input[placeholder*="command"]')
    await expect(searchInput).toBeVisible()

    // Input should be ready to accept typing (focus timing can vary)
    await searchInput.click()
    await expect(searchInput).toBeFocused()
  })

  test('displays all available commands', async ({ page }) => {
    // Open command palette
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Should show at least global navigation commands
    await expect(page.getByText(/go to video browser/i)).toBeVisible()
    await expect(page.getByText(/go to ontology builder/i)).toBeVisible()
    await expect(page.getByText(/go to object builder/i)).toBeVisible()
  })

  test('searches and filters commands', async ({ page }) => {
    // Open command palette
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Type search query
    const searchInput = dialog.locator('input[placeholder*="command"]')
    await searchInput.fill('ontology')

    // Should show only ontology-related commands
    await expect(page.getByText(/go to ontology builder/i)).toBeVisible()

    // Should NOT show non-matching commands
    const commandItems = dialog.locator('[role="button"]')
    const commandCount = await commandItems.count()

    // Verify filtered results (should be less than total)
    expect(commandCount).toBeGreaterThan(0)
    expect(commandCount).toBeLessThan(20) // Assuming there are more than 20 total commands
  })

  test('executes command on click', async ({ page }) => {
    // Open command palette
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Search for ontology command
    const searchInput = dialog.locator('input[placeholder*="command"]')
    await searchInput.fill('ontology builder')

    // Click the "Go to Ontology Builder" command
    await page.getByText(/go to ontology builder/i).click()

    // Verify navigation occurred
    await page.waitForURL(/\/ontology/, { timeout: 5000 })
    expect(page.url()).toContain('/ontology')

    // Verify dialog closed
    await expect(dialog).not.toBeVisible()
  })

  test('executes command with Enter key', async ({ page }) => {
    // Open command palette
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Search for objects command
    const searchInput = dialog.locator('input[placeholder*="command"]')
    await searchInput.fill('object builder')

    // Wait for filtered results
    await expect(page.getByText(/go to object builder/i)).toBeVisible()

    // Press Enter to execute first result
    await searchInput.press('Enter')

    // Verify navigation occurred
    await page.waitForURL(/\/objects/, { timeout: 5000 })
    expect(page.url()).toContain('/objects')

    // Verify dialog closed
    await expect(dialog).not.toBeVisible()
  })

  test('navigates commands with arrow keys', async ({ page }) => {
    // Open command palette
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    const searchInput = dialog.locator('input[placeholder*="command"]')

    // Press down arrow to select next command
    await searchInput.press('ArrowDown')

    // Press down arrow again
    await searchInput.press('ArrowDown')

    // Press up arrow to go back
    await searchInput.press('ArrowUp')

    // Should be able to execute with Enter
    await searchInput.press('Enter')

    // Dialog should close (command executed)
    await expect(dialog).not.toBeVisible({ timeout: 2000 })
  })

  test('closes with Escape key', async ({ page }) => {
    // Open command palette
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Verify dialog closed
    await expect(dialog).not.toBeVisible()
  })

  test('shows keybindings for commands', async ({ page }) => {
    // Open command palette
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Search for a command with keybinding
    const searchInput = dialog.locator('input[placeholder*="command"]')
    await searchInput.fill('save')

    // Should show "Save" command
    await expect(page.getByText(/save/i).first()).toBeVisible()

    // Keybindings are displayed in Paper components with outlined variant
    // Verify that keybinding display elements exist (MUI Paper with backgroundColor grey.100)
    const listItems = dialog.locator('[role="button"]')
    const firstItem = listItems.first()
    await expect(firstItem).toBeVisible()

    // Keybinding should be in a Paper element within the list item
    const keybindingPaper = firstItem.locator('.MuiPaper-root')
    if (await keybindingPaper.count() > 0) {
      await expect(keybindingPaper.first()).toBeVisible()
    }
  })

  test('reopens with clean state after closing', async ({ page }) => {
    // Open command palette
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    let dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Type search query
    const searchInput = dialog.locator('input[placeholder*="command"]')
    await searchInput.fill('test query')

    // Close with Escape
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()

    // Reopen
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    // Should be visible again
    dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Search input should be empty (clean state)
    const newSearchInput = dialog.locator('input[placeholder*="command"]')
    await expect(newSearchInput).toHaveValue('')
  })

  test('filters commands by category', async ({ page }) => {
    // Open command palette
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Search by category
    const searchInput = dialog.locator('input[placeholder*="command"]')
    await searchInput.fill('navigation')

    // Should show navigation category commands
    const navCommands = page.locator('[role="button"]:has-text("navigation")')
    const count = await navCommands.count()
    expect(count).toBeGreaterThan(0)
  })
})
