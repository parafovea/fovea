import { test, expect } from '../../fixtures/test-context.js'

/**
 * E2E visual regression tests for export/import dialogs.
 * Uses Playwright's toHaveScreenshot() to detect unintended visual changes.
 * Tests cover export dialog, import dialog, and progress indicators.
 */

test.describe('Export/Import Visual Regression', () => {
  test.describe('Export Dialog', () => {
    test('export dialog renders correctly', async ({ page }) => {
      await page.goto('/')

      // Open export dialog via menu
      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }

      const exportButton = page.getByRole('button', { name: /export/i }).or(
        page.getByRole('menuitem', { name: /export/i })
      )

      if (await exportButton.isVisible()) {
        await exportButton.click()

        const dialog = page.getByRole('dialog', { name: /export/i })
        if (await dialog.isVisible({ timeout: 2000 })) {
          await expect(dialog).toHaveScreenshot('export-dialog.png', {
            threshold: 0.2,
            maxDiffPixels: 100
          })
        }
      }
    })

    test('export stats display correctly', async ({ page, testPersona, db }) => {
      // Create some data so stats show non-zero values
      await db.createEntityType(testPersona.id, {
        name: 'Visual Test Entity',
        definition: 'Entity for visual testing'
      })

      await page.goto('/')

      // Open export dialog
      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }

      const exportButton = page.getByRole('button', { name: /export/i }).or(
        page.getByRole('menuitem', { name: /export/i })
      )

      if (await exportButton.isVisible()) {
        await exportButton.click()

        const dialog = page.getByRole('dialog', { name: /export/i })
        if (await dialog.isVisible({ timeout: 2000 })) {
          // Wait for stats to load
          await page.waitForTimeout(500)

          await expect(dialog).toHaveScreenshot('export-dialog-with-stats.png', {
            threshold: 0.2,
            maxDiffPixels: 150
          })
        }
      }
    })

    test('export type selector renders correctly', async ({ page }) => {
      await page.goto('/')

      // Open export dialog
      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }

      const exportButton = page.getByRole('button', { name: /export/i }).or(
        page.getByRole('menuitem', { name: /export/i })
      )

      if (await exportButton.isVisible()) {
        await exportButton.click()

        const dialog = page.getByRole('dialog', { name: /export/i })
        if (await dialog.isVisible({ timeout: 2000 })) {
          // Look for type selector (personas, world, summaries, all)
          const typeSelector = dialog.getByRole('radiogroup').or(
            dialog.getByRole('combobox')
          ).or(
            dialog.locator('[data-testid="export-type-selector"]')
          )

          if (await typeSelector.isVisible()) {
            await expect(typeSelector).toHaveScreenshot('export-type-selector.png', {
              threshold: 0.2,
              maxDiffPixels: 100
            })
          }
        }
      }
    })
  })

  test.describe('Import Dialog', () => {
    test('import dialog renders correctly', async ({ page }) => {
      await page.goto('/')

      // Open import dialog via menu
      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }

      const importButton = page.getByRole('button', { name: /import/i }).or(
        page.getByRole('menuitem', { name: /import/i })
      )

      if (await importButton.isVisible()) {
        await importButton.click()

        const dialog = page.getByRole('dialog', { name: /import/i })
        if (await dialog.isVisible({ timeout: 2000 })) {
          await expect(dialog).toHaveScreenshot('import-dialog.png', {
            threshold: 0.2,
            maxDiffPixels: 100
          })
        }
      }
    })

    test('import file dropzone renders correctly', async ({ page }) => {
      await page.goto('/')

      // Open import dialog
      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }

      const importButton = page.getByRole('button', { name: /import/i }).or(
        page.getByRole('menuitem', { name: /import/i })
      )

      if (await importButton.isVisible()) {
        await importButton.click()

        const dialog = page.getByRole('dialog', { name: /import/i })
        if (await dialog.isVisible({ timeout: 2000 })) {
          // Look for dropzone area
          const dropzone = dialog.locator('[data-testid="import-dropzone"]').or(
            dialog.locator('.dropzone')
          ).or(
            dialog.getByText(/drag.*drop|drop.*file/i).locator('..')
          )

          if (await dropzone.isVisible()) {
            await expect(dropzone).toHaveScreenshot('import-dropzone.png', {
              threshold: 0.2,
              maxDiffPixels: 100
            })
          }
        }
      }
    })

    test('import conflict options render correctly', async ({ page }) => {
      await page.goto('/')

      // Open import dialog
      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }

      const importButton = page.getByRole('button', { name: /import/i }).or(
        page.getByRole('menuitem', { name: /import/i })
      )

      if (await importButton.isVisible()) {
        await importButton.click()

        const dialog = page.getByRole('dialog', { name: /import/i })
        if (await dialog.isVisible({ timeout: 2000 })) {
          // Look for conflict resolution options
          const optionsSection = dialog.getByText(/conflict|options|settings/i).locator('..')

          if (await optionsSection.isVisible()) {
            await expect(optionsSection).toHaveScreenshot('import-conflict-options.png', {
              threshold: 0.2,
              maxDiffPixels: 100
            })
          }
        }
      }
    })
  })

  test.describe('Progress Indicators', () => {
    test('export progress indicator renders correctly', async ({ page, testPersona, db }) => {
      // Create data for export
      await db.createEntityType(testPersona.id, {
        name: 'Progress Test Entity',
        definition: 'Entity for progress testing'
      })

      await page.goto('/')

      // Open export dialog
      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }

      const exportButton = page.getByRole('button', { name: /export/i }).or(
        page.getByRole('menuitem', { name: /export/i })
      )

      if (await exportButton.isVisible()) {
        await exportButton.click()

        const dialog = page.getByRole('dialog', { name: /export/i })
        if (await dialog.isVisible({ timeout: 2000 })) {
          // Start export
          const confirmButton = dialog.getByRole('button', { name: /download|export|confirm/i })
          if (await confirmButton.isVisible()) {
            await confirmButton.click()

            // Look for progress indicator
            const progress = dialog.getByRole('progressbar').or(
              dialog.locator('[data-testid="export-progress"]')
            )

            if (await progress.isVisible({ timeout: 1000 })) {
              await expect(progress).toHaveScreenshot('export-progress.png', {
                threshold: 0.3,
                maxDiffPixels: 200
              })
            }
          }
        }
      }
    })
  })
})
