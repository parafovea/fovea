import { test, expect } from '../../fixtures/test-context.js'
import { openDataDialog, parseDataRecords, readExportDownload, uploadJsonl } from '../../utils/data-dialogs.js'

/** Requires the data dialogs and checks their controls without platform-specific screenshots. */
test.describe('Export/Import Dialog Regression', () => {
  test('defaults to keyframe-only exports', async ({ page, testUser }) => {
    void testUser
    const dialog = await openDataDialog(page, 'Export')
    await expect(dialog.getByText('Export keyframes only (recommended)', { exact: true })).toBeVisible()
    const modes = dialog.locator('[data-slot="checkbox"]')
    await expect(modes.nth(0)).toBeChecked()
    await expect(modes.nth(1)).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
  })

  test('warns when interpolated frames are selected', async ({ page, testUser }) => {
    void testUser
    const dialog = await openDataDialog(page, 'Export')
    await dialog.locator('[data-slot="checkbox"]').nth(1).check()
    await expect(dialog.getByRole('alert').filter({ hasText: 'File size can be 100x larger' })).toBeVisible()
    await expect(dialog.locator('[data-slot="checkbox"]').nth(0)).not.toBeChecked()
  })

  test('sends the selected annotation type to the statistics endpoint', async ({ page, testUser }) => {
    void testUser
    const dialog = await openDataDialog(page, 'Export')
    const statsPromise = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname === '/api/export/stats' && url.searchParams.get('annotationTypes') === 'type'
    })
    await dialog.getByRole('button', { name: 'Type Annotations', exact: true }).click()
    expect((await statsPromise).ok()).toBe(true)
  })

  test('requires a file before import', async ({ page, testUser }) => {
    void testUser
    const dialog = await openDataDialog(page, 'Import')
    await expect(dialog.getByText('Drag and drop a .jsonl file here', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()
    await expect(dialog.getByRole('heading', { name: 'Preview', exact: true })).toHaveCount(0)
  })

  test('rejects a file with the wrong extension', async ({ page, testUser }) => {
    void testUser
    const dialog = await openDataDialog(page, 'Import')
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'unsupported.txt', mimeType: 'text/plain', buffer: Buffer.from('{}'),
    })
    await expect(dialog.getByRole('alert').filter({ hasText: 'Only .jsonl files are accepted' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()
  })

  test('shows the available duplicate-persona resolutions', async ({ page, testPersona }) => {
    const response = await page.request.get(`/api/export?personaIds=${testPersona.id}`)
    expect(response.ok()).toBe(true)
    const personaRecord = parseDataRecords(await response.text()).find(record =>
      record.type === 'persona' && record.data.id === testPersona.id)
    expect(personaRecord).toBeDefined()
    const dialog = await openDataDialog(page, 'Import')
    await uploadJsonl(dialog, [personaRecord!])
    await expect(dialog.getByRole('button', { name: 'Duplicate Personas (1)', exact: true })).toBeVisible()
    for (const label of ['Skip (keep existing)', 'Replace with imported', 'Merge fields', 'Create as new copy']) {
      await expect(dialog.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(dialog.getByRole('radiogroup').first().getByRole('radio').first()).toBeChecked()
  })

  test('shows progress and prevents duplicate exports while the response is pending', async ({ page, testPersona }) => {
    void testPersona
    const dialog = await openDataDialog(page, 'Export')
    let releaseResponse: () => void = () => {}
    const responseGate = new Promise<void>(resolve => { releaseResponse = resolve })
    await page.route(url => url.pathname === '/api/export', async route => {
      const response = await route.fetch()
      await responseGate
      await route.fulfill({ response })
    })
    try {
      const downloadPromise = page.waitForEvent('download')
      await dialog.getByRole('button', { name: 'Export', exact: true }).click()
      await expect(dialog.getByText('Exporting data...', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Exporting...', exact: true })).toBeDisabled()
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
      releaseResponse()
      await readExportDownload(await downloadPromise)
      await expect(dialog).toBeHidden()
    } finally {
      releaseResponse()
    }
  })
})
