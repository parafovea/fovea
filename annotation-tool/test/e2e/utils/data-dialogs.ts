import { readFile } from 'node:fs/promises'
import type { Download, Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** A JSONL record exported by the data dialog. */
export interface DataRecord {
  type: string
  data: Record<string, unknown>
}

/** Opens the toolbar's data dialog and requires it to finish mounting. */
export async function openDataDialog(page: Page, action: 'Export' | 'Import'): Promise<Locator> {
  await page.goto('/')
  await page.getByRole('button', { name: action, exact: true }).click()
  const dialog = page.getByRole('dialog', {
    name: action === 'Export' ? 'Export All Data' : 'Import Data', exact: true,
  })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Uploads JSONL records without sharing temporary files between workers. */
export async function uploadJsonl(dialog: Locator, records: DataRecord[]): Promise<void> {
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'data-dialog-test.jsonl',
    mimeType: 'application/x-ndjson',
    buffer: Buffer.from(records.map(record => JSON.stringify(record)).join('\n')),
  })
  await expect(dialog.getByRole('heading', { name: 'Preview', exact: true })).toBeVisible()
}

/** Parses every exported row and rejects empty or malformed exports. */
export function parseDataRecords(content: string): DataRecord[] {
  const records = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as DataRecord)
  expect(records.length).toBeGreaterThan(0)
  for (const record of records) {
    expect(typeof record.type).toBe('string')
    expect(typeof record.data).toBe('object')
    expect(record.data).not.toBeNull()
  }
  return records
}

/** Reads an actual browser download and validates its JSONL content. */
export async function readExportDownload(download: Download): Promise<DataRecord[]> {
  expect(download.suggestedFilename()).toMatch(/\.jsonl$/)
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  return parseDataRecords(await readFile(downloadPath!, 'utf8'))
}
