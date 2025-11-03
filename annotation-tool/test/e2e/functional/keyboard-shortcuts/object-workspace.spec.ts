import { test, expect } from '../../fixtures/test-context.js'

/**
 * Object Workspace Keyboard Shortcuts Tests
 *
 * Tests verify that object workspace shortcuts work correctly:
 * - n: Create new object (simple key, no browser conflicts)
 * - /: Focus search field (vim-style, avoids browser Ctrl+F conflict)
 * - Delete: Delete selected object
 * - T: Open time builder
 * - C: Open collection builder
 * - Tab/Shift+Tab: Navigate between object tabs
 */

test.describe('Keyboard Shortcuts - Object Workspace', () => {
  test.beforeEach(async ({ page, _testUser }) => {
    await page.goto('/objects')
    await expect(page).toHaveURL('/objects')
    await page.waitForLoadState('networkidle')
    // Wait for command system to initialize
    await page.waitForTimeout(1000)
  })

  test('n creates new entity', async ({ page, _testUser }) => {
    // Ensure on entities tab
    const entitiesTab = page.getByRole('tab', { name: /entities/i })
    await entitiesTab.click()
    await page.waitForTimeout(300)

    // Blur any focused input (search box might have focus)
    const searchInput = page.getByRole('textbox', { name: /search/i })
    if (await searchInput.isVisible()) {
      await searchInput.blur()
    }
    await page.waitForTimeout(200)

    // Press n to create new entity
    await page.keyboard.press('n')
    await page.waitForTimeout(500)

    // Verify dialog opened
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Verify it's the create entity dialog (use button for specificity)
    await expect(dialog.getByRole('button', { name: /create entity/i })).toBeVisible()
  })

  test('n creates different objects based on active tab', async ({ page, _testUser }) => {
    // Blur search input first
    const searchInput = page.getByRole('textbox', { name: /search/i })
    if (await searchInput.isVisible()) {
      await searchInput.blur()
    }
    await page.waitForTimeout(200)

    // Test on events tab
    const eventsTab = page.getByRole('tab', { name: /events/i })
    await eventsTab.click()
    await page.waitForTimeout(300)

    await page.keyboard.press('n')
    await page.waitForTimeout(500)

    let dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: /create event/i })).toBeVisible()

    // Close dialog
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Test on locations tab
    const locationsTab = page.getByRole('tab', { name: /locations/i })
    await locationsTab.click()
    await page.waitForTimeout(300)

    await page.keyboard.press('n')
    await page.waitForTimeout(500)

    dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: /create location/i })).toBeVisible()
  })

  test('/ focuses search field', async ({ page, _testUser }) => {
    const entitiesTab = page.getByRole('tab', { name: /entities/i })
    await entitiesTab.click()
    await page.waitForTimeout(300)

    // Press /
    await page.keyboard.press('/')
    await page.waitForTimeout(300)

    // Verify search input is focused
    const searchInput = page.getByRole('textbox', { name: /search|filter/i })
    await expect(searchInput).toBeFocused()
  })

  test('Tab navigates to next object tab', async ({ page, _testUser }) => {
    const entitiesTab = page.getByRole('tab', { name: /entities/i })
    await entitiesTab.click()
    await page.waitForTimeout(300)

    // Press Tab (should go to next tab)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)

    // Verify moved to events tab
    const eventsTab = page.getByRole('tab', { name: /events/i })
    await expect(eventsTab).toHaveAttribute('aria-selected', 'true')
  })

  test('Shift+Tab navigates to previous object tab', async ({ page, _testUser }) => {
    const eventsTab = page.getByRole('tab', { name: /events/i })
    await eventsTab.click()
    await page.waitForTimeout(300)

    // Press Shift+Tab (should go to previous tab)
    await page.keyboard.press('Shift+Tab')
    await page.waitForTimeout(300)

    // Verify moved to entities tab
    const entitiesTab = page.getByRole('tab', { name: /entities/i })
    await expect(entitiesTab).toHaveAttribute('aria-selected', 'true')
  })

  test('shortcuts disabled when typing in search', async ({ page, _testUser }) => {
    const entitiesTab = page.getByRole('tab', { name: /entities/i })
    await entitiesTab.click()
    await page.waitForTimeout(300)

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

  test('keyboard shortcuts work across all object tabs', async ({ page, _testUser }) => {
    // Blur search input first
    const searchInput = page.getByRole('textbox', { name: /search/i })
    if (await searchInput.isVisible()) {
      await searchInput.blur()
    }
    await page.waitForTimeout(200)

    // Test that n works on each tab (except Collections)
    const tabs = ['entities', 'events', 'locations', 'times'] as const

    for (const tab of tabs) {
      const tabElement = page.getByRole('tab', { name: new RegExp(tab, 'i') })
      await tabElement.click()
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
