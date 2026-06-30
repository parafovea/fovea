/**
 * TanStack Query hooks for project operations.
 *
 * Provides hooks for listing, creating, updating, and deleting projects,
 * as well as managing project membership and personas.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { abilityKeys } from './useAbilities'

/** Query key factory for projects. */
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (scope?: string) => [...projectKeys.lists(), { scope }] as const,
  detail: (projectId: string) => [...projectKeys.all, 'detail', projectId] as const,
  members: (projectId: string) => [...projectKeys.all, 'members', projectId] as const,
  personas: (projectId: string) => [...projectKeys.all, 'personas', projectId] as const,
  assignableUsers: (projectId: string) => [...projectKeys.all, 'assignable-users', projectId] as const,
}

/** Summary of a project as returned by the list endpoint. */
export interface ProjectSummary {
  id: string
  name: string
  slug: string
  description: string | null
  ownerUserId: string | null
  ownerGroupId: string | null
  isArchived: boolean
  _count: { members: number }
  myRole: string | null
  createdAt: string
}

/** Full project detail as returned by GET /api/projects/:projectId. */
export interface ProjectDetail {
  id: string
  name: string
  slug: string
  description: string | null
  ownerUserId: string | null
  ownerGroupId: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
  members?: ProjectMember[]
  videoAssignmentCount?: number
}

/** A project membership record. */
export interface ProjectMember {
  id: string
  userId: string
  role: string
  joinedAt: string
  user?: { displayName: string | null }
}

/** A persona assigned to a project. */
export interface ProjectPersona {
  id: string
  name: string
  role: string
}

/** A user who can be added as a project member (not already a member). */
export interface AssignableUser {
  id: string
  username: string
  displayName: string
  email: string | null
}

// ============= Fetch Functions =============

async function fetchMyProjects(scope?: string): Promise<ProjectSummary[]> {
  const url = scope ? `/api/projects?scope=${encodeURIComponent(scope)}` : '/api/projects'
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch projects')
  }
  return response.json()
}

async function fetchProject(projectId: string): Promise<ProjectDetail> {
  const response = await fetch(`/api/projects/${projectId}`, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch project')
  }
  return response.json()
}

async function fetchProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const response = await fetch(`/api/projects/${projectId}/members`, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch project members')
  }
  return response.json()
}

async function fetchProjectPersonas(projectId: string): Promise<ProjectPersona[]> {
  const response = await fetch(`/api/projects/${projectId}/personas`, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch project personas')
  }
  return response.json()
}

async function fetchAssignableUsers(projectId: string): Promise<AssignableUser[]> {
  const response = await fetch(`/api/projects/${projectId}/assignable-users`, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch assignable users')
  }
  return response.json()
}

// ============= Query Hooks =============

/**
 * Hook to fetch projects the current user has access to.
 *
 * @param scope - optional scope filter (e.g., 'owned', 'shared')
 * @returns TanStack Query result with projects array
 *
 * @example
 * ```typescript
 * const { data: projects, isLoading } = useMyProjects()
 * const { data: ownedProjects } = useMyProjects('owned')
 * ```
 */
export function useMyProjects(scope?: string) {
  return useQuery({
    queryKey: projectKeys.list(scope),
    queryFn: () => fetchMyProjects(scope),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

/**
 * Hook to fetch a single project by ID.
 *
 * @param projectId - the project ID to fetch
 * @returns TanStack Query result with project data
 */
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(projectId || ''),
    queryFn: () => fetchProject(projectId!),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * Hook to fetch the members of a project.
 *
 * @param projectId - the project ID whose members to fetch
 * @returns TanStack Query result with members array
 */
export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.members(projectId || ''),
    queryFn: () => fetchProjectMembers(projectId!),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * Hook to fetch the personas associated with a project.
 *
 * @param projectId - the project ID whose personas to fetch
 * @returns TanStack Query result with personas array
 */
export function useProjectPersonas(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.personas(projectId || ''),
    queryFn: () => fetchProjectPersonas(projectId!),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * Hook to fetch the users who can be added as members of a project (those not
 * already members). Authorized for project owners, managers, and system
 * admins; non-managers receive a 403 and an empty result.
 *
 * @param projectId - the project ID whose assignable users to fetch
 * @returns TanStack Query result with the assignable users array
 */
export function useAssignableUsers(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.assignableUsers(projectId || ''),
    queryFn: () => fetchAssignableUsers(projectId!),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  })
}

// ============= Mutation Hooks =============

/**
 * Hook to create a new project.
 * Invalidates the projects list cache on success.
 *
 * @example
 * ```typescript
 * const { mutate: createProject } = useCreateProject()
 * createProject({ name: 'Gesture Study', description: 'Analysis of hand gestures' })
 * ```
 */
export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; slug?: string; description?: string; ownerGroupId?: string }) => {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to create project')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
    },
  })
}

/**
 * Hook to update a project.
 * Invalidates the project detail and list cache on success.
 */
export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: string; data: { name?: string; description?: string; isArchived?: boolean } }) => {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to update project')
      }
      return response.json()
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
    },
  })
}

/**
 * Hook to delete a project.
 * Removes the project from cache and invalidates the list on success.
 */
export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete project')
      }
    },
    onSuccess: (_, projectId) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) })
      queryClient.removeQueries({ queryKey: projectKeys.members(projectId) })
      queryClient.removeQueries({ queryKey: projectKeys.personas(projectId) })
      queryClient.removeQueries({ queryKey: projectKeys.assignableUsers(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
    },
  })
}

/**
 * Hook to add a member to a project.
 * Invalidates the project detail and members cache on success.
 */
export function useAddProjectMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, userId, role }: { projectId: string; userId: string; role: string }) => {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, role }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to add project member')
      }
      return response.json()
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) })
      // Membership/role changes alter the caller's own permissions; refresh the
      // client ability mirror so the UI reflects them without a staleTime lag.
      queryClient.invalidateQueries({ queryKey: abilityKeys.all })
      queryClient.invalidateQueries({ queryKey: projectKeys.assignableUsers(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
    },
  })
}

/**
 * Hook to update a project member's role.
 * Invalidates the project detail and members cache on success.
 */
export function useUpdateProjectMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, userId, role }: { projectId: string; userId: string; role: string }) => {
      const response = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to update project member')
      }
      return response.json()
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) })
      // The list carries each project's `myRole`, which a self-role change makes
      // stale; refresh it (the add/remove paths already do).
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
      // Membership/role changes alter the caller's own permissions; refresh the
      // client ability mirror so the UI reflects them without a staleTime lag.
      queryClient.invalidateQueries({ queryKey: abilityKeys.all })
    },
  })
}

/**
 * Hook to remove a member from a project.
 * Invalidates the project detail, members, and list cache on success.
 */
export function useRemoveProjectMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, userId }: { projectId: string; userId: string }) => {
      const response = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to remove project member')
      }
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) })
      // Membership/role changes alter the caller's own permissions; refresh the
      // client ability mirror so the UI reflects them without a staleTime lag.
      queryClient.invalidateQueries({ queryKey: abilityKeys.all })
      queryClient.invalidateQueries({ queryKey: projectKeys.assignableUsers(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
    },
  })
}
