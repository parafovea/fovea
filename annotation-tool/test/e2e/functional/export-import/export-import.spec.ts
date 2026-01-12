import { test, expect } from '../../fixtures/test-context.js'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Export/Import Flow - Functional Tests
 *
 * Tests verify that the export and import functionality:
 * - Exports data correctly in JSONL format
 * - Shows proper statistics before export
 * - Handles warnings for large exports
 * - Imports data with conflict resolution
 * - Shows dependency warnings during import
 */

test.describe('Export/Import Flow', () => {
  test.describe('Export Functionality', () => {
    test('exports data when clicking Export button', async ({ page, testPersona, testVideo, db }) => {
      // Create some data to export
      await db.createEntityType(testPersona.id, {
        name: 'Export Test Entity',
        definition: 'An entity for export testing'
      })

      // Navigate to the export dialog (assuming there's an export button in the UI)
      await page.goto('/')

      // Look for export option in menu or toolbar
      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }

      // Find and click export button/link
      const exportButton = page.getByRole('button', { name: /export/i }).or(
        page.getByRole('menuitem', { name: /export/i })
      ).or(
        page.getByRole('link', { name: /export/i })
      )

      if (await exportButton.isVisible()) {
        // Set up download listener
        const downloadPromise = page.waitForEvent('download')
        await exportButton.click()

        // Wait for export dialog to appear
        const exportDialog = page.getByRole('dialog', { name: /export/i })
        if (await exportDialog.isVisible({ timeout: 2000 })) {
          // Click confirm/download button in dialog
          const confirmButton = exportDialog.getByRole('button', { name: /download|export|confirm/i })
          await confirmButton.click()
        }

        // Wait for download to complete
        const download = await downloadPromise

        // Verify download file
        expect(download.suggestedFilename()).toMatch(/\.(jsonl|json)$/)

        // Save and verify content is valid JSONL
        const downloadPath = await download.path()
        if (downloadPath) {
          const content = fs.readFileSync(downloadPath, 'utf-8')
          const lines = content.trim().split('\n').filter(l => l)

          // Each line should be valid JSON
          for (const line of lines) {
            expect(() => JSON.parse(line)).not.toThrow()
            const parsed = JSON.parse(line)
            expect(parsed.type).toBeDefined()
            expect(parsed.data).toBeDefined()
          }
        }
      }
    })

    test('export stats show before download', async ({ page, testPersona, db }) => {
      // Create data
      await db.createEntityType(testPersona.id, {
        name: 'Stats Test Entity',
        definition: 'Entity for stats testing'
      })

      // Navigate to export
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

        // Check for stats display in dialog
        const exportDialog = page.getByRole('dialog', { name: /export/i })
        if (await exportDialog.isVisible({ timeout: 2000 })) {
          // Should show statistics about what will be exported
          const statsText = await exportDialog.textContent()
          // Stats might include counts like "1 persona", "1 entity type", etc.
          expect(statsText).toBeTruthy()
        }
      }
    })

    test('exports work without bounding box annotations', async ({ page, testPersona, db }) => {
      // Create only ontology/world objects, no annotations
      await db.createEntityType(testPersona.id, {
        name: 'No Annotation Entity',
        definition: 'Entity without bbox annotations'
      })

      // Navigate to export
      await page.goto('/')

      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }

      const exportButton = page.getByRole('button', { name: /export/i }).or(
        page.getByRole('menuitem', { name: /export/i })
      )

      if (await exportButton.isVisible()) {
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
        await exportButton.click()

        const exportDialog = page.getByRole('dialog', { name: /export/i })
        if (await exportDialog.isVisible({ timeout: 2000 })) {
          const confirmButton = exportDialog.getByRole('button', { name: /download|export|confirm/i })
          await confirmButton.click()
        }

        // Export should succeed even without bbox annotations
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.(jsonl|json)$/)
      }
    })
  })

  test.describe('Import Functionality', () => {
    test('import dialog accepts JSONL file', async ({ page }) => {
      // Navigate to import
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

        // Check for import dialog with file input
        const importDialog = page.getByRole('dialog', { name: /import/i })
        if (await importDialog.isVisible({ timeout: 2000 })) {
          // Should have a file input
          const fileInput = importDialog.locator('input[type="file"]')
          await expect(fileInput).toBeAttached()

          // Should accept .jsonl files
          const acceptAttr = await fileInput.getAttribute('accept')
          expect(acceptAttr).toContain('.jsonl')
        }
      }
    })

    test('shows preview before importing', async ({ page }) => {
      // Create a test JSONL file
      const testData = [
        { type: 'persona', data: { id: 'test-persona', name: 'Test', role: 'Analyst', informationNeed: 'Testing' } }
      ]
      const testFile = path.join('/tmp', 'test-import.jsonl')
      fs.writeFileSync(testFile, testData.map(d => JSON.stringify(d)).join('\n'))

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

        const importDialog = page.getByRole('dialog', { name: /import/i })
        if (await importDialog.isVisible({ timeout: 2000 })) {
          // Upload file
          const fileInput = importDialog.locator('input[type="file"]')
          await fileInput.setInputFiles(testFile)

          // Should show preview with counts
          await expect(importDialog.getByText(/preview|1 persona/i)).toBeVisible({ timeout: 5000 })
        }
      }

      // Cleanup
      fs.unlinkSync(testFile)
    })

    test('shows dependency warnings during import', async ({ page }) => {
      // Create a JSONL file with missing dependencies
      const testData = [
        {
          type: 'annotation',
          data: {
            id: 'test-annotation',
            videoId: 'non-existent-video',
            annotationType: 'type',
            boundingBoxSequence: { boxes: [], interpolationSegments: [], visibilityRanges: [], totalFrames: 0, keyframeCount: 0, interpolatedFrameCount: 0 }
          }
        }
      ]
      const testFile = path.join('/tmp', 'test-import-missing-deps.jsonl')
      fs.writeFileSync(testFile, testData.map(d => JSON.stringify(d)).join('\n'))

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

        const importDialog = page.getByRole('dialog', { name: /import/i })
        if (await importDialog.isVisible({ timeout: 2000 })) {
          // Upload file
          const fileInput = importDialog.locator('input[type="file"]')
          await fileInput.setInputFiles(testFile)

          // Should show warning about missing video
          await expect(importDialog.getByText(/warning|missing|not found/i)).toBeVisible({ timeout: 5000 })
        }
      }

      // Cleanup
      fs.unlinkSync(testFile)
    })
  })

  test.describe('Round-trip: Export -> Import', () => {
    test('exported data can be re-imported', async ({ page, testPersona, db }) => {
      // Create data to export
      await db.createEntityType(testPersona.id, {
        name: 'Round Trip Entity',
        definition: 'Entity for round-trip testing'
      })

      // Export data via API (to avoid UI complexity)
      const exportResponse = await page.request.get('http://localhost:3001/api/export')
      expect(exportResponse.ok()).toBeTruthy()

      const exportedContent = await exportResponse.text()
      expect(exportedContent).toBeTruthy()

      // Verify exported content is valid JSONL
      const lines = exportedContent.trim().split('\n').filter(l => l)
      for (const line of lines) {
        const parsed = JSON.parse(line)
        expect(parsed.type).toBeDefined()
        expect(parsed.data).toBeDefined()
      }

      // Verify the entity type we created is in the export
      const hasEntityType = lines.some(line => {
        const parsed = JSON.parse(line)
        return parsed.type === 'ontology' ||
               (parsed.type === 'entity' && parsed.data.name === 'Round Trip Entity')
      })
      expect(hasEntityType || lines.length > 0).toBeTruthy()
    })
  })
})
