/**
 * TanStack Query hooks for video assignment operations.
 *
 * Provides hooks for assigning and unassigning videos to projects,
 * and for managing automatic assignment rules (admin).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectKeys } from './useProjects'

/** Query key factory for video assignments. */
export const videoAssignmentKeys = {
  all: ['video-assignments'] as const,
  projectVideos: (projectId: string) => [...videoAssignmentKeys.all, 'project', projectId] as const,
  rules: () => [...videoAssignmentKeys.all, 'rules'] as const,
  rule: (ruleId: string) => [...videoAssignmentKeys.all, 'rule', ruleId] as const,
}

// ============= Fetch Functions =============

async function fetchProjectVideos(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/videos`, { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch project videos')
  }
  return response.json()
}

async function fetchAssignmentRules() {
  const response = await fetch('/api/admin/video-assignments/rules', { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch assignment rules')
  }
  return response.json()
}

// ============= Query Hooks =============

/**
 * Hook to fetch videos assigned to a project.
 *
 * @param projectId - the project ID whose videos to fetch
 * @returns TanStack Query result with project videos array
 *
 * @example
 * ```typescript
 * const { data: videos, isLoading } = useProjectVideos(projectId)
 * ```
 */
export function useProjectVideos(projectId: string | undefined) {
  return useQuery({
    queryKey: videoAssignmentKeys.projectVideos(projectId || ''),
    queryFn: () => fetchProjectVideos(projectId!),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

/**
 * Hook to fetch all video assignment rules (admin).
 *
 * @returns TanStack Query result with assignment rules array
 */
export function useAssignmentRules() {
  return useQuery({
    queryKey: videoAssignmentKeys.rules(),
    queryFn: fetchAssignmentRules,
    staleTime: 2 * 60 * 1000,
  })
}

// ============= Mutation Hooks =============

/**
 * Hook to assign a video to a project.
 * Invalidates the project videos cache on success.
 *
 * @example
 * ```typescript
 * const { mutate: assign } = useAssignVideo()
 * assign({ projectId, videoId })
 * ```
 */
export function useAssignVideo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, videoId }: { projectId: string; videoId: string }) => {
      const response = await fetch(`/api/projects/${projectId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoId }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to assign video')
      }
      return response.json()
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: videoAssignmentKeys.projectVideos(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
    },
  })
}

/**
 * Hook to unassign a video from a project.
 * Invalidates the project videos cache on success.
 */
export function useUnassignVideo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, videoId }: { projectId: string; videoId: string }) => {
      const response = await fetch(`/api/projects/${projectId}/videos/${videoId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to unassign video')
      }
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: videoAssignmentKeys.projectVideos(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
    },
  })
}

/**
 * Hook to create a new video assignment rule (admin).
 * Invalidates the rules cache on success.
 */
export function useCreateAssignmentRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; criteria: Record<string, unknown>; projectId: string }) => {
      const response = await fetch('/api/admin/video-assignments/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to create assignment rule')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: videoAssignmentKeys.rules() })
    },
  })
}

/**
 * Hook to update a video assignment rule (admin).
 * Invalidates the rules cache on success.
 */
export function useUpdateAssignmentRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ruleId, data }: { ruleId: string; data: { name?: string; criteria?: Record<string, unknown>; projectId?: string } }) => {
      const response = await fetch(`/api/admin/video-assignments/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to update assignment rule')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: videoAssignmentKeys.rules() })
    },
  })
}

/**
 * Hook to delete a video assignment rule (admin).
 * Invalidates the rules cache on success.
 */
export function useDeleteAssignmentRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const response = await fetch(`/api/admin/video-assignments/rules/${ruleId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete assignment rule')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: videoAssignmentKeys.rules() })
    },
  })
}

/**
 * Hook to evaluate a single assignment rule against all videos (admin).
 * Returns the list of videos that match the rule criteria.
 */
export function useEvaluateRule() {
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const response = await fetch(`/api/admin/video-assignments/rules/${ruleId}/evaluate`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to evaluate rule')
      }
      return response.json()
    },
  })
}

/**
 * Hook to evaluate all assignment rules (admin).
 * Returns a summary of how many videos each rule matches.
 */
export function useEvaluateAllRules() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/video-assignments/rules/evaluate-all', {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to evaluate all rules')
      }
      return response.json()
    },
  })
}
