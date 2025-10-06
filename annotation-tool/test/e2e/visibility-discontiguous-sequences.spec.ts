/**
 * @file visibility-discontiguous-sequences.spec.ts
 * @description E2E tests for visibility ranges and discontiguous sequences.
 * Tests the visibility toggle and gap creation workflow from Session 5.
 */

import { test, expect } from '@playwright/test'

test.describe('Visibility Range and Discontiguous Sequences', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to video annotation page
    await page.goto('/videos')
  })

  test('create discontiguous sequence with visibility gaps', async ({ page }) => {
    // Step 1: Create annotation with keyframes at 0, 30, 60
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    await expect(page.locator('video').first()).toBeVisible()

    // Draw initial box
    await page.click('button:has-text("Draw Bounding Box")')
    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    // Keyframe at frame 30
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }
    await page.keyboard.press('k')

    // Keyframe at frame 60
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }
    await page.keyboard.press('k')

    // Step 2: Toggle visibility off for frames 15-45 (keyboard: V)
    // Go to frame 15
    await page.keyboard.press('Home') // Go to start
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('ArrowRight')
    }

    // Toggle visibility off
    await page.keyboard.press('v')

    // Verify visibility toggle UI appears
    await expect(page.locator('text=/Visibility: Off/i')).toBeVisible()

    // Go to frame 45
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
    }

    // Toggle visibility back on
    await page.keyboard.press('v')

    // Step 3: Verify box disappears in hidden range
    // Go to frame 30 (middle of hidden range)
    await page.keyboard.press('Home')
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
    }

    // Box should not be visible
    const boundingBox = page.locator('[data-annotation-id]').first()
    await expect(boundingBox).not.toBeVisible()

    // Step 4: Verify interpolation resumes after gap
    // Go to frame 50 (after gap)
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
    }

    // Box should be visible again
    await expect(boundingBox).toBeVisible()

    // Step 5: Verify timeline shows visibility indicators
    const timeline = page.locator('canvas[data-testid="timeline"]').first()
    await expect(timeline).toBeVisible()

    // Step 6: Export and verify visibility ranges in JSON
    await page.click('button:has-text("Save")')
    await expect(page.locator('text=/Annotation saved/i')).toBeVisible()

    await page.click('button:has-text("Export")')
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Export")')
    const download = await downloadPromise

    const downloadPath = '/tmp/test-visibility-export.jsonl'
    await download.saveAs(downloadPath)

    // Read file and verify visibility ranges
    const fs = require('fs')
    const content = fs.readFileSync(downloadPath, 'utf-8')
    const annotation = JSON.parse(content.split('\n')[0])

    expect(annotation.boundingBoxSequence.visibilityRanges).toHaveLength(2)
    expect(annotation.boundingBoxSequence.visibilityRanges[0]).toMatchObject({
      startFrame: 0,
      endFrame: 15,
      visible: true,
    })
    expect(annotation.boundingBoxSequence.visibilityRanges[1]).toMatchObject({
      startFrame: 45,
      endFrame: 60,
      visible: true,
    })

    fs.unlinkSync(downloadPath)
  })

  test('visibility toggle on timeline', async ({ page }) => {
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

    // Add keyframe at frame 50
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }
    await page.keyboard.press('k')

    // Click visibility track on timeline to toggle
    const visibilityTrack = page.locator('[data-testid="visibility-track"]').first()
    await visibilityTrack.click({ position: { x: 150, y: 10 } })

    // Verify visibility range created
    await expect(page.locator('text=/Visibility range/i')).toBeVisible()

    // Box should disappear at clicked frame
    const boundingBox = page.locator('[data-annotation-id]').first()
    await expect(boundingBox).not.toBeVisible()
  })

  test('visibility bracket markers', async ({ page }) => {
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

    // Add keyframes
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }
    await page.keyboard.press('k')

    // Use bracket keys to set visibility start/end
    // Go to frame 20
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }

    // Press '[' to set visibility start
    await page.keyboard.press('[')
    await expect(page.locator('text=/Visibility start set/i')).toBeVisible()

    // Go to frame 80
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }

    // Press ']' to set visibility end
    await page.keyboard.press(']')
    await expect(page.locator('text=/Visibility end set/i')).toBeVisible()

    // Verify visibility range created from 20-80
    // Go to frame 10 (before range)
    await page.keyboard.press('Home')
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight')
    }
    const boundingBox = page.locator('[data-annotation-id]').first()
    await expect(boundingBox).not.toBeVisible()

    // Go to frame 50 (inside range)
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).toBeVisible()

    // Go to frame 90 (after range)
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).not.toBeVisible()
  })

  test('multiple visibility gaps', async ({ page }) => {
    // Create annotation with multiple gaps
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

    // Create sequence spanning 0-120
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }
    await page.keyboard.press('k')

    // Create gap 1: frames 20-40
    await page.keyboard.press('Home')
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press('[')
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press(']')

    // Create gap 2: frames 70-90
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press('[')
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press(']')

    // Verify 3 visible ranges: 0-20, 40-70, 90-120
    await page.click('button:has-text("Save")')

    const boundingBox = page.locator('[data-annotation-id]').first()

    // Check frame 10 (visible)
    await page.keyboard.press('Home')
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).toBeVisible()

    // Check frame 30 (hidden gap 1)
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).not.toBeVisible()

    // Check frame 50 (visible)
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).toBeVisible()

    // Check frame 80 (hidden gap 2)
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).not.toBeVisible()

    // Check frame 100 (visible)
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).toBeVisible()
  })

  test('visibility toggle quick action', async ({ page }) => {
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

    // Select box to show quick actions
    const boundingBox = page.locator('[data-annotation-id]').first()
    await boundingBox.click()

    // Quick actions panel should appear
    await expect(page.locator('[data-testid="quick-actions-panel"]')).toBeVisible()

    // Click visibility toggle button
    const visibilityButton = page.locator('button[title*="Toggle Visibility"]')
    await visibilityButton.click()

    // Box should disappear
    await expect(boundingBox).not.toBeVisible()

    // Quick actions should still be visible (for annotation)
    await expect(page.locator('[data-testid="quick-actions-panel"]')).toBeVisible()

    // Click visibility toggle again
    await visibilityButton.click()

    // Box should reappear
    await expect(boundingBox).toBeVisible()
  })

  test('import discontiguous sequence', async ({ page }) => {
    // Create file with discontiguous sequence
    const fs = require('fs')
    const annotation = {
      id: 'test-discontiguous',
      videoId: 'test-video',
      personaId: 'test-persona',
      annotationType: 'type',
      boundingBoxSequence: {
        boxes: [
          { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
          { x: 100, y: 100, width: 100, height: 100, frameNumber: 100, isKeyframe: true },
        ],
        interpolationSegments: [
          { startFrame: 0, endFrame: 100, type: 'linear' },
        ],
        visibilityRanges: [
          { startFrame: 0, endFrame: 30, visible: true },
          { startFrame: 70, endFrame: 100, visible: true },
        ],
        trackingSource: 'manual',
        totalFrames: 101,
        keyframeCount: 2,
        interpolatedFrameCount: 99,
      },
    }

    const importPath = '/tmp/test-discontiguous-import.jsonl'
    fs.writeFileSync(importPath, JSON.stringify(annotation))

    // Import
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    await page.click('button:has-text("Import")')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(importPath)

    await page.click('button:has-text("Import")')
    await expect(page.locator('text=/Import completed/i')).toBeVisible({ timeout: 10000 })

    await page.click('button:has-text("Close")')

    // Verify visibility gaps preserved
    const boundingBox = page.locator('[data-annotation-id]').first()

    // Frame 20 (visible)
    await page.keyboard.press('Home')
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).toBeVisible()

    // Frame 50 (hidden)
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).not.toBeVisible()

    // Frame 80 (visible)
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(boundingBox).toBeVisible()

    fs.unlinkSync(importPath)
  })
})
