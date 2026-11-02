/**
 * Seeds the RolePermission table with the default permission matrix.
 *
 * Defines which actions each role can perform on each resource type across
 * system, group, and project scopes. Uses upsert to safely re-run without
 * creating duplicates.
 *
 * Can be run standalone via `tsx prisma/seed-permissions.ts` or imported
 * and called from the main seed script.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface Permission {
  scope: string
  role: string
  resourceType: string
  action: string
  ownOnly: boolean
}

/**
 * Resource types of the layers-shaped annotation store, governed by the same
 * project-role matrix as the legacy content types. Tokenization scopes through
 * its parent expression but is still seeded so a project role that can read the
 * expression can read its tokenizations; corpus_membership is intentionally
 * omitted (it is authorized entirely through its parent corpus).
 */
const LAYERS_CONTENT_TYPES = [
  'media',
  'expression',
  'segmentation',
  'tokenization',
  'annotation_layer',
  'layers_annotation',
  'text_annotation_relation',
  'graph_node',
  'graph_edge',
  'layers_ontology',
  'type_def',
  'corpus',
  'cluster_set',
  'alignment',
]

/**
 * Generates CRUD + share + export permissions for a project-level role
 * across all content resource types.
 *
 * @param role - project role identifier (e.g., "annotator", "project_owner")
 * @param ownOnly - when true, write actions are restricted to own resources
 * @returns array of Permission objects for the role
 */
function generateProjectRolePermissions(role: string, ownOnly: boolean): Permission[] {
  const contentTypes = ['annotation', 'summary', 'claim', 'persona', 'world_state', ...LAYERS_CONTENT_TYPES]
  const actions = ['create', 'read', 'update', 'delete']

  return contentTypes.flatMap(rt =>
    actions.map(action => ({
      scope: 'project',
      role,
      resourceType: rt,
      action,
      // read is never restricted to own resources
      ownOnly: action === 'read' ? false : ownOnly,
    })),
  ).concat(
    // Add share and export actions
    contentTypes.map(rt => ({ scope: 'project', role, resourceType: rt, action: 'share', ownOnly })),
    contentTypes.map(rt => ({ scope: 'project', role, resourceType: rt, action: 'export', ownOnly })),
  )
}

const permissions: Permission[] = [
  // =========================================================================
  // Project Owner: full access to project resources and project management
  // =========================================================================
  ...generateProjectRolePermissions('project_owner', false),
  { scope: 'project', role: 'project_owner', resourceType: 'project', action: 'update', ownOnly: false },
  { scope: 'project', role: 'project_owner', resourceType: 'project', action: 'delete', ownOnly: false },
  { scope: 'project', role: 'project_owner', resourceType: 'project', action: 'manage_members', ownOnly: false },

  // =========================================================================
  // Project Manager: full content access, limited project admin
  // =========================================================================
  ...generateProjectRolePermissions('project_manager', false),
  { scope: 'project', role: 'project_manager', resourceType: 'project', action: 'read', ownOnly: false },
  { scope: 'project', role: 'project_manager', resourceType: 'project', action: 'update', ownOnly: false },
  { scope: 'project', role: 'project_manager', resourceType: 'project', action: 'manage_members', ownOnly: false },

  // =========================================================================
  // Annotator: CRUD own resources, read all content within project
  // =========================================================================
  ...generateProjectRolePermissions('annotator', true),
  { scope: 'project', role: 'annotator', resourceType: 'video', action: 'read', ownOnly: false },
  { scope: 'project', role: 'annotator', resourceType: 'project', action: 'read', ownOnly: false },

  // =========================================================================
  // Reviewer: read all content + review action on annotations/summaries/claims
  // =========================================================================
  ...['annotation', 'summary', 'claim', 'persona', 'world_state', 'video', ...LAYERS_CONTENT_TYPES].map(rt => ({
    scope: 'project', role: 'reviewer', resourceType: rt, action: 'read', ownOnly: false,
  })),
  ...['annotation', 'summary', 'claim'].map(rt => ({
    scope: 'project', role: 'reviewer', resourceType: rt, action: 'review', ownOnly: false,
  })),
  { scope: 'project', role: 'reviewer', resourceType: 'project', action: 'read', ownOnly: false },
  { scope: 'project', role: 'reviewer', resourceType: 'summary', action: 'export', ownOnly: false },

  // =========================================================================
  // Viewer: read-only access to all project content
  // =========================================================================
  ...['annotation', 'summary', 'claim', 'persona', 'world_state', 'video', ...LAYERS_CONTENT_TYPES].map(rt => ({
    scope: 'project', role: 'viewer', resourceType: rt, action: 'read', ownOnly: false,
  })),
  { scope: 'project', role: 'viewer', resourceType: 'project', action: 'read', ownOnly: false },

  // =========================================================================
  // Group Owner: full group management + project creation
  // =========================================================================
  { scope: 'group', role: 'group_owner', resourceType: 'group', action: 'update', ownOnly: false },
  { scope: 'group', role: 'group_owner', resourceType: 'group', action: 'delete', ownOnly: false },
  { scope: 'group', role: 'group_owner', resourceType: 'group', action: 'manage_members', ownOnly: false },
  { scope: 'group', role: 'group_owner', resourceType: 'project', action: 'create', ownOnly: false },

  // =========================================================================
  // Group Admin: manage group members + create projects
  // =========================================================================
  { scope: 'group', role: 'group_admin', resourceType: 'group', action: 'update', ownOnly: false },
  { scope: 'group', role: 'group_admin', resourceType: 'group', action: 'manage_members', ownOnly: false },
  { scope: 'group', role: 'group_admin', resourceType: 'project', action: 'create', ownOnly: false },

  // =========================================================================
  // Group Member: read-only access to group info
  // =========================================================================
  { scope: 'group', role: 'group_member', resourceType: 'group', action: 'read', ownOnly: false },
]

/**
 * Seeds all role permissions into the database using upsert.
 *
 * @param prismaClient - optional Prisma client instance (for testing)
 * @returns number of permissions seeded
 */
export async function seedPermissions(prismaClient?: PrismaClient): Promise<number> {
  const client = prismaClient || prisma

  let count = 0
  for (const perm of permissions) {
    await client.rolePermission.upsert({
      where: {
        scope_role_resourceType_action: {
          scope: perm.scope,
          role: perm.role,
          resourceType: perm.resourceType,
          action: perm.action,
        },
      },
      update: { ownOnly: perm.ownOnly },
      create: perm,
    })
    count++
  }
  return count
}

// Run directly if called as a script
if (process.argv[1]?.endsWith('seed-permissions.ts') || process.argv[1]?.endsWith('seed-permissions.js')) {
  seedPermissions()
    .then(count => {
      console.log(`Seeded ${count} role permissions`)
      process.exit(0)
    })
    .catch(err => {
      console.error('Failed to seed permissions:', err)
      process.exit(1)
    })
}
