import { randomUUID } from 'node:crypto'
import { test, expect } from '../../fixtures/test-context.js'
import { openDataDialog, parseDataRecords, readExportDownload, uploadJsonl } from '../../utils/data-dialogs.js'

/** Exercises data export, preview, conflict detection, and import through the UI. */
test.describe('Export/Import Flow', () => {
  test('downloads the fixture persona and its ontology as JSONL', async ({ page, testPersona, db }) => {
    const entity = await db.createEntityType(testPersona.id, {
      name: 'Export Test Entity', definition: 'An entity for export testing',
    })
    const dialog = await openDataDialog(page, 'Export')
    const downloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Export', exact: true }).click()
    const records = await readExportDownload(await downloadPromise)
    expect(records).toContainEqual(expect.objectContaining({
      type: 'persona', data: expect.objectContaining({ id: testPersona.id, name: testPersona.name }),
    }))
    expect(records).toContainEqual(expect.objectContaining({
      type: 'ontology', data: expect.objectContaining({
        personaId: testPersona.id,
        entityTypes: expect.arrayContaining([expect.objectContaining({ id: entity.id, name: entity.name })]),
      }),
    }))
    await expect(dialog).toBeHidden()
  })

  test('shows server statistics before download', async ({ page, testPersona, db }) => {
    await db.createEntityType(testPersona.id, { name: 'Stats Test Entity', definition: 'Statistics fixture' })
    const statsPromise = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/export/stats' && response.ok())
    const dialog = await openDataDialog(page, 'Export')
    const stats = await (await statsPromise).json()
    expect(stats.entityTypeCount).toBeGreaterThanOrEqual(1)
    await expect(dialog.getByText('Ontology Types', { exact: true }).locator('..')).toContainText(
      `${stats.entityTypeCount} entity, ${stats.eventTypeCount} event, ${stats.roleTypeCount} role, ${stats.relationTypeCount} relation`,
    )
    await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
  })

  test('exports ontology data without bounding box annotations', async ({ page, testPersona, db }) => {
    const entity = await db.createEntityType(testPersona.id, {
      name: 'No Annotation Entity', definition: 'An ontology-only export fixture',
    })
    const response = await page.request.get(`/api/export?personaIds=${testPersona.id}`)
    expect(response.ok()).toBe(true)
    const records = parseDataRecords(await response.text())
    expect(records.filter(record => record.type === 'annotation')).toHaveLength(0)
    expect(records).toContainEqual(expect.objectContaining({
      type: 'ontology', data: expect.objectContaining({
        personaId: testPersona.id,
        entityTypes: expect.arrayContaining([expect.objectContaining({ id: entity.id })]),
      }),
    }))
  })

  test('accepts JSONL files and displays format documentation', async ({ page, testUser }) => {
    void testUser
    const dialog = await openDataDialog(page, 'Import')
    await expect(dialog.locator('input[type="file"]')).toHaveAttribute('accept', '.jsonl')
    await dialog.getByRole('button', { name: 'Format Specification & Example' }).click()
    await expect(dialog.getByText('Realistic Example: Container Ship Tracking', { exact: true })).toBeVisible()
  })

  test('previews a persona without creating it', async ({ page, testUser }) => {
    void testUser
    const id = randomUUID()
    const now = new Date().toISOString()
    const dialog = await openDataDialog(page, 'Import')
    await uploadJsonl(dialog, [{ type: 'persona', data: {
      id, name: 'Preview Only', role: 'Analyst', informationNeed: 'Preview data without saving',
      createdAt: now, updatedAt: now,
    } }])
    await expect(dialog.getByText('Personas', { exact: true }).locator('..')).toHaveText(/^1\s*Personas$/)
    await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeEnabled()
    expect((await page.request.get(`/api/personas/${id}`)).status()).toBe(404)
  })

  test('shows missing dependencies before importing', async ({ page, testUser, testVideo }) => {
    const dialog = await openDataDialog(page, 'Import')
    await uploadJsonl(dialog, [{ type: 'annotation', data: {
      id: randomUUID(), videoId: testVideo.id, userId: testUser.id,
      annotationType: 'object', linkedEntityId: randomUUID(),
      boundingBoxSequence: {
        boxes: [{ x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true }],
        interpolationSegments: [], visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        totalFrames: 1, keyframeCount: 1, interpolatedFrameCount: 0,
      },
    } }])
    await expect(dialog.getByRole('button', { name: /Missing Dependencies \(/ })).toBeVisible()
    await expect(dialog.getByText('Skip this item', { exact: true })).toBeVisible()
  })

  test('re-imports an exported persona with its default skip resolution', async ({ page, testPersona }) => {
    const response = await page.request.get(`/api/export?personaIds=${testPersona.id}`)
    expect(response.ok()).toBe(true)
    const personaRecord = parseDataRecords(await response.text()).find(record =>
      record.type === 'persona' && record.data.id === testPersona.id)
    expect(personaRecord).toBeDefined()
    const dialog = await openDataDialog(page, 'Import')
    await uploadJsonl(dialog, [personaRecord!])
    await expect(dialog.getByRole('button', { name: 'Duplicate Personas (1)', exact: true })).toBeVisible()
    const importPromise = page.waitForResponse(result =>
      new URL(result.url()).pathname === '/api/import' && result.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    const result = await importPromise
    expect(result.ok()).toBe(true)
    expect((await result.json()).success).toBe(true)
    await expect(dialog).toBeHidden()
    const persisted = await page.request.get(`/api/personas/${testPersona.id}`)
    expect(persisted.ok()).toBe(true)
    expect(await persisted.json()).toMatchObject({ id: testPersona.id, name: testPersona.name, role: testPersona.role })
  })
})
