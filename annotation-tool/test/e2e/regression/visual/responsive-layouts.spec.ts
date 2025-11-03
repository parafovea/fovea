import { test, expect } from '../../fixtures/test-context.js'

/**
 * E2E visual regression tests for responsive layouts.
 * Tests component rendering across different viewport sizes.
 */

const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'wide', width: 1920, height: 1080 }
]

test.describe('Responsive Layout Visual Regression', () => {
  for (const viewport of viewports) {
    test(`video browser renders correctly on ${viewport.name}`, async ({ page, videoBrowser }) => {
      await page.setViewportSize(viewport)
      await videoBrowser.navigateToHome()
      await videoBrowser.expectPageLoaded()

      // Wait for layout to stabilize
      await page.waitForTimeout(500)

      await expect(page).toHaveScreenshot(`video-browser-${viewport.name}.png`, {
        fullPage: true,
        threshold: 0.2,
        maxDiffPixels: 200
      })
    })
  }

  test('annotation workspace renders correctly on desktop', async ({ page, annotationWorkspace, _testPersona, _testEntityType }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await annotationWorkspace.navigateFromVideoBrowser()

    // Wait for workspace to load
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('annotation-workspace-desktop.png', {
      fullPage: true,
      threshold: 0.25,  // Video frame may vary
      maxDiffPixels: 200
    })
  })

  test('annotation workspace renders correctly on wide screen', async ({ page, annotationWorkspace, _testPersona, _testEntityType }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await annotationWorkspace.navigateFromVideoBrowser()

    // Wait for workspace to load
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('annotation-workspace-wide.png', {
      fullPage: true,
      threshold: 0.25,  // Video frame may vary
      maxDiffPixels: 250
    })
  })

  test('ontology workspace renders correctly on tablet', async ({ page, ontologyWorkspace, testPersona }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Wait for tabs to be visible
    await expect(ontologyWorkspace.entityTypesTab).toBeVisible()

    // Wait for layout to stabilize
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('ontology-workspace-tablet.png', {
      fullPage: true,
      threshold: 0.2,
      maxDiffPixels: 150
    })
  })

  test('ontology workspace renders correctly on mobile', async ({ page, ontologyWorkspace, testPersona }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Wait for tabs to be visible
    await expect(ontologyWorkspace.entityTypesTab).toBeVisible()

    // Wait for layout to stabilize
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('ontology-workspace-mobile.png', {
      fullPage: true,
      threshold: 0.2,
      maxDiffPixels: 150
    })
  })

  test('object workspace renders correctly on desktop', async ({ page, objectWorkspace, _testPersona }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await objectWorkspace.navigateTo()

    // Wait for tabs to be visible
    await expect(objectWorkspace.entitiesTab).toBeVisible()

    // Wait for layout to stabilize
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('object-workspace-desktop.png', {
      fullPage: true,
      threshold: 0.2,
      maxDiffPixels: 150
    })
  })
})
