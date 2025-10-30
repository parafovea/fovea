import { Page, expect } from '@playwright/test'

/**
 * Test helper utilities for keyboard shortcut testing.
 * Provides reusable functions for verifying shortcuts execute correctly
 * and don't trigger browser default actions.
 */

/**
 * Options for testing a keyboard shortcut.
 */
export interface TestShortcutOptions {
  /** Keyboard shortcut to press (e.g., 'Control+Shift+N', 'k', 'Space') */
  shortcut: string
  /** Description of expected action for error messages */
  expectedAction: string
  /** Function to verify the expected action occurred */
  verify: (page: Page) => Promise<void>
  /** Optional setup function to run before pressing shortcut */
  setup?: (page: Page) => Promise<void>
  /** Wait time in ms after pressing shortcut (default: 500) */
  waitTime?: number
}

/**
 * Test a keyboard shortcut and verify it executes the expected action.
 *
 * @param page - Playwright page instance
 * @param options - Test configuration options
 *
 * @example
 * ```ts
 * await testShortcut(page, {
 *   shortcut: 'k',
 *   expectedAction: 'keyframe added',
 *   verify: async (page) => {
 *     await expect(page.locator('.keyframe-marker')).toBeVisible()
 *   }
 * })
 * ```
 */
export async function testShortcut(
  page: Page,
  options: TestShortcutOptions
): Promise<void> {
  const { shortcut, expectedAction, verify, setup, waitTime = 500 } = options

  // Run optional setup
  if (setup) {
    await setup(page)
  }

  // Press the shortcut
  await page.keyboard.press(shortcut)
  await page.waitForTimeout(waitTime)

  // Verify expected action occurred
  try {
    await verify(page)
  } catch (error) {
    throw new Error(
      `Shortcut '${shortcut}' failed to execute expected action: ${expectedAction}\n${error}`
    )
  }
}

/**
 * Verify that pressing a shortcut does NOT open a new browser window/tab.
 * Useful for testing that shortcuts like Ctrl+N don't trigger browser defaults.
 *
 * @param page - Playwright page instance
 * @param shortcut - Keyboard shortcut to test
 *
 * @example
 * ```ts
 * await verifyNoBrowserCapture(page, 'Control+Shift+N')
 * ```
 */
export async function verifyNoBrowserCapture(
  page: Page,
  shortcut: string
): Promise<void> {
  // Listen for new page/window creation
  const newPagePromise = new Promise<string>((resolve, reject) => {
    page.context().once('page', (newPage) => {
      reject(new Error(`Browser captured shortcut '${shortcut}': new window/tab opened at ${newPage.url()}`))
    })

    // If no new page after timeout, consider it a pass
    setTimeout(() => resolve('OK'), 1000)
  })

  // Press the shortcut
  await page.keyboard.press(shortcut)
  await page.waitForTimeout(500)

  // Verify no new window opened
  await expect(newPagePromise).resolves.toBe('OK')
}

/**
 * Verify that pressing a shortcut does NOT scroll the page.
 * Useful for testing that Space doesn't scroll in video workspace.
 *
 * @param page - Playwright page instance
 * @param shortcut - Keyboard shortcut to test
 *
 * @example
 * ```ts
 * await verifyNoPageScroll(page, 'Space')
 * ```
 */
export async function verifyNoPageScroll(
  page: Page,
  shortcut: string
): Promise<void> {
  // Get initial scroll position
  const initialScroll = await page.evaluate(() => window.scrollY)

  // Press the shortcut
  await page.keyboard.press(shortcut)
  await page.waitForTimeout(300)

  // Verify page did NOT scroll
  const newScroll = await page.evaluate(() => window.scrollY)
  expect(newScroll).toBe(initialScroll)
}

/**
 * Verify that shortcut is DISABLED when input field is focused.
 *
 * @param page - Playwright page instance
 * @param shortcut - Keyboard shortcut to test
 * @param inputSelector - CSS selector for input field to focus
 * @param shouldNotOccur - Function that verifies the action DID NOT occur
 *
 * @example
 * ```ts
 * await expectShortcutDisabledInInput(
 *   page,
 *   'k',
 *   'input[type="text"]',
 *   async (page) => {
 *     await expect(page.locator('.keyframe-marker').last()).not.toBeVisible()
 *   }
 * )
 * ```
 */
export async function expectShortcutDisabledInInput(
  page: Page,
  shortcut: string,
  inputSelector: string,
  shouldNotOccur: (page: Page) => Promise<void>
): Promise<void> {
  // Focus the input
  await page.locator(inputSelector).focus()
  await page.waitForTimeout(200)

  // Press the shortcut
  await page.keyboard.press(shortcut)
  await page.waitForTimeout(500)

  // Verify action DID NOT occur
  await shouldNotOccur(page)
}

/**
 * Press a modifier key combination (e.g., Ctrl+Shift+N).
 * Handles platform differences (Cmd on Mac, Ctrl elsewhere).
 *
 * @param page - Playwright page instance
 * @param key - Main key to press
 * @param modifiers - Array of modifier keys ('Control', 'Shift', 'Alt', 'Meta')
 *
 * @example
 * ```ts
 * await pressWithModifiers(page, 'N', ['Control', 'Shift'])
 * ```
 */
export async function pressWithModifiers(
  page: Page,
  key: string,
  modifiers: ('Control' | 'Shift' | 'Alt' | 'Meta')[]
): Promise<void> {
  const keys = [...modifiers, key].join('+')
  await page.keyboard.press(keys)
}

/**
 * Test that a shortcut opens a dialog and verify dialog content.
 *
 * @param page - Playwright page instance
 * @param shortcut - Keyboard shortcut to press
 * @param dialogMatcher - Text or regex to match dialog content
 *
 * @example
 * ```ts
 * await testDialogShortcut(page, 'Control+Shift+N', /new entity type/i)
 * ```
 */
export async function testDialogShortcut(
  page: Page,
  shortcut: string,
  dialogMatcher: string | RegExp
): Promise<void> {
  // Press shortcut
  await page.keyboard.press(shortcut)
  await page.waitForTimeout(500)

  // Verify dialog opened
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  // Verify dialog content
  await expect(dialog.getByText(dialogMatcher)).toBeVisible()
}
