/**
 * TanStack Query hooks for admin user management operations.
 * Provides declarative data fetching with automatic caching and refetching.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query'
import { User } from '../../models/types.js'

/**
 * API error response.
 */
export interface ApiError {
  message: string
  statusCode?: number
}

/**
 * Request type for creating a user.
 */
export interface CreateUserRequest {
  username: string
  password: string
  displayName: string
  email?: string
  isAdmin: boolean
}

/**
 * Request type for updating a user.
 */
export interface UpdateUserRequest {
  displayName?: string
  email?: string
  isAdmin?: boolean
  password?: string
}

/**
 * User with additional statistics.
 */
export interface UserWithStats extends User {
  personaCount?: number
  sessionCount?: number
}

/**
 * Query key factory for users.
 * Provides consistent cache keys across the application.
 */
export const userKeys = {
  all: ['admin', 'users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: () => [...userKeys.lists()] as const,
  detail: (userId: string) => [...userKeys.all, userId] as const,
}

/**
 * Fetch all users.
 * Data is cached and automatically refetched when stale.
 *
 * @param options - TanStack Query options
 * @returns Query result with users data
 */
export function useUsers(
  options?: Omit<UseQueryOptions<UserWithStats[], ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<UserWithStats[], ApiError>({
    queryKey: userKeys.list(),
    queryFn: async () => {
      const response = await fetch('/api/admin/users', { credentials: 'include' })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to fetch users', statusCode: response.status }
      }
      return response.json()
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  })
}

/**
 * Fetch a specific user by ID.
 *
 * @param userId - User identifier
 * @param options - TanStack Query options
 * @returns Query result with user data
 */
export function useUser(
  userId: string,
  options?: Omit<UseQueryOptions<UserWithStats, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<UserWithStats, ApiError>({
    queryKey: userKeys.detail(userId),
    queryFn: async () => {
      const response = await fetch(`/api/admin/users/${userId}`, { credentials: 'include' })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to fetch user', statusCode: response.status }
      }
      return response.json()
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  })
}

/**
 * Mutation hook for creating a user.
 * Invalidates user list queries on success.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with create function
 */
export function useCreateUser(
  options?: UseMutationOptions<User, ApiError, CreateUserRequest>
) {
  const queryClient = useQueryClient()

  return useMutation<User, ApiError, CreateUserRequest>({
    mutationFn: async (request) => {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to create user', statusCode: response.status }
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
    },
    ...options,
  })
}

/**
 * Mutation hook for updating a user.
 * Invalidates user queries on success.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with update function
 */
export function useUpdateUser(
  options?: UseMutationOptions<User, ApiError, { userId: string; data: UpdateUserRequest }>
) {
  const queryClient = useQueryClient()

  return useMutation<User, ApiError, { userId: string; data: UpdateUserRequest }>({
    mutationFn: async ({ userId, data }) => {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to update user', statusCode: response.status }
      }
      return response.json()
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(userKeys.detail(variables.userId), data)
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
    },
    ...options,
  })
}

/**
 * Mutation hook for deleting a user.
 * Removes user from cache on success.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with delete function
 */
export function useDeleteUser(
  options?: UseMutationOptions<void, ApiError, string>
) {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: async (userId) => {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to delete user', statusCode: response.status }
      }
    },
    onSuccess: (_, userId) => {
      queryClient.removeQueries({ queryKey: userKeys.detail(userId) })
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
    },
    ...options,
  })
}
