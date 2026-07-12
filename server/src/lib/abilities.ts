/**
 * CASL authorization engine for role-based access control.
 *
 * Builds CASL ability instances from the RolePermission table and user role
 * assignments. System admins receive full access; all other users receive
 * permissions based on their system, group, and project roles.
 *
 * Uses PrismaAbility from @casl/prisma so the ability type is natively
 * compatible with accessibleBy() — no cast required at call sites.
 *
 * @module
 */

import { Prisma } from '@prisma/client'
import { createPrismaAbility } from '@casl/prisma'
import type { ForcedSubject, PureAbility, RawRuleFrom } from '@casl/ability'
import type { PrismaQuery } from '@casl/prisma'

/**
 * Narrow string-only form of subjects, used in rule definitions and
 * class-level authorize() checks. Must match Prisma.ModelName values
 * exactly so accessibleBy() can resolve them to Prisma WHERE clauses.
 */
export type SubjectName =
  | 'Annotation' | 'Claim' | 'Persona' | 'WorldState' | 'Video'
  | 'VideoSummary' | 'Project' | 'UserGroup' | 'User'
  // Layers-shaped annotation store. Every content model scopes on
  // createdByUserId (+ optional projectId); Tokenization and CorpusMembership
  // carry no scope columns of their own and are authorized via their parent
  // (the tokenization's expression, the membership's corpus).
  | 'Media' | 'Expression' | 'Segmentation' | 'Tokenization'
  | 'AnnotationLayer' | 'LayersAnnotation' | 'TextAnnotationRelation'
  | 'GraphNode' | 'GraphEdge' | 'LayersOntology' | 'TypeDef'
  | 'Corpus' | 'CorpusMembership' | 'ClusterSet' | 'Alignment'

/**
 * All actions that can be performed on resources.
 * 'manage' is a CASL built-in that grants all actions.
 */
export type Actions =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'share'
  | 'export'
  | 'assign'
  | 'manage_members'
  | 'fork'
  | 'review'
  | 'manage'

/**
 * Subject type for CASL abilities. Includes both string model names (for
 * accessibleBy) and ForcedSubject-tagged objects (for subject() helper).
 */
type Subjects =
  | Prisma.ModelName
  | 'all'
  | ForcedSubject<Prisma.ModelName>

/**
 * CASL ability parameterized with Fovea actions and Prisma model names.
 * Uses PureAbility with PrismaQuery conditions so the type works with both
 * accessibleBy() and subject()-tagged objects passed to can().
 */
export type AppAbility = PureAbility<[Actions, Subjects], PrismaQuery>

/** Raw rule shape for building ability rule arrays. */
type AppRule = RawRuleFrom<[Actions, Subjects], PrismaQuery>

/** Aggregated role information for a single user across all scopes. */
export interface UserRoles {
  /** System-level role: "system_admin" or "user". */
  systemRole: string
  /** Group memberships with their roles. */
  groupRoles: Array<{ groupId: string; role: string }>
  /** Project memberships with their roles. */
  projectRoles: Array<{ projectId: string; role: string }>
}

/** A single row from the RolePermission table. */
export interface RolePermissionRow {
  /** Permission scope: "system", "group", or "project". */
  scope: string
  /** Role identifier (e.g., "annotator", "project_owner"). */
  role: string
  /** Resource type (e.g., "annotation", "video"). */
  resourceType: string
  /** Action identifier (e.g., "create", "read"). */
  action: string
  /** When true, the permission applies only to resources the user created. */
  ownOnly: boolean
}

/**
 * Builds a CASL ability instance for the given user based on their roles and
 * the permission matrix from the database.
 *
 * System admins bypass all permission checks via `can('manage', 'all')`.
 * Other users receive permissions by matching their role assignments against
 * the RolePermission rows.
 */
export function defineAbilitiesFor(
  userId: string,
  roles: UserRoles,
  permissions: RolePermissionRow[],
): AppAbility {
  const rules: AppRule[] = []

  // System admin gets full access
  if (roles.systemRole === 'system_admin') {
    rules.push({ action: 'manage', subject: 'all' })
    return createPrismaAbility(rules)
  }

  // Ownership field varies per model. CASL's MongoQuery conditions match
  // against actual Prisma row fields, so we must use the correct column name.
  const ownershipField = (modelName: Prisma.ModelName): string => {
    switch (modelName) {
      case 'Persona':
      case 'WorldState':
      case 'Annotation':
        return modelName === 'Annotation' ? 'createdByUserId' : 'userId'
      case 'VideoSummary':
      case 'Claim':
      case 'UserGroup':
        return 'createdBy'
      case 'Project':
        return 'ownerUserId'
      default:
        return 'createdByUserId'
    }
  }

  // Apply permissions based on role hierarchy
  for (const perm of permissions) {
    const modelName = mapResourceTypeToModelName(perm.resourceType)
    if (!modelName) continue

    const action = perm.action as Actions
    const ownField = ownershipField(modelName)

    if (perm.scope === 'system') {
      if (perm.ownOnly) {
        rules.push({ action, subject: modelName, conditions: { [ownField]: userId } })
      } else {
        rules.push({ action, subject: modelName })
      }
    } else if (perm.scope === 'project') {
      const matchingProjects = roles.projectRoles
        .filter(pr => pr.role === perm.role)
        .map(pr => pr.projectId)

      if (matchingProjects.length > 0) {
        // The Project model *is* the project: its identity column is `id`,
        // whereas every content model references its enclosing project via
        // `projectId`. Scope the condition against the right column so a
        // project-scoped Project permission (read/update/delete/manage_members)
        // resolves against the project's own id.
        const projectKey = modelName === 'Project' ? 'id' : 'projectId'
        if (perm.ownOnly) {
          rules.push({ action, subject: modelName, conditions: { [projectKey]: { in: matchingProjects }, [ownField]: userId } })
        } else {
          rules.push({ action, subject: modelName, conditions: { [projectKey]: { in: matchingProjects } } })
        }
      }
    } else if (perm.scope === 'group') {
      const matchingGroups = roles.groupRoles
        .filter(gr => gr.role === perm.role)
        .map(gr => gr.groupId)

      if (matchingGroups.length > 0) {
        if (modelName === 'Project') {
          // A group-scoped Project permission (e.g. project:create granted to
          // group_owner / group_admin) applies only to projects owned by a
          // group the user administers. Scope by the candidate project's
          // ownerGroupId so a group admin cannot act on another group's
          // projects.
          rules.push({ action, subject: modelName, conditions: { ownerGroupId: { in: matchingGroups } } })
        } else if (perm.ownOnly) {
          rules.push({ action, subject: modelName, conditions: { [ownField]: userId } })
        } else {
          rules.push({ action, subject: modelName })
        }
      }
    }
  }

  // Baseline ownership rules: every user can always act on resources they
  // own, regardless of their role permissions. Uses the per-model ownership
  // field so conditions resolve against real Prisma rows.
  //
  // The `create` baselines are condition-scoped to the createdBy / userId
  // field on the candidate row so a user can only create resources they
  // will own — the upstream route always sets the candidate's ownership
  // field to request.user.id, so the rule matches and any attempt to
  // forge createdBy=otherUser fails. Pre-baseline behaviour required a
  // project_memberships row giving the user one of annotator /
  // project_manager / project_owner just to create a personal-persona
  // summary; with no such row (the production demo signed-up users
  // have zero project_memberships) every authoring action 403'd, and
  // the autosave loop in VideoSummaryEditor fired POST /api/summaries
  // every keystroke into a wall of 403s with no recovery.
  rules.push({ action: 'create', subject: 'Annotation', conditions: { createdByUserId: userId } })
  rules.push({ action: 'read', subject: 'Annotation', conditions: { createdByUserId: userId } })
  rules.push({ action: 'update', subject: 'Annotation', conditions: { createdByUserId: userId } })
  rules.push({ action: 'delete', subject: 'Annotation', conditions: { createdByUserId: userId } })
  rules.push({ action: 'create', subject: 'VideoSummary', conditions: { createdBy: userId } })
  rules.push({ action: 'read', subject: 'VideoSummary', conditions: { createdBy: userId } })
  rules.push({ action: 'update', subject: 'VideoSummary', conditions: { createdBy: userId } })
  rules.push({ action: 'delete', subject: 'VideoSummary', conditions: { createdBy: userId } })
  rules.push({ action: 'create', subject: 'Claim', conditions: { createdBy: userId } })
  rules.push({ action: 'read', subject: 'Claim', conditions: { createdBy: userId } })
  rules.push({ action: 'update', subject: 'Claim', conditions: { createdBy: userId } })
  rules.push({ action: 'delete', subject: 'Claim', conditions: { createdBy: userId } })
  rules.push({ action: 'create', subject: 'Persona', conditions: { userId } })
  rules.push({ action: 'read', subject: 'Persona', conditions: { userId } })
  rules.push({ action: 'update', subject: 'Persona', conditions: { userId } })
  rules.push({ action: 'delete', subject: 'Persona', conditions: { userId } })
  rules.push({ action: 'create', subject: 'WorldState', conditions: { userId } })
  rules.push({ action: 'read', subject: 'WorldState', conditions: { userId } })
  rules.push({ action: 'update', subject: 'WorldState', conditions: { userId } })
  rules.push({ action: 'delete', subject: 'WorldState', conditions: { userId } })

  // Layers-shaped store: every user can always CRUD the layers content they
  // own, mirroring the Annotation baseline. Each of these models carries a
  // createdByUserId column, so the ownership condition resolves against real
  // Prisma rows both in accessibleBy() WHERE clauses and in single-row
  // ability.can() checks. Tokenization and CorpusMembership are intentionally
  // excluded — they hold no scope column and are authorized through their
  // parent (the tokenization's expression, the membership's corpus).
  const layersOwnedSubjects: SubjectName[] = [
    'Media', 'Expression', 'Segmentation', 'AnnotationLayer', 'LayersAnnotation',
    'TextAnnotationRelation', 'GraphNode', 'GraphEdge', 'LayersOntology',
    'TypeDef', 'Corpus', 'ClusterSet', 'Alignment',
  ]
  for (const layerSubject of layersOwnedSubjects) {
    rules.push({ action: 'create', subject: layerSubject, conditions: { createdByUserId: userId } })
    rules.push({ action: 'read', subject: layerSubject, conditions: { createdByUserId: userId } })
    rules.push({ action: 'update', subject: layerSubject, conditions: { createdByUserId: userId } })
    rules.push({ action: 'delete', subject: layerSubject, conditions: { createdByUserId: userId } })
  }

  // Projects: every user can fully manage projects they personally own
  // (ownerUserId === userId). The create baseline is load-bearing — personal
  // project creation has no pre-existing project_memberships row to authorize
  // against, so without it a user could never create their own project; the
  // route sets the candidate's ownerUserId to request.user.id, so the rule
  // matches a personal project and an attempt to forge ownerUserId=otherUser
  // fails. Group-owned projects (ownerUserId === null) are governed entirely
  // by membership and the group-scoped create rule above.
  rules.push({ action: 'create', subject: 'Project', conditions: { ownerUserId: userId } })
  rules.push({ action: 'read', subject: 'Project', conditions: { ownerUserId: userId } })
  rules.push({ action: 'update', subject: 'Project', conditions: { ownerUserId: userId } })
  rules.push({ action: 'delete', subject: 'Project', conditions: { ownerUserId: userId } })
  rules.push({ action: 'manage_members', subject: 'Project', conditions: { ownerUserId: userId } })

  // All authenticated users can read videos (filtered by VideoAccessService)
  rules.push({ action: 'read', subject: 'Video' })

  return createPrismaAbility(rules)
}

/**
 * Maps a RolePermission resourceType string to the corresponding Prisma
 * model name. Returns null for unmapped types.
 */
function mapResourceTypeToModelName(resourceType: string): Prisma.ModelName | null {
  const map: Record<string, Prisma.ModelName> = {
    annotation: 'Annotation',
    claim: 'Claim',
    persona: 'Persona',
    world_state: 'WorldState',
    video: 'Video',
    summary: 'VideoSummary',
    project: 'Project',
    group: 'UserGroup',
    user: 'User',
    // Layers-shaped annotation store.
    media: 'Media',
    expression: 'Expression',
    segmentation: 'Segmentation',
    tokenization: 'Tokenization',
    annotation_layer: 'AnnotationLayer',
    layers_annotation: 'LayersAnnotation',
    text_annotation_relation: 'TextAnnotationRelation',
    graph_node: 'GraphNode',
    graph_edge: 'GraphEdge',
    layers_ontology: 'LayersOntology',
    type_def: 'TypeDef',
    corpus: 'Corpus',
    corpus_membership: 'CorpusMembership',
    cluster_set: 'ClusterSet',
    alignment: 'Alignment',
  }
  return map[resourceType] ?? null
}

/**
 * Serializes a CASL ability instance to a plain array of rules suitable for
 * transmission to the frontend.
 */
export function serializeAbilities(ability: AppAbility): object[] {
  return ability.rules
}
