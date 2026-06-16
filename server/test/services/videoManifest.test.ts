import { describe, it, expect } from 'vitest'
import {
  parseVideoManifest,
  selectProjectForVideo,
  globToRegExp,
  ManifestValidationError,
  ManifestProject,
} from '../../src/services/videoManifest.js'

describe('parseVideoManifest', () => {
  it('parses a full manifest with groups and projects', () => {
    const manifest = parseVideoManifest(
      JSON.stringify({
        groups: [
          {
            slug: 'scale',
            name: 'SCALE Team',
            description: 'The team',
            members: [{ username: 'wgantt', role: 'group_admin' }],
          },
        ],
        projects: [
          { slug: 'scale-qc', name: 'SCALE QC', ownerGroup: 'scale', paths: ['scale-team/**'] },
        ],
      })
    )

    expect(manifest.groups).toHaveLength(1)
    expect(manifest.groups[0]).toMatchObject({ slug: 'scale', name: 'SCALE Team' })
    expect(manifest.groups[0].members).toEqual([{ username: 'wgantt', role: 'group_admin' }])
    expect(manifest.projects).toHaveLength(1)
    expect(manifest.projects[0]).toMatchObject({ slug: 'scale-qc', ownerGroup: 'scale', paths: ['scale-team/**'] })
  })

  it('treats missing groups/projects as empty', () => {
    const manifest = parseVideoManifest('{}')
    expect(manifest.groups).toEqual([])
    expect(manifest.projects).toEqual([])
  })

  it('rejects invalid JSON', () => {
    expect(() => parseVideoManifest('{ not json')).toThrow(ManifestValidationError)
  })

  it('rejects a non-kebab-case slug', () => {
    expect(() =>
      parseVideoManifest(JSON.stringify({ groups: [{ slug: 'Bad_Slug', name: 'x' }] }))
    ).toThrow(/kebab-case/)
  })

  it('rejects an unknown group member role', () => {
    expect(() =>
      parseVideoManifest(
        JSON.stringify({
          groups: [{ slug: 'g', name: 'G', members: [{ username: 'u', role: 'superuser' }] }],
        })
      )
    ).toThrow(/role/)
  })

  it('rejects duplicate project slugs', () => {
    expect(() =>
      parseVideoManifest(
        JSON.stringify({
          projects: [
            { slug: 'p', name: 'P1', paths: ['a/**'] },
            { slug: 'p', name: 'P2', paths: ['b/**'] },
          ],
        })
      )
    ).toThrow(/duplicate project slug/)
  })

  it('rejects a project with no paths', () => {
    expect(() =>
      parseVideoManifest(JSON.stringify({ projects: [{ slug: 'p', name: 'P', paths: [] }] }))
    ).toThrow(/paths/)
  })
})

describe('globToRegExp', () => {
  it('matches ** across directory separators', () => {
    expect(globToRegExp('a/**').test('a/b.mp4')).toBe(true)
    expect(globToRegExp('a/**').test('a/b/c.mp4')).toBe(true)
    expect(globToRegExp('a/**').test('b/c.mp4')).toBe(false)
  })

  it('matches * only within a single segment', () => {
    expect(globToRegExp('a/*.mp4').test('a/clip.mp4')).toBe(true)
    expect(globToRegExp('a/*.mp4').test('a/sub/clip.mp4')).toBe(false)
  })
})

describe('selectProjectForVideo (nearest wins)', () => {
  const projects: ManifestProject[] = [
    { slug: 'corpus', name: 'Corpus', paths: ['**'] },
    { slug: 'team', name: 'Team', paths: ['scale-team/**'] },
    { slug: 'qc', name: 'QC', paths: ['scale-team/qc/**'] },
    { slug: 'one-clip', name: 'One', paths: ['scale-team/qc/special.mp4'] },
  ]

  it('falls back to the broadest glob when nothing more specific matches', () => {
    expect(selectProjectForVideo('random/clip.mp4', projects)?.slug).toBe('corpus')
  })

  it('prefers the team glob over the catch-all', () => {
    expect(selectProjectForVideo('scale-team/intro.mp4', projects)?.slug).toBe('team')
  })

  it('prefers the deeper qc glob inside the team subtree', () => {
    expect(selectProjectForVideo('scale-team/qc/clip.mp4', projects)?.slug).toBe('qc')
  })

  it('prefers an exact file match over any glob', () => {
    expect(selectProjectForVideo('scale-team/qc/special.mp4', projects)?.slug).toBe('one-clip')
  })

  it('returns null when no project glob matches', () => {
    const narrow: ManifestProject[] = [{ slug: 'team', name: 'Team', paths: ['scale-team/**'] }]
    expect(selectProjectForVideo('other/clip.mp4', narrow)).toBeNull()
  })
})
