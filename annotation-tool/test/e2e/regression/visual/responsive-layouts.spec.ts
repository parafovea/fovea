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

  test('annotation workspace renders correctly on desktop', async ({ page, annotationWorkspace, testPersona, testEntityType }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await annotationWorkspace.navigateFromVideoBrowser()

    // The default 1s timeout occasionally screenshots while the workspace
    // header still reads "Loading…"; wait for network idle and the video
    // element to mount before snapping.
    await page.waitForLoadState('networkidle')
    await page.locator('video').waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('annotation-workspace-desktop.png', {
      fullPage: true,
      threshold: 0.25,
      // The masked persona-select chip and user-menu button shift width by
      // a few pixels between runs because the per-worker text inside them
      // varies; tolerate that along the masked edges.
      maxDiffPixels: 1500,
      mask: [
        page.locator('video'),
        // Persona select chip and user-menu button render per-worker text
        // that differs between baseline-capture and verification runs.
        page.getByRole('combobox', { name: /select persona/i }),
        page.getByRole('button', { name: /user menu/i }),
      ],
    })
  })

  test('annotation workspace renders correctly on wide screen', async ({ page, annotationWorkspace, testPersona, testEntityType }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await annotationWorkspace.navigateFromVideoBrowser()

    await page.waitForLoadState('networkidle')
    await page.locator('video').waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('annotation-workspace-wide.png', {
      fullPage: true,
      threshold: 0.25,
      // Mask boundaries (persona-select chip, user-menu) drift a few px
      // between runs because per-worker text varies; tolerate that along
      // the masked edges. 2000px out of 1920×1080 ≈ 0.1%.
      maxDiffPixels: 2000,
      mask: [
        page.locator('video'),
        page.getByRole('combobox', { name: /select persona/i }),
        page.getByRole('button', { name: /user menu/i }),
      ],
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

  test('object workspace renders correctly on desktop', async ({ page, objectWorkspace, testPersona }) => {
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
