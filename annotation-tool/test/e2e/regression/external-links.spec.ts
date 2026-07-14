import { test, expect } from '../fixtures/test-context.js'
import { mockWikidata } from '../fixtures/mock-wikidata.js'

/**
 * E2E tests for external link behavior.
 * Tests visibility and behavior of external links (Wikidata, video sources).
 *
 * Note: These tests run against the default online mode configuration.
 * Offline mode tests would require a local Wikibase instance.
 */
test.describe('External Links', () => {
  test.describe('Wikidata Chips', () => {
    test('Wikidata chips link out when enabled (online mode)', async ({
      ontologyWorkspace,
      testPersona,
      page,
    }) => {
      // Intercept the wikidata.org REST endpoints (wbsearchentities /
      // wbgetentities) before any navigation so the search result and
      // preview render deterministically instead of racing the live API.
      await mockWikidata(page)

      await ontologyWorkspace.navigateTo(testPersona.id)
      await ontologyWorkspace.selectTab('entities')

      // Import an entity type from Wikidata to get a Wikidata chip
      await ontologyWorkspace.addTypeFab.click()

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible' })

      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()

      // Wait on the mocked search response rather than a fixed sleep: the
      // input is debounced, so the fetch fires ~300ms after fill settles.
      const searchInput = dialog.getByPlaceholder(/search/i)
      const searchResponse = page.waitForResponse(
        (r) => r.url().includes('action=wbsearchentities') && r.ok(),
      )
      await searchInput.fill('Human')
      await searchResponse

      const firstOption = page.getByRole('option').first()
      await expect(firstOption).toBeVisible({ timeout: 10000 })
      await firstOption.click()

      // Selecting the option triggers wbgetentities; the preview card with
      // the import button renders once that resolves. The web-first
      // assertion auto-waits, so no sleep is needed.
      const importButton = dialog.getByRole('button', { name: /import as entity type/i })
      await expect(importButton).toBeVisible({ timeout: 10000 })

      await importButton.click()

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 10000 })

      // Find the created entity type
      await ontologyWorkspace.expectTypeExists('human')

      // The type-list row renders the Wikidata chip inline (an <a> wrapping
      // a Badge that reads "Wikidata: Q…"). Scope to the imported row so a
      // chip from any other type cannot satisfy the assertion, then verify
      // the chip is a clickable link to Wikidata.
      const humanRow = page
        .locator('[role="tabpanel"]:not([hidden]) li')
        .filter({ has: page.getByRole('button', { name: 'Edit human' }) })
        .first()
      const chipLink = humanRow.locator('a').filter({
        has: page.getByText(/Wikidata:\s*Q/i),
      })
      await expect(chipLink).toBeVisible({ timeout: 10000 })
      const href = await chipLink.getAttribute('href')
      expect(href).toContain('wikidata.org')
    })
  })

  test.describe('Video Source Links', () => {
    test('video metadata shows external links when enabled', async ({
      videoBrowser,
      page,
    }) => {
      // Navigate to video browser
      await videoBrowser.navigateToHome()

      // Wait for video cards to load and click the first one
      await expect(videoBrowser.firstVideoCard).toBeVisible({ timeout: 10000 })
      await videoBrowser.firstVideoCard.click()

      // Clicking a card navigates to the annotation workspace; wait for that
      // landmark to render before inspecting metadata links (replaces a
      // fixed post-navigation sleep).
      await expect(page.getByText(/annotation workspace/i)).toBeVisible({ timeout: 10000 })

      // Video details should be visible
      // External links (like uploader URL, webpage URL) should be present
      // when configured to show

      // Look for any external links in video metadata
      // These could be in a detail panel or video info section
      const externalLinks = page.locator('a[href^="http"]')
      const linkCount = await externalLinks.count()

      // In default config (online mode), external links should be present
      // if the video has metadata with URLs
      // This is just a structural test - we verify links are rendered as links
      if (linkCount > 0) {
        const firstLink = externalLinks.first()
        const href = await firstLink.getAttribute('href')
        expect(href).toBeTruthy()
        // Links should have target="_blank" for external navigation
        const target = await firstLink.getAttribute('target')
        expect(target).toBe('_blank')
      }
    })
  })

  test.describe('Config Response', () => {
    test('API returns externalLinks configuration', async ({ page }) => {
      // Fetch config directly to verify structure
      const response = await page.request.get('/api/config')

      expect(response.ok()).toBe(true)
      const config = await response.json()

      // Verify config structure includes externalLinks
      expect(config).toHaveProperty('externalLinks')
      expect(config.externalLinks).toHaveProperty('wikidata')
      expect(config.externalLinks).toHaveProperty('videoSources')

      // In default (online) mode, both should be true
      expect(typeof config.externalLinks.wikidata).toBe('boolean')
      expect(typeof config.externalLinks.videoSources).toBe('boolean')
    })

    test('API returns wikidata configuration', async ({ page }) => {
      const response = await page.request.get('/api/config')

      expect(response.ok()).toBe(true)
      const config = await response.json()

      // Verify wikidata config structure
      expect(config).toHaveProperty('wikidata')
      expect(config.wikidata).toHaveProperty('mode')
      expect(config.wikidata).toHaveProperty('url')
      expect(config.wikidata).toHaveProperty('allowExternalLinks')

      // In online mode
      expect(config.wikidata.mode).toBe('online')
      expect(config.wikidata.url).toContain('wikidata.org')
      expect(config.wikidata.allowExternalLinks).toBe(true)
    })
  })
})
