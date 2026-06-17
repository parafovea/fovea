/**
 * Parsing, validation, and glob matching for the optional video corpus
 * manifest (`fovea.manifest.json` at the root of the videos storage).
 *
 * The manifest lets a local admin declare projects and user groups alongside
 * the videos they govern: each project carries one or more path globs, and a
 * video is assigned to the project whose matching glob is most specific
 * ("nearest wins"). It is applied at sync time (see videoSync). Parsing here is
 * pure — it does not touch the database — so it is easy to unit test.
 */

/** A group member entry in the manifest. */
export interface ManifestGroupMember {
  username: string
  role: string
}

/** A user group declared in the manifest. */
export interface ManifestGroup {
  slug: string
  name: string
  description?: string
  members: ManifestGroupMember[]
}

/** A project declared in the manifest, with the path globs it owns. */
export interface ManifestProject {
  slug: string
  name: string
  description?: string
  ownerGroup?: string
  ownerUser?: string
  paths: string[]
}

/** A parsed, validated video corpus manifest. */
export interface VideoManifest {
  groups: ManifestGroup[]
  projects: ManifestProject[]
}

/** Thrown when the manifest is structurally invalid. */
export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManifestValidationError'
  }
}

/** Slug pattern shared by groups and projects (matches the groups route). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Group membership roles accepted in the manifest (see GroupMembership). */
const GROUP_ROLES = new Set(['group_owner', 'group_admin', 'group_member'])

function asObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ManifestValidationError(`${context} must be an object`)
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ManifestValidationError(`${context} must be a non-empty string`)
  }
  return value
}

function parseGroup(raw: unknown, index: number): ManifestGroup {
  const obj = asObject(raw, `groups[${index}]`)
  const slug = asString(obj.slug, `groups[${index}].slug`)
  if (!SLUG_PATTERN.test(slug)) {
    throw new ManifestValidationError(`groups[${index}].slug "${slug}" must be kebab-case (a-z, 0-9, hyphens)`)
  }
  const name = asString(obj.name, `groups[${index}].name`)
  const description = obj.description === undefined ? undefined : asString(obj.description, `groups[${index}].description`)

  const members: ManifestGroupMember[] = []
  if (obj.members !== undefined) {
    if (!Array.isArray(obj.members)) {
      throw new ManifestValidationError(`groups[${index}].members must be an array`)
    }
    obj.members.forEach((member, mi) => {
      const m = asObject(member, `groups[${index}].members[${mi}]`)
      const username = asString(m.username, `groups[${index}].members[${mi}].username`)
      const role = asString(m.role, `groups[${index}].members[${mi}].role`)
      if (!GROUP_ROLES.has(role)) {
        throw new ManifestValidationError(
          `groups[${index}].members[${mi}].role "${role}" must be one of ${[...GROUP_ROLES].join(', ')}`
        )
      }
      members.push({ username, role })
    })
  }

  return { slug, name, description, members }
}

function parseProject(raw: unknown, index: number): ManifestProject {
  const obj = asObject(raw, `projects[${index}]`)
  const slug = asString(obj.slug, `projects[${index}].slug`)
  if (!SLUG_PATTERN.test(slug)) {
    throw new ManifestValidationError(`projects[${index}].slug "${slug}" must be kebab-case (a-z, 0-9, hyphens)`)
  }
  const name = asString(obj.name, `projects[${index}].name`)
  const description = obj.description === undefined ? undefined : asString(obj.description, `projects[${index}].description`)
  const ownerGroup = obj.ownerGroup === undefined ? undefined : asString(obj.ownerGroup, `projects[${index}].ownerGroup`)
  const ownerUser = obj.ownerUser === undefined ? undefined : asString(obj.ownerUser, `projects[${index}].ownerUser`)

  if (!Array.isArray(obj.paths) || obj.paths.length === 0) {
    throw new ManifestValidationError(`projects[${index}].paths must be a non-empty array of glob strings`)
  }
  const paths = obj.paths.map((p, pi) => asString(p, `projects[${index}].paths[${pi}]`))

  return { slug, name, description, ownerGroup, ownerUser, paths }
}

/**
 * Parse and validate a manifest from its raw JSON text. Throws
 * {@link ManifestValidationError} with a precise message on any structural
 * problem so the caller can log it and continue with discovery only.
 */
export function parseVideoManifest(raw: string): VideoManifest {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new ManifestValidationError(`manifest is not valid JSON: ${(error as Error).message}`)
  }
  const obj = asObject(data, 'manifest')

  const groups: ManifestGroup[] = []
  if (obj.groups !== undefined) {
    if (!Array.isArray(obj.groups)) {
      throw new ManifestValidationError('manifest.groups must be an array')
    }
    obj.groups.forEach((g, i) => groups.push(parseGroup(g, i)))
  }

  const projects: ManifestProject[] = []
  if (obj.projects !== undefined) {
    if (!Array.isArray(obj.projects)) {
      throw new ManifestValidationError('manifest.projects must be an array')
    }
    obj.projects.forEach((p, i) => projects.push(parseProject(p, i)))
  }

  // Reject duplicate slugs early: an upsert keyed on slug would otherwise make
  // the last one silently win.
  assertUniqueSlugs(groups.map(g => g.slug), 'group')
  assertUniqueSlugs(projects.map(p => p.slug), 'project')

  return { groups, projects }
}

function assertUniqueSlugs(slugs: string[], kind: string): void {
  const seen = new Set<string>()
  for (const slug of slugs) {
    if (seen.has(slug)) {
      throw new ManifestValidationError(`duplicate ${kind} slug "${slug}" in manifest`)
    }
    seen.add(slug)
  }
}

/**
 * Convert a path glob to an anchored RegExp. Supports `**` (matches across
 * directory separators, optionally consuming a trailing slash), `*` (matches
 * within a single path segment), and `?` (a single non-separator character).
 */
export function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++ // `a/**/b` should also match `a/b`
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${re}$`)
}

/** Length of the literal prefix of a glob (the part before the first wildcard). */
function literalPrefixLength(glob: string): number {
  const wildcard = glob.search(/[*?]/)
  return wildcard === -1 ? glob.length : wildcard
}

/**
 * Select the project a video (given by its storage-relative key, e.g.
 * `scale-team/qc/clip.mp4`) belongs to. When several project globs match, the
 * one with the longest literal prefix wins ("nearest wins"); ties resolve to
 * the earliest project, then earliest path, in manifest order. Returns null
 * when no glob matches.
 */
export function selectProjectForVideo(
  relativeKey: string,
  projects: ManifestProject[]
): ManifestProject | null {
  let best: { project: ManifestProject; specificity: number } | null = null
  for (const project of projects) {
    for (const glob of project.paths) {
      if (globToRegExp(glob).test(relativeKey)) {
        const specificity = literalPrefixLength(glob)
        if (best === null || specificity > best.specificity) {
          best = { project, specificity }
        }
      }
    }
  }
  return best ? best.project : null
}
