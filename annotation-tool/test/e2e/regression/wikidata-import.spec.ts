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
      await page.waitForTimeout(1000) // Wait for debounce

      // Select first result
      const firstResult = dialog.locator('[role="option"]').first()
      await firstResult.click()
      await page.waitForTimeout(500)

      // Should now be on preview step
      await expect(dialog.getByText('Preview & Confirm')).toBeVisible()
      await expect(dialog.getByText(/human/i)).toBeVisible()

      // Click Import and Save button
      const importButton = dialog.getByRole('button', { name: /import and save/i })
      await importButton.click()
      await page.waitForTimeout(1000)

      // Should show success step
      await expect(dialog.getByText('Successfully Imported!')).toBeVisible()
      await expect(dialog.getByRole('button', { name: /undo/i })).toBeVisible()

      // Close dialog
      const doneButton = dialog.getByRole('button', { name: /done/i })
      await doneButton.click()

      // Verify entity type was added
      await ontologyWorkspace.expectTypeExists('Human')
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
      await page.waitForTimeout(1000)

      const firstResult = dialog.locator('[role="option"]').first()
      await firstResult.click()
      await page.waitForTimeout(500)

      const importButton = dialog.getByRole('button', { name: /import and save/i })
      await importButton.click()
      await page.waitForTimeout(1000)

      // Click undo button
      const undoButton = dialog.getByRole('button', { name: /undo/i })
      await undoButton.click()
      await page.waitForTimeout(500)

      // Should return to search step
      await expect(dialog.getByText('Search Wikidata')).toBeVisible()

      // Cancel and close
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
      await page.waitForTimeout(1000)

      const firstResult = dialog.locator('[role="option"]').first()
      await firstResult.click()
      await page.waitForTimeout(500)

      // On preview step, click Back
      const backButton = dialog.getByRole('button', { name: /back/i })
      await backButton.click()

      // Should return to search step
      await expect(dialog.getByTestId('wikidata-search')).toBeVisible()
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
      await page.waitForTimeout(1000)

      const firstResult = dialog.locator('[role="option"]').first()
      await firstResult.click()
      await page.waitForTimeout(500)

      const importButton = dialog.getByRole('button', { name: /import and save/i })
      await importButton.click()
      await page.waitForTimeout(1000)

      await expect(dialog.getByText('Successfully Imported!')).toBeVisible()

      const doneButton = dialog.getByRole('button', { name: /done/i })
      await doneButton.click()

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
      await page.waitForTimeout(1000)

      const firstResult = dialog.locator('[role="option"]').first()
      await firstResult.click()
      await page.waitForTimeout(500)

      const importButton = dialog.getByRole('button', { name: /import and save/i })
      await importButton.click()
      await page.waitForTimeout(1000)

      await expect(dialog.getByText('Successfully Imported!')).toBeVisible()

      const doneButton = dialog.getByRole('button', { name: /done/i })
      await doneButton.click()

      await ontologyWorkspace.expectTypeExists('Commander')
    })
  })

  test.describe('Entity Object Import', () => {
    test('imports entity from Wikidata', async ({ page }) => {
      await page.goto('/objects')
      await page.waitForLoadState('networkidle')

      // Click create entity button
      const createButton = page.getByRole('button', { name: /create entity/i })
      await createButton.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      const wikidataButton = dialog.getByRole('button', { name: /import from wikidata/i })
      await wikidataButton.click()
      await page.waitForTimeout(500)

      const searchInput = dialog.getByPlaceholder(/search/i)
      await searchInput.fill('Albert Einstein')
      await page.waitForTimeout(1000)

      const firstResult = dialog.locator('[role="option"]').first()
      await firstResult.click()
      await page.waitForTimeout(500)

      const importButton = dialog.getByRole('button', { name: /import and save/i })
      await importButton.click()
      await page.waitForTimeout(1000)

      await expect(dialog.getByText('Successfully Imported!')).toBeVisible()

      const doneButton = dialog.getByRole('button', { name: /done/i })
      await doneButton.click()

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

      // Check all stepper steps are visible
      await expect(dialog.getByText('Search Wikidata')).toBeVisible()
      await expect(dialog.getByText('Preview & Confirm')).toBeVisible()
      await expect(dialog.getByText('Success')).toBeVisible()
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
      await page.waitForTimeout(1000)

      const firstResult = dialog.locator('[role="option"]').first()
      await firstResult.click()
      await page.waitForTimeout(500)

      // Preview step should be active
      const stepper = dialog.locator('[class*="MuiStepper"]')
      await expect(stepper).toBeVisible()
    })
  })
})
