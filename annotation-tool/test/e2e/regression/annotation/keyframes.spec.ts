import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for keyframe management.
 * Tests keyframe creation, deletion, and copying functionality.
 */

test.describe('Annotation Keyframes', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('adds keyframe with K shortcut', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    await annotationWorkspace.timeline.addKeyframe()

    await page.waitForTimeout(300)
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('deletes keyframe with Delete key', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    for (let i = 0; i < 20; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }
    await annotationWorkspace.timeline.addKeyframe()

    for (let i = 0; i < 20; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }
    await annotationWorkspace.timeline.addKeyframe()

    await annotationWorkspace.video.jumpToStart()
    await page.waitForTimeout(200)

    for (let i = 0; i < 20; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    await annotationWorkspace.timeline.deleteKeyframe()

    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('copies previous keyframe with C key', async ({ annotationWorkspace, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    await annotationWorkspace.timeline.copyPreviousKeyframe()

    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('saves annotation with keyframes', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }
    await annotationWorkspace.timeline.addKeyframe()

    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }
    await annotationWorkspace.timeline.addKeyframe()

    // Save annotation using keyboard shortcut (annotation workspace uses auto-save, no manual button)
    await annotationWorkspace.saveAnnotation()
    await annotationWorkspace.expectSaveSuccess()
  })
})
