/**
 * @file import-export-roundtrip.spec.ts
 * @description E2E tests for import/export roundtrip workflow.
 * Tests the complete export and re-import workflow from Sessions 7, 8, 9.
 */

import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

test.describe('Import/Export Roundtrip', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to video annotation page
    await page.goto('/videos')
  })

  test('export and re-import annotation sequence', async ({ page }) => {
    // Step 1: User creates sequence annotation (3 keyframes)
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    // Wait for video to load
    await expect(page.locator('video').first()).toBeVisible()

    // Draw initial bounding box at frame 0
    await page.click('button:has-text("Draw Bounding Box")')
    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    // Add keyframe at frame 30
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight') // Jump 10 frames
    }
    await page.keyboard.press('k')

    // Resize box
    const handle = page.locator('[data-testid="resize-handle-se"]').first()
    const handleBox = await handle.boundingBox()
    if (handleBox) {
      await page.mouse.move(handleBox.x, handleBox.y)
      await page.mouse.down()
      await page.mouse.move(handleBox.x + 50, handleBox.y + 30)
      await page.mouse.up()
    }

    // Add keyframe at frame 60
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }
    await page.keyboard.press('k')

    // Move box
    const boundingBox = page.locator('[data-annotation-id]').first()
    const boxBounds = await boundingBox.boundingBox()
    if (boxBounds) {
      await page.mouse.move(boxBounds.x + 50, boxBounds.y + 50)
      await page.mouse.down()
      await page.mouse.move(boxBounds.x + 150, boxBounds.y + 100)
      await page.mouse.up()
    }

    // Save annotation
    await page.click('button:has-text("Save")')
    await expect(page.locator('text=/Annotation saved/i')).toBeVisible()

    // Step 2: Open export dialog
    await page.click('button:has-text("Export")')
    await expect(page.locator('text=/Export Annotations/i')).toBeVisible()

    // Step 3: Select keyframes-only mode
    const keyframesOnlyRadio = page.locator('input[type="radio"][value="keyframes-only"]')
    await keyframesOnlyRadio.check()

    // Verify statistics show 3 keyframes
    await expect(page.locator('text=/3 keyframes/i')).toBeVisible()

    // Step 4: Download export file
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Export")')
    const download = await downloadPromise

    // Save to temp location
    const downloadPath = path.join('/tmp', 'test-export.jsonl')
    await download.saveAs(downloadPath)

    // Verify file exists
    expect(fs.existsSync(downloadPath)).toBe(true)

    // Step 5: Delete annotation from UI
    await page.click('button:has-text("Delete Annotation")')

    // Confirm deletion
    await page.click('button:has-text("Confirm")')
    await expect(page.locator('text=/Annotation deleted/i')).toBeVisible()

    // Verify annotation removed
    await expect(page.locator('[data-annotation-id]')).not.toBeVisible()

    // Step 6: Open import dialog
    await page.click('button:has-text("Import")')
    await expect(page.locator('text=/Import Annotations/i')).toBeVisible()

    // Step 7: Upload exported file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(downloadPath)

    // Verify file uploaded
    await expect(page.locator('text=/test-export.jsonl/i')).toBeVisible()

    // Step 8: Review preview (verifies counts)
    await expect(page.locator('text=/Preview/i')).toBeVisible()

    // Should show 1 annotation with 3 keyframes
    await expect(page.locator('text=/1 annotation/i')).toBeVisible()
    await expect(page.locator('text=/3 keyframes/i')).toBeVisible()

    // Verify no conflicts
    await expect(page.locator('text=/No conflicts detected/i')).toBeVisible()

    // Step 9: Import with default options
    await page.click('button:has-text("Import")')

    // Wait for import to complete
    await expect(page.locator('text=/Import completed/i')).toBeVisible({ timeout: 10000 })

    // Step 10: Verify annotation restored exactly
    await page.click('button:has-text("Close")')

    // Should see bounding box again
    await expect(page.locator('[data-annotation-id]').first()).toBeVisible()

    // Step 11: Verify interpolation still works
    // Seek to frame 15 (midpoint of first segment)
    const timeline = page.locator('canvas[data-testid="timeline"]').first()
    await timeline.click({ position: { x: 150, y: 50 } })

    // Should see interpolated box
    await expect(page.locator('[data-annotation-id]')).toBeVisible()

    // Step 12: Verify keyframe count matches
    const annotationCard = page.locator('[data-testid="annotation-card"]').first()
    await annotationCard.click()

    // Should show 3 keyframes
    await expect(page.locator('text=/3 keyframes/i')).toBeVisible()

    // Cleanup
    fs.unlinkSync(downloadPath)
  })

  test('export fully interpolated and re-import', async ({ page }) => {
    // Create annotation with 2 keyframes
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    await page.click('button:has-text("Draw Bounding Box")')
    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    // Add keyframe at frame 100
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }
    await page.keyboard.press('k')

    await page.click('button:has-text("Save")')
    await expect(page.locator('text=/Annotation saved/i')).toBeVisible()

    // Export with fully interpolated mode
    await page.click('button:has-text("Export")')
    const fullyInterpolatedRadio = page.locator('input[type="radio"][value="fully-interpolated"]')
    await fullyInterpolatedRadio.check()

    // Should show 101 frames (0-100)
    await expect(page.locator('text=/101.*frames/i')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Export")')
    const download = await downloadPromise

    const downloadPath = path.join('/tmp', 'test-export-full.jsonl')
    await download.saveAs(downloadPath)

    // Delete and re-import
    await page.click('button:has-text("Delete Annotation")')
    await page.click('button:has-text("Confirm")')

    await page.click('button:has-text("Import")')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(downloadPath)

    await page.click('button:has-text("Import")')
    await expect(page.locator('text=/Import completed/i')).toBeVisible({ timeout: 10000 })

    // Verify all interpolated frames preserved
    await page.click('button:has-text("Close")')
    await expect(page.locator('[data-annotation-id]').first()).toBeVisible()

    // Cleanup
    fs.unlinkSync(downloadPath)
  })

  test('import with conflict resolution', async ({ page }) => {
    // Create annotation
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    await page.click('button:has-text("Draw Bounding Box")')
    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    await page.click('button:has-text("Save")')
    await expect(page.locator('text=/Annotation saved/i')).toBeVisible()

    // Export
    await page.click('button:has-text("Export")')
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Export")')
    const download = await downloadPromise

    const downloadPath = path.join('/tmp', 'test-export-conflict.jsonl')
    await download.saveAs(downloadPath)

    // Don't delete, create conflict by importing same file
    await page.click('button:has-text("Import")')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(downloadPath)

    // Should detect conflict (duplicate annotation ID)
    await expect(page.locator('text=/Conflicts detected/i')).toBeVisible()
    await expect(page.locator('text=/duplicate/i')).toBeVisible()

    // Select resolution strategy
    const skipDuplicatesRadio = page.locator('input[type="radio"][value="skip-duplicates"]')
    await skipDuplicatesRadio.check()

    await page.click('button:has-text("Import")')
    await expect(page.locator('text=/Import completed/i')).toBeVisible({ timeout: 10000 })

    // Verify skipped
    await expect(page.locator('text=/0 annotations imported/i')).toBeVisible()
    await expect(page.locator('text=/1 skipped/i')).toBeVisible()

    // Cleanup
    fs.unlinkSync(downloadPath)
  })

  test('import validation errors', async ({ page }) => {
    // Navigate to video page
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    // Open import dialog
    await page.click('button:has-text("Import")')

    // Create malformed file
    const malformedPath = path.join('/tmp', 'test-malformed.jsonl')
    fs.writeFileSync(malformedPath, 'invalid json\n{missing: bracket')

    // Upload malformed file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(malformedPath)

    // Should show validation error
    await expect(page.locator('text=/Invalid JSON/i')).toBeVisible()

    // Import button should be disabled
    const importButton = page.locator('button:has-text("Import")')
    await expect(importButton).toBeDisabled()

    // Cleanup
    fs.unlinkSync(malformedPath)
  })

  test('import with missing dependencies', async ({ page }) => {
    // Navigate to video page
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    // Open import dialog
    await page.click('button:has-text("Import")')

    // Create file with reference to non-existent video
    const missingDepPath = path.join('/tmp', 'test-missing-dep.jsonl')
    const annotation = {
      id: 'test-annotation-1',
      videoId: 'non-existent-video-id',
      personaId: 'test-persona',
      annotationType: 'type',
      boundingBoxSequence: {
        boxes: [{ x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
        interpolationSegments: [],
        visibilityRanges: [],
        trackingSource: 'manual',
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0,
      },
    }
    fs.writeFileSync(missingDepPath, JSON.stringify(annotation))

    // Upload file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(missingDepPath)

    // Should detect missing dependency
    await expect(page.locator('text=/Missing dependencies/i')).toBeVisible()
    await expect(page.locator('text=/non-existent-video-id/i')).toBeVisible()

    // Select skip missing items
    const skipMissingRadio = page.locator('input[type="radio"][value="skip-item"]')
    await skipMissingRadio.check()

    await page.click('button:has-text("Import")')
    await expect(page.locator('text=/Import completed/i')).toBeVisible({ timeout: 10000 })

    // Verify skipped
    await expect(page.locator('text=/0 annotations imported/i')).toBeVisible()

    // Cleanup
    fs.unlinkSync(missingDepPath)
  })
})
