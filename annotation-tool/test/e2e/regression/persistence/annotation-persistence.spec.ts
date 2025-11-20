/**
 * @file annotation-persistence.spec.ts
 * @description E2E tests verifying bounding box annotations persist to database
 * and survive page reloads.
 *
 * These tests ensure that:
 * - Annotations auto-save immediately after creation
 * - Annotations persist to database (not just Redux)
 * - Annotations can be retrieved after page reload
 * - Annotation updates persist correctly
 * - Annotation deletions persist correctly
 */

import { test, expect } from '../../fixtures/multivent-fixtures'
import { AnnotationWorkspacePage } from '../../page-objects/AnnotationWorkspacePage'

test.describe('Annotation Persistence', () => {
  test('new bounding box annotation persists after page reload', async ({
    page,
    testVideo,
    testPersona,
    testEntityType,
  }) => {
    const workspace = new AnnotationWorkspacePage(page)

    // Navigate to video and draw annotation
    await workspace.navigateFromVideoBrowser()
    await workspace.selectPersona(testPersona.name)
    await workspace.selectEntityType(testEntityType.name)
    await workspace.drawSimpleBoundingBox()

    // Verify annotation appears in list
    const annotationText = page.getByText(testEntityType.name).first()
    await expect(annotationText).toBeVisible()

    // Wait for auto-save (500ms debounce + network time)
    await page.waitForTimeout(1500)

    // Store annotation count before reload
    const annotationList = page.getByTestId('annotation-list-item')
    const initialCount = await annotationList.count()
    expect(initialCount).toBeGreaterThan(0)

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back to video
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Verify annotation still exists
    const annotationTextAfterReload = page.getByText(testEntityType.name).first()
    await expect(annotationTextAfterReload).toBeVisible()

    const annotationListAfterReload = page.getByTestId('annotation-list-item')
    const countAfterReload = await annotationListAfterReload.count()
    expect(countAfterReload).toBe(initialCount)
  })

  test('annotation updates persist after page reload', async ({
    page,
    testVideo,
    testPersona,
    testEntityType,
  }) => {
    const workspace = new AnnotationWorkspacePage(page)

    // Create initial annotation
    await workspace.navigateFromVideoBrowser()
    await workspace.selectPersona(testPersona.name)
    await workspace.selectEntityType(testEntityType.name)
    await workspace.drawSimpleBoundingBox()

    // Wait for auto-save
    await page.waitForTimeout(1500)

    // Select the annotation
    const annotationItem = page.getByTestId('annotation-list-item').first()
    await annotationItem.click()

    // Add a keyframe (this updates the annotation)
    await workspace.timeline.addKeyframe()

    // Wait for auto-save of update
    await page.waitForTimeout(1500)

    // Get keyframe count before reload
    const keyframeBefore = await workspace.timeline.getKeyframeCount()
    expect(keyframeBefore).toBeGreaterThan(1)

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Select the annotation again
    const annotationItemAfterReload = page.getByTestId('annotation-list-item').first()
    await annotationItemAfterReload.click()

    // Verify keyframes persisted
    const keyframeAfter = await workspace.timeline.getKeyframeCount()
    expect(keyframeAfter).toBe(keyframeBefore)
  })

  test('deleted annotation does not reappear after page reload', async ({
    page,
    testVideo,
    testPersona,
    testEntityType,
  }) => {
    const workspace = new AnnotationWorkspacePage(page)

    // Create annotation
    await workspace.navigateFromVideoBrowser()
    await workspace.selectPersona(testPersona.name)
    await workspace.selectEntityType(testEntityType.name)
    await workspace.drawSimpleBoundingBox()

    // Wait for auto-save
    await page.waitForTimeout(1500)

    // Verify annotation exists
    const annotationTextBefore = page.getByText(testEntityType.name).first()
    await expect(annotationTextBefore).toBeVisible()

    // Delete the annotation
    const deleteButton = page.getByRole('button', { name: /delete/i }).first()
    await deleteButton.click()

    // Wait for deletion to persist
    await page.waitForTimeout(1500)

    // Verify annotation is gone
    await expect(annotationTextBefore).not.toBeVisible()

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Verify annotation is still gone
    const annotationTextAfter = page.getByText(testEntityType.name).first()
    await expect(annotationTextAfter).not.toBeVisible()
  })

  test('multiple rapid annotations auto-save correctly', async ({
    page,
    testVideo,
    testPersona,
    testEntityType,
  }) => {
    const workspace = new AnnotationWorkspacePage(page)

    await workspace.navigateFromVideoBrowser()
    await workspace.selectPersona(testPersona.name)
    await workspace.selectEntityType(testEntityType.name)

    // Draw 3 annotations rapidly
    await workspace.drawSimpleBoundingBox()
    await page.waitForTimeout(200)
    await workspace.drawSimpleBoundingBox({ x: 100, y: 100 })
    await page.waitForTimeout(200)
    await workspace.drawSimpleBoundingBox({ x: 200, y: 200 })

    // Wait for all auto-saves
    await page.waitForTimeout(2000)

    // Count annotations
    const annotationList = page.getByTestId('annotation-list-item')
    const initialCount = await annotationList.count()
    expect(initialCount).toBe(3)

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Verify all 3 annotations persisted
    const annotationListAfterReload = page.getByTestId('annotation-list-item')
    const countAfterReload = await annotationListAfterReload.count()
    expect(countAfterReload).toBe(3)
  })

  test('annotation persists across different personas', async ({
    page,
    testVideo,
    testPersona,
    testEntityType,
  }) => {
    const workspace = new AnnotationWorkspacePage(page)

    // Create annotation with persona 1
    await workspace.navigateFromVideoBrowser()
    await workspace.selectPersona(testPersona.name)
    await workspace.selectEntityType(testEntityType.name)
    await workspace.drawSimpleBoundingBox()

    // Wait for auto-save
    await page.waitForTimeout(1500)

    // Switch to different persona (if available)
    const personaSelector = page.getByRole('combobox', { name: /persona/i })
    const personaOptions = await personaSelector.locator('option').count()

    if (personaOptions > 1) {
      // Switch to second persona
      await personaSelector.selectOption({ index: 1 })

      // Annotation should not be visible (persona-filtered)
      const annotationText = page.getByText(testEntityType.name)
      await expect(annotationText).not.toBeVisible()

      // Switch back to original persona
      await workspace.selectPersona(testPersona.name)

      // Annotation should reappear
      await expect(annotationText.first()).toBeVisible()
    }
  })

  test('annotation with interpolated keyframes persists correctly', async ({
    page,
    testVideo,
    testPersona,
    testEntityType,
  }) => {
    const workspace = new AnnotationWorkspacePage(page)

    await workspace.navigateFromVideoBrowser()
    await workspace.selectPersona(testPersona.name)
    await workspace.selectEntityType(testEntityType.name)
    await workspace.drawSimpleBoundingBox()

    // Wait for auto-save
    await page.waitForTimeout(1500)

    // Select annotation and expand timeline
    const annotationItem = page.getByTestId('annotation-list-item').first()
    await annotationItem.click()

    // Add multiple keyframes
    await workspace.timeline.addKeyframe()
    await page.waitForTimeout(200)
    await workspace.timeline.addKeyframe()
    await page.waitForTimeout(200)
    await workspace.timeline.addKeyframe()

    // Wait for auto-save
    await page.waitForTimeout(2000)

    // Get interpolation data before reload
    const keyframeCountBefore = await workspace.timeline.getKeyframeCount()
    expect(keyframeCountBefore).toBeGreaterThan(2)

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Select annotation again
    const annotationItemAfterReload = page.getByTestId('annotation-list-item').first()
    await annotationItemAfterReload.click()

    // Verify keyframes persisted with interpolation
    const keyframeCountAfter = await workspace.timeline.getKeyframeCount()
    expect(keyframeCountAfter).toBe(keyframeCountBefore)
  })
})
