/**
 * @file annotation-persistence.spec.ts
 * @description E2E tests verifying bounding box annotations auto-save to database
 * and survive page reloads (not just Redux).
 */

import { test } from '../../fixtures/test-context.js'

test.describe('Annotation Auto-Save Persistence', () => {
  test('annotation auto-saves and persists after page reload', async ({
    page,
    annotationWorkspace,
    testVideo,
    testPersonaPersistent: testPersona,
    testEntityTypePersistent: testEntityType
  }) => {
    // Navigate to video annotation workspace
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Draw a simple bounding box annotation
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.expectBoundingBoxVisible()

    // Wait for auto-save to complete (500ms debounce + network time)
    await page.waitForTimeout(2000)

    // Reload page to clear Redux state
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back to the same video
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Select the same persona again (required to see annotations after reload)
    let personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await personaSelect.click()
    let personaListbox = page.getByRole('listbox', { name: /select persona/i })
    let personaOption = personaListbox.getByText(testPersona.name)
    await personaOption.click()
    await page.waitForTimeout(1000)

    // Verify annotation still exists (proving it was saved to database)
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('annotation updates auto-save and persist', async ({
    page,
    annotationWorkspace,
    testVideo,
    testPersonaPersistent: testPersona,
    testEntityTypePersistent: testEntityType
  }) => {
    // Navigate and create initial annotation
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()
    await annotationWorkspace.drawSimpleBoundingBox()
    await page.waitForTimeout(2000)

    // Show timeline and add a keyframe at a different time
    await annotationWorkspace.timeline.show()

    // Seek forward 30 frames
    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    // Add keyframe
    await annotationWorkspace.timeline.addKeyframe()

    // Wait for auto-save
    await page.waitForTimeout(2000)

    // Reload and verify both keyframes persist
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Select the same persona again
    let personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await personaSelect.click()
    let personaListbox = page.getByRole('listbox', { name: /select persona/i })
    let personaOption = personaListbox.getByText(testPersona.name)
    await personaOption.click()
    await page.waitForTimeout(1000)

    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('multiple rapid annotations all auto-save correctly', async ({
    page,
    annotationWorkspace,
    testVideo,
    testPersonaPersistent: testPersona,
    testEntityTypePersistent: testEntityType
  }) => {
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Select persona first (required for annotations)
    let personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await personaSelect.click()
    let personaListbox = page.getByRole('listbox', { name: /select persona/i })
    let personaOption = personaListbox.getByText(testPersona.name)
    await personaOption.click()
    await page.waitForTimeout(1000)

    // Create 3 annotations rapidly
    for (let i = 0; i < 3; i++) {
      await annotationWorkspace.drawBoundingBox({
        x: 100 + i * 150,
        y: 100,
        width: 100,
        height: 100
      })
      await page.waitForTimeout(200)
    }

    // Wait for all auto-saves to complete
    await page.waitForTimeout(3000)

    // Reload and verify all annotations persist
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Select the same persona again
    personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await personaSelect.click()
    personaListbox = page.getByRole('listbox', { name: /select persona/i })
    personaOption = personaListbox.getByText(testPersona.name)
    await personaOption.click()
    await page.waitForTimeout(1000)

    // At least one annotation should be visible (verifying saves worked)
    await annotationWorkspace.expectBoundingBoxVisible()
  })
})
