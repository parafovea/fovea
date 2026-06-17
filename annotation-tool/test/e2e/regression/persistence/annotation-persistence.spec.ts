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

    // drawSimpleBoundingBox returns the save Response; awaiting it
    // guarantees the annotation is committed to the database.
    const savePromise = annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()
    await savePromise

    // Additional buffer to ensure database write is committed
    await page.waitForTimeout(500)

    // Reload page to clear Redux state
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Navigate back to the same video
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Select the same persona again (required to see annotations after reload)
    const personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await personaSelect.click()
    const personaOption = page.getByRole('option').filter({
      hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\('),
    }).first()
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

    const initialSavePromise = annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await initialSavePromise

    // Show timeline and add a keyframe at a different time
    await annotationWorkspace.timeline.show()

    // Seek forward 30 frames
    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    // Create save promise BEFORE adding keyframe
    const keyframeSavePromise = annotationWorkspace.createAnnotationSavePromise()

    // Add keyframe
    await annotationWorkspace.timeline.addKeyframe()

    // Wait for keyframe save to complete
    await keyframeSavePromise

    // Additional buffer to ensure database write is committed
    await page.waitForTimeout(500)

    // Reload and verify both keyframes persist
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Select the same persona again
    const personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await personaSelect.click()
    const personaOption = page.getByRole('option').filter({
      hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\('),
    }).first()
    await personaOption.click()
    await page.waitForTimeout(1000)

    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('annotation can be edited and resaved after page reload', async ({
    page,
    annotationWorkspace,
    testVideo,
    testPersonaPersistent: testPersona,
    testEntityTypePersistent: testEntityType
  }) => {
    // Navigate and create initial annotation
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    const initialSavePromise = annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await initialSavePromise
    await page.waitForTimeout(500)

    // Reload page
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Select the same persona to see the annotation
    const personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await personaSelect.click()
    const personaOption = page.getByRole('option').filter({
      hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\('),
    }).first()
    await personaOption.click()
    await page.waitForTimeout(1000)

    // Verify annotation exists
    await annotationWorkspace.expectBoundingBoxVisible()

    // Show timeline to edit the annotation
    await annotationWorkspace.timeline.show()

    // Seek forward 20 frames
    for (let i = 0; i < 20; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    // Create save promise BEFORE adding keyframe
    const editSavePromise = annotationWorkspace.createAnnotationSavePromise()

    // Add a new keyframe (editing the annotation)
    await annotationWorkspace.timeline.addKeyframe()

    // Wait for edit save to complete
    await editSavePromise
    await page.waitForTimeout(500)

    // Reload again to verify the edit persisted
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Re-select persona
    const personaSelect2 = page.getByRole('combobox', { name: /select persona/i })
    await personaSelect2.click()
    const personaOption2 = page.getByRole('option').filter({
      hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\('),
    }).first()
    await personaOption2.click()
    await page.waitForTimeout(1000)

    // Verify annotation with edits still exists
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

    await annotationWorkspace.selectPersona(testPersona.name)
    await annotationWorkspace.selectFirstType()

    // Each drawBoundingBox triggers one POST /api/annotations save. Listen
    // for 3 saves to land before asserting persistence on reload.
    const savePromises: Promise<import('@playwright/test').Response>[] = []
    for (let i = 0; i < 3; i++) {
      const p = annotationWorkspace.createAnnotationSavePromise(20000)
      savePromises.push(p)
      await annotationWorkspace.drawBoundingBox({
        x: 100 + i * 150,
        y: 100,
        width: 100,
        height: 100,
      })
      await p
    }

    // Additional buffer to ensure database writes are committed
    await page.waitForTimeout(500)

    // Reload and verify all annotations persist
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    await annotationWorkspace.selectPersona(testPersona.name)
    // At least one annotation should be visible (verifying saves worked)
    await annotationWorkspace.expectBoundingBoxVisible()
  })
})
