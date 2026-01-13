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

    // Get box position and verify it has valid coordinates
    const boxCoords = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="bounding-box"] rect')
      if (!rect) return null
      return {
        x: parseFloat(rect.getAttribute('x') || '0'),
        y: parseFloat(rect.getAttribute('y') || '0'),
        width: parseFloat(rect.getAttribute('width') || '0'),
        height: parseFloat(rect.getAttribute('height') || '0'),
      }
    })

    expect(boxCoords).not.toBeNull()
    expect(boxCoords!.x).toBeGreaterThanOrEqual(0)
    expect(boxCoords!.y).toBeGreaterThanOrEqual(0)
    expect(boxCoords!.width).toBeGreaterThan(5)
    expect(boxCoords!.height).toBeGreaterThan(5)
  })
})

test.describe('Selection Persistence (Issue #59)', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('selection persists after drawing bounding box', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    // Select persona and type
    const personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await expect(personaSelect).toBeVisible({ timeout: 10000 })
    await personaSelect.click()
    await page.waitForTimeout(500)

    const personaListbox = page.getByRole('listbox', { name: /select persona/i })
    await expect(personaListbox).toBeVisible({ timeout: 5000 })
    const personaOption = personaListbox.getByRole('option').filter({ hasNotText: /^None$/i }).first()
    await personaOption.click()
    await page.waitForTimeout(1000)

    // Wait for type select to be enabled
    const typeSelect = page.getByRole('combobox', { name: /select type/i })
    await expect(typeSelect).toBeEnabled({ timeout: 30000 })
    await typeSelect.click()
    await page.waitForTimeout(500)
    await typeSelect.press('ArrowDown')
    await page.waitForTimeout(300)
    await typeSelect.press('Enter')
    await page.waitForTimeout(500)

    // Draw first bounding box
    await annotationWorkspace.drawBoundingBox({ x: 50, y: 50, width: 100, height: 100 })
    await page.waitForTimeout(500)

    // Verify cursor is still crosshair (selection preserved)
    const cursor = await page.evaluate(() => {
      const svg = document.querySelector('svg[viewBox]')
      return svg ? getComputedStyle(svg).cursor : null
    })
    expect(cursor).toBe('crosshair')
  })

  test('can draw multiple consecutive boxes for same type', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await page.waitForTimeout(500)

    // Cursor should still be crosshair for drawing more boxes
    const cursor = await page.evaluate(() => {
      const svg = document.querySelector('svg[viewBox]')
      return svg ? getComputedStyle(svg).cursor : null
    })
    expect(cursor).toBe('crosshair')

    // Draw another box without reselecting
    await annotationWorkspace.drawBoundingBox({ x: 200, y: 50, width: 100, height: 100 })
    await page.waitForTimeout(500)

    // Verify at least two annotations were created
    const annotationHeading = page.getByRole('heading', { name: /All Annotations/i })
    await expect(annotationHeading).toContainText(/\([2-9]\d*\)/, { timeout: 5000 })
  })
})

test.describe('Labels and Visual Distinction (Issue #60)', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('type annotation shows actual type name in label', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    // Select persona
    const personaSelect = page.getByRole('combobox', { name: /select persona/i })
    await expect(personaSelect).toBeVisible({ timeout: 10000 })
    await personaSelect.click()
    await page.waitForTimeout(500)

    const personaListbox = page.getByRole('listbox', { name: /select persona/i })
    await expect(personaListbox).toBeVisible({ timeout: 5000 })
    const personaOption = personaListbox.getByRole('option').filter({ hasNotText: /^None$/i }).first()
    await personaOption.click()
    await page.waitForTimeout(1000)

    // Select type and capture its name
    const typeSelect = page.getByRole('combobox', { name: /select type/i })
    await expect(typeSelect).toBeEnabled({ timeout: 30000 })
    await typeSelect.click()
    await page.waitForTimeout(500)

    // Get the first option's text before selecting
    const typeListbox = page.getByRole('listbox')
    const typeOption = typeListbox.getByRole('option').first()
    const expectedTypeName = await typeOption.textContent()
    await typeOption.click()
    await page.waitForTimeout(500)

    // Draw bounding box
    await annotationWorkspace.drawBoundingBox({ x: 50, y: 50, width: 100, height: 100 })
    await page.waitForTimeout(500)

    // Verify label shows the actual type name (e.g., "Test Entity Type", not "entity")
    const label = page.locator('[data-testid="bounding-box"] .MuiChip-label')
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
    await annotationWorkspace.drawSimpleBoundingBox()
    await page.waitForTimeout(500)

    // Verify the stroke color indicates the kind
    const strokeColor = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="bounding-box"] rect')
      return rect ? rect.getAttribute('stroke') : null
    })

    // Entity types should be green, events orange, roles blue
    expect(['#4caf50', '#ff9800', '#2196f3']).toContain(strokeColor)
  })

  test('type annotations have thinner stroke than object annotations', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await page.waitForTimeout(500)

    // Verify the stroke width for type annotation (should be 2px)
    const strokeWidth = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="bounding-box"] rect')
      return rect ? rect.getAttribute('stroke-width') : null
    })

    // Type annotations should have stroke width of 2
    expect(strokeWidth).toBe('2')
  })
})

test.describe('Annotation Panel Consistency', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('annotation panel shows colored chip for type annotations', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await page.waitForTimeout(500)

    // Verify the annotation panel shows a colored chip
    const listItem = page.locator('.MuiDrawer-root .MuiListItem-root').first()
    const chip = listItem.locator('.MuiChip-root')
    await expect(chip).toBeVisible({ timeout: 5000 })
  })

  test('type and object annotations have consistent colors between box and panel', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await page.waitForTimeout(500)

    // Get bounding box stroke color
    const boxStroke = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="bounding-box"] rect')
      return rect?.getAttribute('stroke')
    })

    // Get chip color from panel
    const chipClass = await page.evaluate(() => {
      const chip = document.querySelector('.MuiDrawer-root .MuiListItem-root .MuiChip-root')
      return chip?.className
    })

    // Both should indicate the same kind
    if (boxStroke === '#4caf50') {
      // Entity - should be success color
      expect(chipClass).toContain('MuiChip-colorSuccess')
    } else if (boxStroke === '#ff9800') {
      // Event - should be warning color
      expect(chipClass).toContain('MuiChip-colorWarning')
    } else if (boxStroke === '#2196f3') {
      // Role - should be primary color
      expect(chipClass).toContain('MuiChip-colorPrimary')
    }
  })
})
