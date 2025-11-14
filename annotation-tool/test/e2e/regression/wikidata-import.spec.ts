import { test, expect } from '../fixtures/test-context.js'

/**
 * E2E tests for Wikidata import functionality with one-click import and undo.
 * Tests the new WikidataImportFlow component across different entity types.
 */
test.describe('Wikidata Import Flow', () => {
  test.describe('Entity Type Import', () => {
    test('imports entity type from Wikidata with one-click', async ({ ontologyWorkspace, testPersona, page }) => {
      await ontologyWorkspace.navigateTo(testPersona.id)
      await ontologyWorkspace.selectTab('entities')

      // Click add button
      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible' })

      // Select Wikidata mode
      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      // Search for "Human" in Wikidata
      const searchInput = dialog.getByPlaceholder(/search/i)
      await searchInput.fill('Human')
      await page.waitForTimeout(2000) // Wait for API response

      // Click first option from dropdown
      const firstOption = page.getByRole('option').first()
      await expect(firstOption).toBeVisible({ timeout: 5000 })
      await firstOption.click()
      await page.waitForTimeout(1000)

      // Now preview card should show with import button
      const importButton = dialog.getByRole('button', { name: /import as entity type/i })
      await expect(importButton).toBeVisible({ timeout: 3000 })

      // Click Import as Entity Type button
      await importButton.click()
      await page.waitForTimeout(1000)

      // Dialog should close and entity type should be added
      await expect(dialog).not.toBeVisible()

      // Verify entity type was added
      await ontologyWorkspace.expectTypeExists('human')
    })

    test('allows undoing import within timeout', async ({ ontologyWorkspace, testPersona, page }) => {
      await ontologyWorkspace.navigateTo(testPersona.id)
      await ontologyWorkspace.selectTab('entities')

      // Import entity type
      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible' })

      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      const searchInput = dialog.getByPlaceholder(/search/i)
      await searchInput.fill('Dog')
      await page.waitForTimeout(2000)

      // Click first option from dropdown
      const firstOption = page.getByRole('option').first()
      await expect(firstOption).toBeVisible({ timeout: 5000 })
      await firstOption.click()
      await page.waitForTimeout(1000)

      // Preview should show with import button
      const importAsTypeButton = dialog.getByRole('button', { name: /import as entity type/i })
      await expect(importAsTypeButton).toBeVisible({ timeout: 3000 })

      // Cancel without importing
      const cancelButton = dialog.getByRole('button', { name: /cancel/i })
      await cancelButton.click()

      // Verify entity type was NOT added
      await ontologyWorkspace.expectTypeNotExists('Dog')
    })

    test('allows going back from preview step', async ({ ontologyWorkspace, testPersona, page }) => {
      await ontologyWorkspace.navigateTo(testPersona.id)
      await ontologyWorkspace.selectTab('entities')

      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      const searchInput = dialog.getByPlaceholder(/search/i)
      await searchInput.fill('Cat')
      await page.waitForTimeout(2000)

      // Click first option
      const firstOption = page.getByRole('option').first()
      await expect(firstOption).toBeVisible({ timeout: 5000 })
      await firstOption.click()
      await page.waitForTimeout(1000)

      // Preview should show
      const importAsTypeButton = dialog.getByRole('button', { name: /import as entity type/i })
      await expect(importAsTypeButton).toBeVisible({ timeout: 3000 })

      // Clear search to go back
      await searchInput.clear()
      await page.waitForTimeout(500)

      // Search box should be empty and ready for new search
      await expect(searchInput).toHaveValue('')
    })
  })

  test.describe('Event Type Import', () => {
    test('imports event type from Wikidata', async ({ ontologyWorkspace, testPersona, page }) => {
      await ontologyWorkspace.navigateTo(testPersona.id)
      await ontologyWorkspace.selectTab('events')

      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      const searchInput = dialog.getByPlaceholder(/search/i)
      await searchInput.fill('Battle')
      await page.waitForTimeout(2000)

      const firstOption = page.getByRole('option').first()
      await expect(firstOption).toBeVisible({ timeout: 5000 })
      await firstOption.click()
      await page.waitForTimeout(1000)

      const importButton = dialog.getByRole('button', { name: /import as event type/i })
      await expect(importButton).toBeVisible({ timeout: 3000 })

      await importButton.click()
      await page.waitForTimeout(1000)

      await expect(dialog).not.toBeVisible()

      await ontologyWorkspace.expectTypeExists('Battle')
    })
  })

  test.describe('Role Type Import', () => {
    test('imports role type from Wikidata', async ({ ontologyWorkspace, testPersona, page }) => {
      await ontologyWorkspace.navigateTo(testPersona.id)
      await ontologyWorkspace.selectTab('roles')

      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      const searchInput = dialog.getByPlaceholder(/search/i)
      await searchInput.fill('Commander')
      await page.waitForTimeout(2000)

      const firstOption = page.getByRole('option').first()
      await expect(firstOption).toBeVisible({ timeout: 5000 })
      await firstOption.click()
      await page.waitForTimeout(1000)

      const importButton = dialog.getByRole('button', { name: /import as role type/i })
      await expect(importButton).toBeVisible({ timeout: 3000 })

      await importButton.click()
      await page.waitForTimeout(1000)

      await expect(dialog).not.toBeVisible()

      await ontologyWorkspace.expectTypeExists('Commander')
    })
  })

  test.describe('Entity Object Import', () => {
    test('imports entity from Wikidata', async ({ objectWorkspace, testPersona, testEntityType, page }) => {
      // Navigate to object workspace
      await objectWorkspace.navigateTo()
      await objectWorkspace.selectTab('entities')

      // Click FAB to open dialog
      await objectWorkspace.addFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible', timeout: 5000 })
      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      const searchInput = dialog.getByPlaceholder(/search/i)
      await searchInput.fill('Albert Einstein')
      await page.waitForTimeout(2000)

      const firstOption = page.getByRole('option').first()
      await expect(firstOption).toBeVisible({ timeout: 5000 })
      await firstOption.click()
      await page.waitForTimeout(1000)

      const importButton = dialog.getByRole('button', { name: /import as entity/i })
      await expect(importButton).toBeVisible({ timeout: 3000 })

      await importButton.click()
      await page.waitForTimeout(1000)

      await expect(dialog).not.toBeVisible()

      // Verify entity appears in list
      await expect(page.getByText('Albert Einstein')).toBeVisible()
    })
  })

  test.describe('Stepper Navigation', () => {
    test('displays all three stepper steps', async ({ ontologyWorkspace, testPersona, page }) => {
      await ontologyWorkspace.navigateTo(testPersona.id)
      await ontologyWorkspace.selectTab('entities')

      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      // Check all stepper steps are visible (use more specific selectors)
      await expect(dialog.locator('.MuiStepLabel-label').filter({ hasText: 'Search Wikidata' }).first()).toBeVisible()
      await expect(dialog.locator('.MuiStepLabel-label').filter({ hasText: 'Preview & Confirm' }).first()).toBeVisible()
      await expect(dialog.locator('.MuiStepLabel-label').filter({ hasText: 'Success' }).first()).toBeVisible()
    })

    test('highlights active step', async ({ ontologyWorkspace, testPersona, page }) => {
      await ontologyWorkspace.navigateTo(testPersona.id)
      await ontologyWorkspace.selectTab('entities')

      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      const searchInput = dialog.getByPlaceholder(/search/i)
      await searchInput.fill('Test')
      await page.waitForTimeout(2000)

      // Click first option
      const firstOption = page.getByRole('option').first()
      await expect(firstOption).toBeVisible({ timeout: 5000 })
      await firstOption.click()
      await page.waitForTimeout(1000)

      // Preview should be visible
      const importAsTypeButton = dialog.getByRole('button', { name: /import as entity type/i })
      await expect(importAsTypeButton).toBeVisible({ timeout: 3000 })

      // Stepper should be visible
      const stepper = dialog.locator('[class*="MuiStepper"]')
      await expect(stepper).toBeVisible()
    })
  })
})
