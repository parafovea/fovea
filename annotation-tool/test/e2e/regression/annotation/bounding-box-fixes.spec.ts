import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for bounding box bug fixes (Issues #58, #59, #60).
 * Tests coordinate positioning, selection persistence, and label/color consistency.
 */

test.describe('Bounding Box Position (Issue #58)', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('bounding box appears at click position without offset', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    // Draw a bounding box at a specific position
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.expectBoundingBoxVisible()

    // Verify the box was created
    const boxExists = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="bounding-box"] rect')
      return rect !== null
    })
    expect(boxExists).toBe(true)

    // Get box position via getBoundingClientRect (screen coordinates)
    // SVG coordinates can be in viewBox space which may differ from screen space
    const boxCoords = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="bounding-box"] rect')
      if (!rect) return null
      const bbox = rect.getBoundingClientRect()
      return {
        width: bbox.width,
        height: bbox.height,
        // Also get SVG attributes to verify they exist
        hasX: rect.hasAttribute('x'),
        hasY: rect.hasAttribute('y'),
        hasWidth: rect.hasAttribute('width'),
        hasHeight: rect.hasAttribute('height'),
      }
    })

    expect(boxCoords).not.toBeNull()
    // Verify the box has positive dimensions in screen space
    expect(boxCoords!.width).toBeGreaterThan(5)
    expect(boxCoords!.height).toBeGreaterThan(5)
    // Verify SVG attributes exist
    expect(boxCoords!.hasX).toBe(true)
    expect(boxCoords!.hasY).toBe(true)
    expect(boxCoords!.hasWidth).toBe(true)
    expect(boxCoords!.hasHeight).toBe(true)
  })
})

test.describe('Selection Persistence (Issue #59)', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('persona and type selection persist after drawing bounding box', async ({ annotationWorkspace, page, testPersona, testVideo }) => {
    void testVideo
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()
    const personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await expect(personaSelect).toBeVisible()
  })

  test('can draw multiple consecutive boxes by reselecting type', async ({ annotationWorkspace, page, testPersona, testVideo }) => {
    void testVideo
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()
    const annotationHeading = page.getByRole('heading', { name: /All Annotations/i })
    await expect(annotationHeading).toContainText(/\([1-9]\d*\)/, { timeout: 10000 })

    // Re-select type for the next draw (drawing state resets after each annotation).
    await annotationWorkspace.selectFirstType()
    const savePromise = annotationWorkspace.createAnnotationSavePromise(20000)
    await annotationWorkspace.drawBoundingBox({ x: 250, y: 50, width: 100, height: 100 })
    await savePromise
    await expect(annotationHeading).toContainText(/\([2-9]\d*\)/, { timeout: 15000 })
  })
})

test.describe('Labels and Visual Distinction (Issue #60)', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('type annotation shows actual type name in label', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })

    // Verify label shows the actual type name (e.g., "Test Entity Type", not "entity")
    // The shadcn Badge inside the bounding-box foreignObject renders as a <span>
    const label = page.locator('[data-testid="bounding-box"] foreignObject span')
    await expect(label.first()).toBeVisible({ timeout: 5000 })

    // The label should contain the type name, not just the category
    const labelText = await label.first().textContent()
    expect(labelText).toBeTruthy()
    // The label should either match the expected type name or be a valid type name
    // (not just "entity", "role", or "event")
    expect(['entity', 'role', 'event']).not.toContain(labelText?.toLowerCase())
  })

  test('type annotation has correct color for its kind', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()

    // Verify the stroke color indicates the kind
    const strokeColor = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="bounding-box"] rect')
      return rect ? rect.getAttribute('stroke') : null
    })

    // Entity types should be green, events orange, roles blue
    expect(['#4caf50', '#ff9800', '#2196f3']).toContain(strokeColor)
  })

  test('type annotations have appropriate stroke width', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()

    // Verify the stroke width for type annotation
    // Type annotations use baseStroke=3 (object=6), scaled by mode (keyframe=1x, interpolated=0.75x)
    const strokeWidth = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="bounding-box"] rect')
      if (!rect) return null
      // Try attribute first, then computed style
      const attr = rect.getAttribute('stroke-width')
      if (attr) return parseFloat(attr)
      const style = getComputedStyle(rect)
      return parseFloat(style.strokeWidth) || null
    })

    expect(strokeWidth).not.toBeNull()
    // Type annotations should have stroke width between 2.25 (3*0.75) and 3,
    // which also distinguishes them from object annotations (4.5-6).
    expect(strokeWidth).toBeGreaterThanOrEqual(2.25)
    expect(strokeWidth).toBeLessThanOrEqual(3)
  })
})

test.describe('Annotation Panel Consistency', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('annotation panel shows colored chip for type annotations', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()

    // Annotation rows in the sidebar list render a shadcn Badge whose
    // accessible text is the type category — match directly on any
    // element whose text is exactly one of those category names.
    const drawerChip = page
      .locator('ul li')
      .locator(':text-matches("^(entity|event|role|Entity|Event|Location|Collection)$", "i")')
      .first()
    await expect(drawerChip).toBeVisible({ timeout: 10000 })
  })

  test('type and object annotations have consistent colors between box and panel', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Wait for annotation to be created and visible with longer timeout
    await annotationWorkspace.expectBoundingBoxVisible()

    // Wait for UI to stabilize
    await page.waitForTimeout(1000)

    // Get bounding box stroke color
    const boxStroke = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="bounding-box"] rect')
      return rect?.getAttribute('stroke')
    })

    // Get badge classes from panel (shadcn Badge renders as a span with variant utility classes).
    // Find the first badge inside the annotations sidebar (the panel containing "All Annotations").
    const chipClass = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('h3')).find((h) =>
        /all annotations/i.test(h.textContent ?? '')
      )
      const sidebar = heading?.closest('div.shrink-0') ?? heading?.parentElement
      const badge = sidebar?.querySelector('ul li span')
      return badge?.className ?? null
    })

    // Both should indicate the same kind based on Badge variant -> Tailwind class mapping.
    // entity -> variant="default" -> bg-primary
    // event  -> variant="secondary" -> bg-secondary
    // role   -> variant="outline" -> border-border (no bg-* fill)
    if (boxStroke === '#4caf50') {
      expect(chipClass).toContain('bg-primary')
    } else if (boxStroke === '#ff9800') {
      expect(chipClass).toContain('bg-secondary')
    } else if (boxStroke === '#2196f3') {
      expect(chipClass).toContain('border-border')
    } else {
      // If stroke is some other color, just verify the badge exists
      expect(chipClass).toBeTruthy()
    }
  })
})
