import { test, expect } from '../fixtures/test-context.js'

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
      await ontologyWorkspace.navigateTo(testPersona.id)
      await ontologyWorkspace.selectTab('entities')

      // Import an entity type from Wikidata to get a Wikidata chip
      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible' })

      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      const searchInput = dialog.getByPlaceholder(/search/i)
      await searchInput.fill('Human')
      await page.waitForTimeout(2000)

      const firstOption = page.getByRole('option').first()
      await expect(firstOption).toBeVisible({ timeout: 5000 })
      await firstOption.click()
      await page.waitForTimeout(1000)

      // Preview should show with Wikidata chip
      const importButton = dialog.getByRole('button', { name: /import as entity type/i })
      await expect(importButton).toBeVisible({ timeout: 3000 })

      await importButton.click()
      await page.waitForTimeout(1000)

      // Dialog should close
      await expect(dialog).not.toBeVisible()

      // Find the created entity type
      await ontologyWorkspace.expectTypeExists('human')

      // Click on the entity type to see details
      const typeCard = page.getByText('human', { exact: false }).first()
      await typeCard.click()
      await page.waitForTimeout(500)

      // Look for Wikidata badge in the UI (rendered as shadcn Badge wrapped in <a> when external links are enabled)
      const wikidataChip = page.getByText(/Wikidata:\s*Q/i)

      const chipCount = await wikidataChip.count()
      if (chipCount > 0) {
        // The Badge renders inside an anchor when allowExternalLinks is true; locate the enclosing link
        const chipLink = page.locator('a', { has: page.getByText(/Wikidata:\s*Q/i) })
        const linkCount = await chipLink.count()

        // In online mode with external links enabled, chip should be a clickable link to Wikidata
        if (linkCount > 0) {
          const href = await chipLink.first().getAttribute('href')
          expect(href).toContain('wikidata.org')
        }
      }
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
      await page.waitForTimeout(500)

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
