import { Page, Locator, expect } from '@playwright/test'

/**
 * Base Page Object class providing common functionality for all page objects.
 * All page objects should extend this class to inherit navigation and waiting utilities.
 */
export abstract class BasePage {
  constructor(protected page: Page) {}

  /**
   * Navigate to a specific path within the application.
   * @param path - The path to navigate to (e.g., '/annotate/video-id')
   */
  async goto(path: string): Promise<void> {
    await this.page.goto(path)
    await this.waitForLoad()
  }

  /**
   * Wait for the page to fully load.
   * Waits for network idle and DOM content loaded.
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForLoadState('domcontentloaded')
  }

  /**
   * Wait for a specific selector to be visible.
   * @param selector - CSS selector or data-testid
   * @param timeout - Optional timeout in milliseconds
   */
  async waitForSelector(selector: string, timeout?: number): Promise<Locator> {
    const locator = this.page.locator(selector)
    await expect(locator).toBeVisible({ timeout })
    return locator
  }

  /**
   * Wait for a specific duration.
   * Use sparingly - prefer waitForSelector or other deterministic waits.
   * @param ms - Milliseconds to wait
   */
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms)
  }

  /**
   * Get the current URL of the page.
   */
  url(): string {
    return this.page.url()
  }

  /**
   * Take a screenshot of the page.
   * @param path - Optional path to save screenshot
   */
  async screenshot(path?: string): Promise<Buffer> {
    return this.page.screenshot({ path })
  }

  /**
   * Reload the current page.
   */
  async reload(): Promise<void> {
    await this.page.reload()
    await this.waitForLoad()
  }
}
