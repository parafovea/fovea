/**
 * TanStack Query hooks for user group operations.
 *
 * Provides hooks for listing, creating, updating, and deleting groups,
 * as well as managing group membership.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { abilityKeys } from './useAbilities'

/** Summary of a group as returned by the list endpoint. */
export interface GroupSummary {
  id: string
  name: string
  slug: string
  description: string | null
  memberCount: number
  userRole: string
  createdAt: string
}

/** Full group detail as returned by the detail endpoint. */
export interface GroupDetail {
  id: string
  name: string
  slug: string
  description: string | null
  createdAt: string
  updatedAt: string
}

/** A group membership record. */
export interface GroupMember {
  id: string
  userId: string
  role: string
  joinedAt: string
  user?: { displayName: string | null }
}

/** Query key factory for groups. */
export const groupKeys = {
  all: ['groups'] as const,
  lists: () => [...groupKeys.all, 'list'] as const,
  detail: (groupId: string) => [...groupKeys.all, 'detail', groupId] as const,
  members: (groupId: string) => [...groupKeys.all, 'members', groupId] as const,
}

// ============= Fetch Functions =============

async function fetchMyGroups(): Promise<GroupSummary[]> {
  const response = await fetch('/api/groups', { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch groups')
  }
  return response.json()
}

async function fetchGroup(groupId: string): Promise<GroupDetail> {
  const response = await fetch(`/api/groups/${groupId}`, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch group')
  }
  return response.json()
}

async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const response = await fetch(`/api/groups/${groupId}/members`, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch group members')
  }
  return response.json()
}

// ============= Query Hooks =============

/**
 * Hook to fetch all groups the current user belongs to.
 *
 * @returns TanStack Query result with groups array (includes memberCount and role)
 *
 * @example
 * ```typescript
 * const { data: groups, isLoading } = useMyGroups()
 * ```
 */
export function useMyGroups() {
  return useQuery({
    queryKey: groupKeys.lists(),
    queryFn: fetchMyGroups,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

/**
 * Hook to fetch a single group by ID, including its members.
 *
 * @param groupId - the group ID to fetch
 * @returns TanStack Query result with group data
 */
export function useGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: groupKeys.detail(groupId || ''),
    queryFn: () => fetchGroup(groupId!),
    enabled: !!groupId,
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * Hook to fetch the members of a group.
 *
 * @param groupId - the group ID whose members to fetch
 * @returns TanStack Query result with members array
 */
export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: groupKeys.members(groupId || ''),
    queryFn: () => fetchGroupMembers(groupId!),
    enabled: !!groupId,
    staleTime: 2 * 60 * 1000,
  })
}

// ============= Mutation Hooks =============

/**
 * Hook to create a new group.
 * Invalidates the groups list cache on success.
 *
 * @example
 * ```typescript
 * const { mutate: createGroup } = useCreateGroup()
 * createGroup({ name: 'Annotators', description: 'Main annotation team' })
 * ```
 */
export function useCreateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; slug?: string; description?: string }) => {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to create group')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.lists() })
    },
  })
}

/**
 * Hook to update a group.
 * Invalidates both the group detail and the groups list cache on success.
 */
export function useUpdateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, data }: { groupId: string; data: { name?: string; description?: string } }) => {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to update group')
      }
      return response.json()
    },
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
      queryClient.invalidateQueries({ queryKey: groupKeys.lists() })
    },
  })
}

/**
 * Hook to delete a group.
 * Removes the group from cache and invalidates the list on success.
 */
export function useDeleteGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (groupId: string) => {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete group')
      }
    },
    onSuccess: (_, groupId) => {
      queryClient.removeQueries({ queryKey: groupKeys.detail(groupId) })
      queryClient.removeQueries({ queryKey: groupKeys.members(groupId) })
      queryClient.invalidateQueries({ queryKey: groupKeys.lists() })
    },
  })
}

/**
 * Hook to add a member to a group.
 * Invalidates the group detail and members cache on success.
 */
export function useAddGroupMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, userId, role }: { groupId: string; userId: string; role: string }) => {
      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, role }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to add group member')
      }
      return response.json()
    },
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
      queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) })
      // Membership/role changes alter the caller's own permissions; refresh the
      // client ability mirror so the UI reflects them without a staleTime lag.
      queryClient.invalidateQueries({ queryKey: abilityKeys.all })
      queryClient.invalidateQueries({ queryKey: groupKeys.lists() })
    },
  })
}

/**
 * Hook to update a group member's role.
 * Invalidates the group detail and members cache on success.
 */
export function useUpdateGroupMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, userId, role }: { groupId: string; userId: string; role: string }) => {
      const response = await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to update group member')
      }
      return response.json()
    },
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
      queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) })
      // Membership/role changes alter the caller's own permissions; refresh the
      // client ability mirror so the UI reflects them without a staleTime lag.
      queryClient.invalidateQueries({ queryKey: abilityKeys.all })
    },
  })
}

/**
 * Hook to remove a member from a group.
 * Invalidates the group detail, members, and list cache on success.
 */
export function useRemoveGroupMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const response = await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to remove group member')
      }
    },
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
      queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) })
      // Membership/role changes alter the caller's own permissions; refresh the
      // client ability mirror so the UI reflects them without a staleTime lag.
      queryClient.invalidateQueries({ queryKey: abilityKeys.all })
      queryClient.invalidateQueries({ queryKey: groupKeys.lists() })
    },
  })
}
