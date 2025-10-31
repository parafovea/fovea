import { test, expect } from '../../fixtures/test-context.js'

/**
 * E2E visual regression tests for component rendering.
 * Uses Playwright's toHaveScreenshot() to detect unintended visual changes.
 * Tests cover major dialogs, editors, and UI components.
 */

test.describe('Component Visual Regression', () => {
  test.beforeEach(async ({ videoBrowser }) => {
    await videoBrowser.navigateToHome()
  })

  test('video card renders correctly', async ({ videoBrowser }) => {
    const firstCard = videoBrowser.firstVideoCard
    await expect(firstCard).toBeVisible()

    await expect(firstCard).toHaveScreenshot('video-card.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('entity type dialog renders correctly', async ({ page, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')
    await ontologyWorkspace.addTypeFab.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    await expect(dialog).toHaveScreenshot('entity-type-dialog.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('event type dialog renders correctly', async ({ page, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('events')
    await ontologyWorkspace.addTypeFab.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    await expect(dialog).toHaveScreenshot('event-type-dialog.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('role type dialog renders correctly', async ({ page, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('roles')
    await ontologyWorkspace.addTypeFab.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    await expect(dialog).toHaveScreenshot('role-type-dialog.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('relation type dialog renders correctly', async ({ page, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('relations')
    await ontologyWorkspace.addTypeFab.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    await expect(dialog).toHaveScreenshot('relation-type-dialog.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('ontology workspace renders correctly', async ({ page, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Wait for tabs to be visible
    await expect(ontologyWorkspace.entityTypesTab).toBeVisible()

    const workspace = page.locator('[data-testid="ontology-workspace"]').or(page.locator('main'))
    await expect(workspace.first()).toBeVisible()

    await expect(workspace.first()).toHaveScreenshot('ontology-workspace.png', {
      threshold: 0.2,
      maxDiffPixels: 150
    })
  })

  test('object workspace renders correctly', async ({ page, objectWorkspace, testPersona }) => {
    await objectWorkspace.navigateTo()

    // Wait for tabs to be visible
    await expect(objectWorkspace.entitiesTab).toBeVisible()

    const workspace = page.locator('[data-testid="object-workspace"]').or(page.locator('main'))
    await expect(workspace.first()).toBeVisible()

    await expect(workspace.first()).toHaveScreenshot('object-workspace.png', {
      threshold: 0.2,
      maxDiffPixels: 150
    })
  })

  test('entity editor renders correctly', async ({ page, objectWorkspace, testPersona }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('entities')

    const addButton = objectWorkspace.addFab
    await expect(addButton).toBeVisible()
    await addButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    await expect(dialog).toHaveScreenshot('entity-editor.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('event editor renders correctly', async ({ page, objectWorkspace, testPersona }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    const addButton = objectWorkspace.addFab
    await expect(addButton).toBeVisible()
    await addButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    await expect(dialog).toHaveScreenshot('event-editor.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('location editor renders correctly', async ({ page, objectWorkspace, testPersona }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('locations')

    const addButton = objectWorkspace.addFab
    await expect(addButton).toBeVisible()
    await addButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Wait for map to load
    await page.waitForTimeout(1000)

    await expect(dialog).toHaveScreenshot('location-editor.png', {
      threshold: 0.3,  // Higher threshold for map tiles which may vary
      maxDiffPixels: 200
    })
  })

  test('time editor renders correctly', async ({ page, objectWorkspace, testPersona }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('times')

    const addButton = objectWorkspace.addFab
    await expect(addButton).toBeVisible()
    await addButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    await expect(dialog).toHaveScreenshot('time-editor.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('collection builder renders correctly', async ({ page, objectWorkspace, testPersona }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('collections')

    const addButton = objectWorkspace.addFab
    await expect(addButton).toBeVisible()
    await addButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    await expect(dialog).toHaveScreenshot('collection-builder.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('annotation workspace sidebar renders correctly', async ({ page, annotationWorkspace, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    // The sidebar is a Material-UI Drawer on the right side containing "All Annotations"
    const sidebar = page.locator('.MuiDrawer-root').filter({ has: page.getByText('All Annotations') })

    // Wait for sidebar to be visible
    await expect(sidebar).toBeVisible({ timeout: 10000 })

    // Give sidebar time to render annotations list
    await page.waitForTimeout(500)

    await expect(sidebar).toHaveScreenshot('annotation-sidebar.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('video player controls render correctly', async ({ page, annotationWorkspace, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    // Wait for video.js player to be fully initialized
    const videoContainer = page.locator('.video-js').or(page.locator('[data-testid="video-player"]'))
    await expect(videoContainer.first()).toBeVisible({ timeout: 15000 })

    // Additional wait for video.js to fully initialize its DOM
    await page.waitForTimeout(1500)

    // Hover on the video element itself to show controls (force: true to bypass intercepting elements)
    await videoContainer.first().hover({ force: true })
    await page.waitForTimeout(500)

    await expect(videoContainer.first()).toHaveScreenshot('video-player-controls.png', {
      threshold: 0.25,  // Video frame may vary slightly
      maxDiffPixels: 150
    })
  })

  test('keyboard shortcuts dialog renders correctly', async ({ page, videoBrowser }) => {
    // Need to be on a page with keyboard shortcuts enabled
    await videoBrowser.navigateToHome()

    // Click on body to ensure focus
    await page.locator('body').click()
    await page.waitForTimeout(500)

    // Open shortcuts dialog with ?
    await page.keyboard.press('?')

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 10000 })

    await expect(dialog).toHaveScreenshot('keyboard-shortcuts-dialog.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('command palette renders correctly', async ({ page, videoBrowser }) => {
    // Need to be on a page with command palette enabled
    await videoBrowser.navigateToHome()
    // Open command palette with Cmd+Shift+P (or Ctrl+Shift+P)
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+KeyP`)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    await expect(dialog).toHaveScreenshot('command-palette.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('export dialog renders correctly', async ({ page, videoBrowser }) => {
    await videoBrowser.navigateToHome()

    const exportButton = videoBrowser.exportButton
    await expect(exportButton).toBeVisible({ timeout: 10000 })

    // Click export button to open dialog
    await exportButton.click()

    const dialog = page.locator('[role="dialog"]').or(page.locator('.MuiDialog-root'))
    await expect(dialog.first()).toBeVisible({ timeout: 10000 })

    // Wait for dialog animation and content to fully render
    await page.waitForTimeout(1000)

    await expect(dialog.first()).toHaveScreenshot('export-dialog.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('filled entity type dialog renders correctly', async ({ page, ontologyWorkspace, testPersona }) => {
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')

    await expect(ontologyWorkspace.addTypeFab).toBeVisible()
    await ontologyWorkspace.addTypeFab.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 10000 })

    // Wait for form to be fully rendered
    await page.waitForTimeout(1000)

    // Fill in form fields - use role-based selectors which are more reliable
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    const descInput = dialog.locator('textarea').first()

    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await expect(descInput).toBeVisible({ timeout: 10000 })

    await nameInput.fill('Test Entity Type')
    await descInput.fill('This is a test entity type for visual regression testing')

    // Wait for input values to be reflected
    await page.waitForTimeout(500)

    await expect(dialog).toHaveScreenshot('entity-type-dialog-filled.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('ontology workspace with entity types renders correctly', async ({ page, ontologyWorkspace, testPersona, testEntityType }) => {
    // Navigate to ontology workspace which should have test entity types
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')

    // Wait for network requests to complete and types to load
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('Network idle timeout - continuing with test')
    })

    // Wait for the test entity type to appear
    await page.waitForTimeout(1500)

    // Verify entity type is present before taking screenshot
    await ontologyWorkspace.expectTypeExists('Test Entity Type')

    // Screenshot the visible tab panel containing the entity types list
    const visiblePanel = page.locator('[role="tabpanel"]').filter({ has: page.locator(':visible') }).first()
    await expect(visiblePanel).toBeVisible()

    await expect(visiblePanel).toHaveScreenshot('entity-types-list.png', {
      threshold: 0.2,
      maxDiffPixels: 150
    })
  })

  test('timeline component renders correctly', async ({ page, annotationWorkspace, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()
    await annotationWorkspace.timeline.expectVisible()

    // Use the container locator (which is now properly defined)
    const timeline = annotationWorkspace.timeline.container
    await expect(timeline).toBeVisible({ timeout: 10000 })

    // Wait for timeline to finish rendering
    await page.waitForTimeout(500)

    await expect(timeline).toHaveScreenshot('timeline-component.png', {
      threshold: 0.2,
      maxDiffPixels: 100
    })
  })

  test('bounding box renderer renders correctly', async ({ page, annotationWorkspace, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Wait for bounding box to be fully rendered
    await page.waitForTimeout(1000)

    // Look for video.js canvas or SVG bounding box element
    const boundingBox = page.locator('[data-testid="bounding-box"]').or(
      page.locator('.bounding-box')
    )

    // Wait longer for bounding box to appear and stabilize
    await expect(boundingBox.first()).toBeVisible({ timeout: 15000 })

    // Additional wait for rendering to complete
    await page.waitForTimeout(500)

    await expect(boundingBox.first()).toHaveScreenshot('bounding-box.png', {
      threshold: 0.25,  // Video frame may vary
      maxDiffPixels: 150
    })
  })
})
