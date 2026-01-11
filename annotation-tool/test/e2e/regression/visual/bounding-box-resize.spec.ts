import { test, expect } from '../../fixtures/test-context.js'

/**
 * Visual regression tests for bounding box appearance during resize.
 * Ensures bounding boxes render consistently across different viewport sizes.
 */

test.describe('Bounding Box Visual Regression', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('bounding box renders correctly at Full HD viewport', async ({
    page,
    annotationWorkspace,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Wait for bounding box to be fully rendered
    await page.waitForTimeout(1000)

    const boundingBox = page.locator('[data-testid="bounding-box"]').first()
    await expect(boundingBox).toBeVisible({ timeout: 15000 })

    await expect(boundingBox).toHaveScreenshot('bounding-box-fullhd.png', {
      threshold: 0.2,
      maxDiffPixels: 150,
    })
  })

  test('bounding box renders correctly at HD viewport', async ({
    page,
    annotationWorkspace,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await page.waitForTimeout(1000)

    const boundingBox = page.locator('[data-testid="bounding-box"]').first()
    await expect(boundingBox).toBeVisible({ timeout: 15000 })

    await expect(boundingBox).toHaveScreenshot('bounding-box-hd.png', {
      threshold: 0.2,
      maxDiffPixels: 150,
    })
  })

  test('bounding box renders correctly at small viewport', async ({
    page,
    annotationWorkspace,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await page.waitForTimeout(1000)

    const boundingBox = page.locator('[data-testid="bounding-box"]').first()
    await expect(boundingBox).toBeVisible({ timeout: 15000 })

    await expect(boundingBox).toHaveScreenshot('bounding-box-small.png', {
      threshold: 0.25, // Higher threshold for smaller viewport
      maxDiffPixels: 200,
    })
  })

  test('bounding box label renders correctly at all sizes', async ({
    page,
    annotationWorkspace,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    // Start at large viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await page.waitForTimeout(1000)

    // Screenshot the label at full size
    const label = page.locator('[data-testid="bounding-box"] foreignObject').first()
    await expect(label).toBeVisible({ timeout: 15000 })

    await expect(label).toHaveScreenshot('bounding-box-label-fullhd.png', {
      threshold: 0.2,
      maxDiffPixels: 50,
    })

    // Resize to smaller viewport
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.waitForTimeout(500)

    await expect(label).toHaveScreenshot('bounding-box-label-medium.png', {
      threshold: 0.25,
      maxDiffPixels: 75,
    })

    // Resize to smallest viewport
    await page.setViewportSize({ width: 800, height: 600 })
    await page.waitForTimeout(500)

    await expect(label).toHaveScreenshot('bounding-box-label-small.png', {
      threshold: 0.3,
      maxDiffPixels: 100,
    })
  })

  test('bounding box with resize handles renders correctly', async ({
    page,
    annotationWorkspace,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await page.waitForTimeout(1000)

    // Hover over bounding box to show resize handles
    const boundingBox = page.locator('[data-testid="bounding-box"]').first()
    await expect(boundingBox).toBeVisible({ timeout: 15000 })
    await boundingBox.hover()

    await page.waitForTimeout(300)

    await expect(boundingBox).toHaveScreenshot('bounding-box-with-handles.png', {
      threshold: 0.2,
      maxDiffPixels: 150,
    })
  })

  test('annotation workspace maintains layout after resize', async ({
    page,
    annotationWorkspace,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    // Start at large viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await page.waitForTimeout(1000)

    // Take screenshot at initial size
    const workspace = page.locator('main').first()
    await expect(workspace).toBeVisible()

    await expect(workspace).toHaveScreenshot('annotation-workspace-fullhd.png', {
      threshold: 0.25,
      maxDiffPixels: 500, // Higher tolerance for full page
    })

    // Resize to smaller viewport
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.waitForTimeout(500)

    await expect(workspace).toHaveScreenshot('annotation-workspace-resized.png', {
      threshold: 0.25,
      maxDiffPixels: 500,
    })
  })
})

test.describe('Bounding Box Resize Consistency', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('bounding box appearance is consistent through resize cycles', async ({
    page,
    annotationWorkspace,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    // Start at medium size
    await page.setViewportSize({ width: 1280, height: 720 })
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await page.waitForTimeout(1000)

    const boundingBox = page.locator('[data-testid="bounding-box"]').first()
    await expect(boundingBox).toBeVisible({ timeout: 15000 })

    // Take initial screenshot
    await expect(boundingBox).toHaveScreenshot('bounding-box-initial.png', {
      threshold: 0.2,
      maxDiffPixels: 150,
    })

    // Resize down then back up
    await page.setViewportSize({ width: 800, height: 600 })
    await page.waitForTimeout(300)
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForTimeout(500)

    // Should look the same as initial
    await expect(boundingBox).toHaveScreenshot('bounding-box-after-resize-cycle.png', {
      threshold: 0.2,
      maxDiffPixels: 150,
    })
  })
})
