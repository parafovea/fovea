import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for bounding box behavior during window resize.
 * Ensures bounding boxes maintain position, don't get squashed, and labels remain readable.
 */

test.describe('Bounding Box Window Resize', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('bounding box maintains SVG coordinates after viewport resize', async ({
    annotationWorkspace,
    page,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()

    const boxRect = page.locator('[data-testid="bounding-box"] rect').first()
    await expect(boxRect).toBeVisible({ timeout: 10000 })

    // Capture the initial SVG-space coordinates. These live in viewBox space, so
    // they must NOT change when the viewport (and thus on-screen scale) changes.
    const initial = {
      x: await boxRect.getAttribute('x'),
      y: await boxRect.getAttribute('y'),
      width: await boxRect.getAttribute('width'),
      height: await boxRect.getAttribute('height'),
    }
    expect(initial.x).not.toBeNull()
    expect(initial.y).not.toBeNull()
    expect(initial.width).not.toBeNull()
    expect(initial.height).not.toBeNull()

    // Resize viewport to smaller size
    await page.setViewportSize({ width: 1024, height: 768 })

    // The viewBox and preserveAspectRatio handle scaling, so the SVG attributes
    // stay identical. These web-first assertions retry, settling out any
    // transient re-render from the resize without a fixed delay.
    await expect(boxRect).toHaveAttribute('x', initial.x!)
    await expect(boxRect).toHaveAttribute('y', initial.y!)
    await expect(boxRect).toHaveAttribute('width', initial.width!)
    await expect(boxRect).toHaveAttribute('height', initial.height!)
  })

  test('bounding box aspect ratio is preserved during resize', async ({
    annotationWorkspace,
    page,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()

    const boxRect = page.locator('[data-testid="bounding-box"] rect').first()
    await expect(boxRect).toBeVisible({ timeout: 10000 })

    // Read the on-screen aspect ratio from the rendered rect.
    const readAspectRatio = () =>
      boxRect.evaluate((rect) => {
        const r = rect.getBoundingClientRect()
        return r.height > 0 ? r.width / r.height : null
      })

    const initialAspectRatio = await readAspectRatio()
    expect(initialAspectRatio).not.toBeNull()
    expect(initialAspectRatio).toBeGreaterThan(0)

    // Resize to different viewport sizes
    const viewports = [
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
      { width: 800, height: 600 },
    ]

    for (const viewport of viewports) {
      await page.setViewportSize(viewport)

      // Poll the rendered aspect ratio until the resize settles back to the
      // original (within 5% tolerance) rather than sleeping a fixed interval.
      await expect.poll(readAspectRatio, { timeout: 10000 }).toBeCloseTo(initialAspectRatio!, 1)
    }
  })

  test('label text remains visible at different viewport sizes', async ({
    annotationWorkspace,
    page,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()

    // The label is the shadcn Badge span inside the bounding-box foreignObject.
    const label = page.locator('[data-testid="bounding-box"] foreignObject span').first()
    await expect(label).toBeVisible({ timeout: 10000 })

    const viewports = [
      { width: 1920, height: 1080, name: 'Full HD' },
      { width: 1280, height: 720, name: 'HD' },
      { width: 1024, height: 768, name: 'XGA' },
      { width: 800, height: 600, name: 'SVGA' },
    ]

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })

      // toBeVisible() requires a non-empty bounding box, so it covers the former
      // "width > 0 and height > 0" check while auto-waiting for the resize to
      // settle — no fixed delay needed.
      await expect(label, `Label should be visible at ${viewport.name}`).toBeVisible({ timeout: 10000 })
    }
  })

  test('bounding box does not get squashed when resizing', async ({
    annotationWorkspace,
    page,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()

    const boxRect = page.locator('[data-testid="bounding-box"] rect').first()
    await expect(boxRect).toBeVisible({ timeout: 10000 })

    // Get initial box dimensions (SVG/viewBox space)
    const initialWidth = await boxRect.getAttribute('width')
    const initialHeight = await boxRect.getAttribute('height')
    expect(initialWidth).not.toBeNull()
    expect(initialHeight).not.toBeNull()
    expect(parseFloat(initialWidth!)).toBeGreaterThan(0)
    expect(parseFloat(initialHeight!)).toBeGreaterThan(0)

    // Resize viewport
    await page.setViewportSize({ width: 800, height: 600 })

    // SVG-space dimensions are viewBox-relative and must not change; the
    // retrying assertions tolerate the resize settling without a fixed delay.
    await expect(boxRect).toHaveAttribute('width', initialWidth!)
    await expect(boxRect).toHaveAttribute('height', initialHeight!)
  })

  test('SVG preserveAspectRatio is set correctly', async ({
    annotationWorkspace,
    page,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    // The drawing canvas SVG must be mounted before we can read its attributes.
    await expect(annotationWorkspace.videoCanvas).toBeVisible({ timeout: 10000 })

    // Check SVG configuration - the drawing canvas SVG has both viewBox and preserveAspectRatio
    // There may be multiple SVGs on the page, so we need to find the one with both attributes
    const svgConfig = await page.evaluate(() => {
      // Find all SVGs with viewBox attribute
      const svgs = document.querySelectorAll('svg[viewBox]')
      for (const svg of svgs) {
        const par = svg.getAttribute('preserveAspectRatio')
        // The DrawingCanvas SVG has preserveAspectRatio="xMidYMid meet"
        if (par && par.includes('xMidYMid')) {
          return {
            preserveAspectRatio: par,
            viewBox: svg.getAttribute('viewBox'),
          }
        }
      }
      // Return first SVG with viewBox as fallback
      const svg = svgs[0]
      if (!svg) return null
      return {
        preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
        viewBox: svg.getAttribute('viewBox'),
      }
    })

    expect(svgConfig).not.toBeNull()
    // The drawing canvas SVG should use xMidYMid meet for proper aspect ratio preservation
    // If preserveAspectRatio is null, it defaults to "xMidYMid meet" per SVG spec
    const par = svgConfig!.preserveAspectRatio
    expect(par === null || par === 'xMidYMid meet').toBe(true)
  })

  test('drawing new boxes works correctly after resize', async ({
    annotationWorkspace,
    page,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    // Resize viewport first
    await page.setViewportSize({ width: 1024, height: 768 })

    // Wait for the canvas layout to settle after the resize before measuring it,
    // so the computed draw center lands inside the (letterboxed) video frame
    // rather than in the dead margin. The canvas fills its container via CSS, so
    // its measured width stops changing once the new viewport layout is flushed;
    // poll for two consecutive equal, non-zero measurements instead of sleeping.
    await expect(annotationWorkspace.videoCanvas).toBeVisible({ timeout: 10000 })
    let previousWidth = -1
    await expect
      .poll(
        async () => {
          const width = (await annotationWorkspace.videoCanvas.boundingBox())?.width ?? 0
          const settled = width > 0 && width === previousWidth
          previousWidth = width
          return settled
        },
        { timeout: 10000 },
      )
      .toBe(true)

    // Draw a bounding box at the resized viewport. Pass the worker's own
    // persona (which owns testEntityType) so a type is selectable and the draw
    // actually persists an annotation; the default picks the first global
    // persona, which under parallel workers can be a type-less one.
    //
    // Center the draw inside the canvas rather than using the default
    // top-left offset: at 1024x768 the 4:3 viewport letterboxes the 16:9
    // video top and bottom, so a fixed (50,50) origin lands in the dead
    // margin above the video frame and no annotation is created. The canvas
    // center always falls inside the video content regardless of how the
    // letterbox shifts with the viewport aspect ratio.
    const canvasBox = await annotationWorkspace.videoCanvas.boundingBox()
    if (!canvasBox) throw new Error('video canvas not measurable after resize')
    await annotationWorkspace.drawSimpleBoundingBox({
      personaName: testPersona.name,
      box: {
        x: canvasBox.width / 2 - 60,
        y: canvasBox.height / 2 - 60,
        width: 120,
        height: 120,
      },
    })
    await annotationWorkspace.expectBoundingBoxVisible()

    // Verify the box was created successfully by waiting for the rendered rect.
    await expect(page.locator('[data-testid="bounding-box"] rect').first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Bounding Box Position Stability', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('box stays in same video position through multiple resize cycles', async ({
    annotationWorkspace,
    page,
    testUser,
    testPersona,
    testEntityType,
    testVideo,
  }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()

    const boxRect = page.locator('[data-testid="bounding-box"] rect').first()
    await expect(boxRect).toBeVisible({ timeout: 10000 })

    // Get initial SVG coordinates (these should never change across viewports)
    const initial = {
      x: await boxRect.getAttribute('x'),
      y: await boxRect.getAttribute('y'),
      width: await boxRect.getAttribute('width'),
      height: await boxRect.getAttribute('height'),
    }
    expect(initial.x).not.toBeNull()
    expect(initial.y).not.toBeNull()
    expect(initial.width).not.toBeNull()
    expect(initial.height).not.toBeNull()

    // Cycle through different viewport sizes
    const viewports = [
      { width: 800, height: 600 },
      { width: 1920, height: 1080 },
      { width: 1024, height: 768 },
      { width: 1280, height: 720 },
    ]

    for (const viewport of viewports) {
      await page.setViewportSize(viewport)

      // SVG coordinates must remain exactly the same; the retrying attribute
      // assertions settle out any transient re-render without a fixed delay.
      await expect(boxRect).toHaveAttribute('x', initial.x!)
      await expect(boxRect).toHaveAttribute('y', initial.y!)
      await expect(boxRect).toHaveAttribute('width', initial.width!)
      await expect(boxRect).toHaveAttribute('height', initial.height!)
    }
  })
})
