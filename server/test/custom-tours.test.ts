/**
 * Custom-tour loader tests. Cover the failure modes a self-hoster is
 * most likely to trip:
 *   - var unset → silent zero-tour return (no log spam in stock builds)
 *   - dir missing → same silent return
 *   - dir is a regular file → reports a single failure
 *   - valid JSON tour → loaded
 *   - valid YAML tour → loaded (the minimal parser handles the flat
 *     shape we publish; anything richer is the self-hoster's problem
 *     until we add js-yaml)
 *   - malformed file → reported as failure, other files still load
 *   - non-tour fields ignored (forward-compat)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCustomTours } from '../src/lib/custom-tours.js'

describe('loadCustomTours', () => {
  const originalEnv = process.env.FOVEA_TOURS_DIR
  let tmpDir: string | null = null

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fovea-tours-test-'))
  })

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
    if (originalEnv === undefined) {
      delete process.env.FOVEA_TOURS_DIR
    } else {
      process.env.FOVEA_TOURS_DIR = originalEnv
    }
  })

  it('returns nothing when FOVEA_TOURS_DIR is unset', async () => {
    delete process.env.FOVEA_TOURS_DIR
    const result = await loadCustomTours()
    expect(result.tours).toEqual([])
    expect(result.failures).toEqual([])
  })

  it('returns nothing when FOVEA_TOURS_DIR points at a missing directory', async () => {
    process.env.FOVEA_TOURS_DIR = join(tmpDir!, 'does-not-exist')
    const result = await loadCustomTours()
    expect(result.tours).toEqual([])
    expect(result.failures).toEqual([])
  })

  it('reports a failure when FOVEA_TOURS_DIR is a regular file', async () => {
    const filePath = join(tmpDir!, 'not-a-dir')
    await writeFile(filePath, 'foo', 'utf-8')
    process.env.FOVEA_TOURS_DIR = filePath
    const result = await loadCustomTours()
    expect(result.tours).toEqual([])
    expect(result.failures).toHaveLength(1)
  })

  it('loads a valid JSON tour file', async () => {
    process.env.FOVEA_TOURS_DIR = tmpDir!
    await writeFile(
      join(tmpDir!, 'team.json'),
      JSON.stringify({
        id: 'team-onboarding',
        title: 'How we annotate',
        description: 'Our internal walkthrough.',
        durationMinutes: 3,
        tags: ['team', 'onboarding'],
      }),
      'utf-8',
    )
    const result = await loadCustomTours()
    expect(result.failures).toEqual([])
    expect(result.tours).toEqual([
      {
        id: 'team-onboarding',
        title: 'How we annotate',
        description: 'Our internal walkthrough.',
        durationMinutes: 3,
        tags: ['team', 'onboarding'],
      },
    ])
  })

  it('loads a valid YAML tour file with a tags list', async () => {
    process.env.FOVEA_TOURS_DIR = tmpDir!
    await writeFile(
      join(tmpDir!, 'medical.yaml'),
      [
        'id: medical-onboarding',
        "title: How we annotate CT scans",
        "description: Walks a new annotator through the radiology workflow.",
        'durationMinutes: 4',
        'tags:',
        '  - radiology',
        '  - onboarding',
      ].join('\n'),
      'utf-8',
    )
    const result = await loadCustomTours()
    expect(result.failures).toEqual([])
    expect(result.tours).toHaveLength(1)
    expect(result.tours[0].id).toBe('medical-onboarding')
    expect(result.tours[0].tags).toEqual(['radiology', 'onboarding'])
  })

  it('reports malformed files as failures without dropping siblings', async () => {
    process.env.FOVEA_TOURS_DIR = tmpDir!
    await writeFile(join(tmpDir!, 'good.json'), JSON.stringify({
      id: 'good',
      title: 'Good tour',
      description: 'Loads.',
      durationMinutes: 2,
    }), 'utf-8')
    await writeFile(join(tmpDir!, 'broken.json'), '{ not valid json', 'utf-8')
    await writeFile(join(tmpDir!, 'missing-fields.json'), JSON.stringify({ id: 'x' }), 'utf-8')

    const result = await loadCustomTours()
    const ids = result.tours.map((t) => t.id)
    expect(ids).toEqual(['good'])
    expect(result.failures.length).toBe(2)
  })

  it('ignores files that are not .json/.yaml/.yml', async () => {
    process.env.FOVEA_TOURS_DIR = tmpDir!
    await mkdir(join(tmpDir!, 'subdir'), { recursive: true })
    await writeFile(join(tmpDir!, 'README.md'), '# tours', 'utf-8')
    await writeFile(join(tmpDir!, '.hidden'), 'something', 'utf-8')
    const result = await loadCustomTours()
    expect(result.tours).toEqual([])
    expect(result.failures).toEqual([])
  })
})
