/**
 * Visual regression for the import-result orphan-skipped banner.
 *
 * The banner surfaces a critical UX cliff: an import that returns
 * `success: true` but silently dropped annotations whose referenced
 * world objects are missing. We previously left this case as a quiet
 * "0 annotations imported" with no warning, which read to users as if
 * the import worked. This test proves the banner renders in a real
 * Chromium against the running stack — the unit-level rendered-output
 * test is gated on a pre-existing pnpm + jsdom React-context issue
 * that affects 23+ existing dialog tests in this repo, so the
 * authoritative verification of "does this actually paint?" lives here.
 */
import { test, expect } from '../../fixtures/test-context.js'
import * as fs from 'fs'
import * as path from 'path'

test.describe('Import result dialog — orphan-skipped banner', () => {
  test('shows the banner when an import drops an annotation with a missing entity reference', async ({ page, testUser }) => {
    // Build a minimal JSONL fixture: one object annotation whose
    // linkedEntityId points at an entity that is NOT included anywhere
    // in the file. The server's import handler will detect the
    // missing-dependency and skip the annotation.
    const orphanFixture = JSON.stringify({
      type: 'annotation',
      data: {
        id: '00000000-0000-0000-0000-0000000000aa',
        // The video must already exist on the server. The test fixture
        // (testVideo) seeds one — but we use a simple known id and
        // accept that the test asserts the dialog UI flow regardless of
        // whether the underlying video exists, since either way the
        // server returns a successful response with skippedItems.
        videoId: 'a653942195eddca5',
        annotationType: 'object',
        userId: testUser.id,
        // Foreign id that is not part of the import and not in the
        // user's world — guaranteed to be flagged as missing-dependency.
        linkedEntityId: '99999999-9999-9999-9999-999999999999',
        boundingBoxSequence: {
          boxes: [{ x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      },
    })

    const tmpFile = path.join(process.cwd(), `orphan-import-${Date.now()}.jsonl`)
    fs.writeFileSync(tmpFile, orphanFixture)

    try {
      await page.goto('/')

      // Open the import dialog. The exact menu path depends on the
      // current UI; this matches the pattern used by the existing
      // export-import functional spec.
      const menuButton = page.getByRole('button', { name: /menu|settings/i })
      if (await menuButton.isVisible({ timeout: 2000 })) {
        await menuButton.click()
      }
      // Match the exact "Import" name so the locator does not also resolve
      // the adjacent "Import Corpus" (layers) toolbar button.
      const importButton = page.getByRole('button', { name: 'Import', exact: true })
        .or(page.getByRole('menuitem', { name: 'Import', exact: true }))
      await importButton.click()

      // Upload the orphan fixture.
      const fileInput = page.locator('input[type="file"]').first()
      await fileInput.setInputFiles(tmpFile)

      // The ImportDataDialog has a preview step that surfaces "2 conflicts
      // detected. Please select resolution strategies" — accept defaults
      // and proceed by clicking the confirm/import button in the dialog
      // footer. Without this the test sat on the preview screen and the
      // result-dialog banner never rendered.
      const confirmImport = page.locator('[role="dialog"]').getByRole('button', { name: /^import( now| data)?$/i }).first()
      await expect(confirmImport).toBeVisible({ timeout: 5000 })
      await expect(confirmImport).toBeEnabled({ timeout: 5000 })
      await confirmImport.click()

      const banner = page.getByTestId('import-orphan-skipped-banner')
      await expect(banner).toBeVisible({ timeout: 15000 })
      await expect(banner).toContainText(/skipped/i)
      await expect(banner).toContainText(/missing referenced data/i)
      await expect(banner).toContainText(/re-export/i)

      // The dialog title softens to "Completed with Warnings" rather
      // than the green "Import Successful" headline.
      await expect(page.getByText(/Completed with Warnings/i)).toBeVisible()
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })
})
