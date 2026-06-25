import { describe, it, expect } from 'vitest'
import { subject } from '@casl/ability'
import {
  defineAbilitiesFor,
  type UserRoles,
  type RolePermissionRow,
} from '../../src/lib/abilities.js'

/**
 * A project member reads project content through the project-scoped CASL rule
 * (`{ projectId: { in: [...] } }`), not through ownership. A VideoSummary born
 * with `projectId = NULL` is therefore invisible to every project collaborator
 * except its own creator — which is exactly the failure caused by omitting
 * `projectId` when persisting a summary. These tests pin that invariant at the
 * authorization layer so a regression in projectId stamping is caught even
 * without a database.
 */
describe('project-scoped summary read depends on a stamped projectId', () => {
  const PROJECT = 'project-1'
  const permissions: RolePermissionRow[] = [
    { scope: 'project', role: 'annotator', resourceType: 'summary', action: 'read', ownOnly: false },
  ]
  const memberRoles: UserRoles = {
    systemRole: 'user',
    groupRoles: [],
    projectRoles: [{ projectId: PROJECT, role: 'annotator' }],
  }

  it('lets a collaborator read a summary stamped with their project', () => {
    const collaborator = defineAbilitiesFor('user-b', memberRoles, permissions)
    expect(
      collaborator.can('read', subject('VideoSummary', { projectId: PROJECT, createdBy: 'user-a' })),
    ).toBe(true)
  })

  it('hides a NULL-projectId summary from a project collaborator (the bug)', () => {
    const collaborator = defineAbilitiesFor('user-b', memberRoles, permissions)
    expect(
      collaborator.can('read', subject('VideoSummary', { projectId: null, createdBy: 'user-a' })),
    ).toBe(false)
  })

  it('still lets the creator read their own NULL-projectId summary (why the creator is not blocked)', () => {
    const creator = defineAbilitiesFor('user-a', memberRoles, permissions)
    expect(
      creator.can('read', subject('VideoSummary', { projectId: null, createdBy: 'user-a' })),
    ).toBe(true)
  })
})
