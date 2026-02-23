import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VideoAccessService } from '../../src/services/video-access-service.js'

// Mock OpenTelemetry tracer
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startSpan: () => ({
        setAttribute: vi.fn(),
        end: vi.fn(),
      }),
    }),
  },
}))

/**
 * Creates a mock PrismaClient with the subset of models used by VideoAccessService.
 */
function createMockPrisma() {
  return {
    groupMembership: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    projectMembership: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    project: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    projectVideoAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    video: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any
}

describe('VideoAccessService', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>
  let service: VideoAccessService

  beforeEach(() => {
    mockPrisma = createMockPrisma()
    service = new VideoAccessService(mockPrisma)
  })

  it('returns "all" for system_admin', async () => {
    const result = await service.getAccessibleVideoIds('admin-1', 'system_admin')

    expect(result).toBe('all')
    // Should not query any database tables
    expect(mockPrisma.groupMembership.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.projectMembership.findMany).not.toHaveBeenCalled()
  })

  it('returns global videos for user with no memberships', async () => {
    // No group memberships, no project memberships
    mockPrisma.groupMembership.findMany.mockResolvedValue([])
    mockPrisma.projectMembership.findMany.mockResolvedValue([])

    // No project video assignments at all (step 5: distinct query returns empty)
    mockPrisma.projectVideoAssignment.findMany
      .mockResolvedValueOnce([]) // step 4: user direct assignments
      .mockResolvedValueOnce([]) // step 5: all assigned video IDs (distinct)

    // Global videos (not assigned to any project)
    mockPrisma.video.findMany.mockResolvedValue([
      { id: 'v-global-1' },
      { id: 'v-global-2' },
    ])

    const result = await service.getAccessibleVideoIds('user-1', 'user')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toContain('v-global-1')
    expect(result).toContain('v-global-2')
  })

  it('returns project-assigned videos plus global videos', async () => {
    // User is a member of one project
    mockPrisma.groupMembership.findMany.mockResolvedValue([])
    mockPrisma.projectMembership.findMany.mockResolvedValue([
      { projectId: 'proj-1' },
    ])

    // No group-owned projects
    mockPrisma.project.findMany.mockResolvedValue([])

    // Step 4: project video assignments
    mockPrisma.projectVideoAssignment.findMany
      .mockResolvedValueOnce([{ videoId: 'v-assigned' }])
      // Step 5: all assigned video IDs
      .mockResolvedValueOnce([{ videoId: 'v-assigned' }])

    // Global videos (not assigned to any project)
    mockPrisma.video.findMany.mockResolvedValue([{ id: 'v-global' }])

    const result = await service.getAccessibleVideoIds('user-1', 'user')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toContain('v-assigned')
    expect(result).toContain('v-global')
  })

  it('deduplicates video IDs', async () => {
    mockPrisma.groupMembership.findMany.mockResolvedValue([])
    mockPrisma.projectMembership.findMany.mockResolvedValue([
      { projectId: 'proj-1' },
    ])
    mockPrisma.project.findMany.mockResolvedValue([])

    // Duplicate video IDs from assignments
    mockPrisma.projectVideoAssignment.findMany
      .mockResolvedValueOnce([
        { videoId: 'v1' },
        { videoId: 'v1' },
        { videoId: 'v2' },
      ])
      .mockResolvedValueOnce([
        { videoId: 'v1' },
        { videoId: 'v2' },
      ])

    // v1 also appears as a global video
    mockPrisma.video.findMany.mockResolvedValue([])

    const result = await service.getAccessibleVideoIds('user-1', 'user')

    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      const uniqueIds = [...new Set(result)]
      expect(result.length).toBe(uniqueIds.length)
    }
  })

  it('includes group-owned project videos', async () => {
    // User is a member of a group
    mockPrisma.groupMembership.findMany.mockResolvedValue([
      { groupId: 'grp-1' },
    ])

    // No direct project memberships
    mockPrisma.projectMembership.findMany.mockResolvedValue([])

    // The group owns a project
    mockPrisma.project.findMany.mockResolvedValue([
      { id: 'grp-proj-1' },
    ])

    // Videos assigned to the group's project
    mockPrisma.projectVideoAssignment.findMany
      .mockResolvedValueOnce([{ videoId: 'v-grp' }])
      .mockResolvedValueOnce([{ videoId: 'v-grp' }])

    mockPrisma.video.findMany.mockResolvedValue([])

    const result = await service.getAccessibleVideoIds('user-1', 'user')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toContain('v-grp')
  })

  it('combines direct project, group project, and global videos', async () => {
    // User is in a group and has direct project membership
    mockPrisma.groupMembership.findMany.mockResolvedValue([
      { groupId: 'grp-1' },
    ])
    mockPrisma.projectMembership.findMany.mockResolvedValue([
      { projectId: 'direct-proj' },
    ])

    // Group owns another project
    mockPrisma.project.findMany.mockResolvedValue([
      { id: 'grp-proj' },
    ])

    // Videos from both projects
    mockPrisma.projectVideoAssignment.findMany
      .mockResolvedValueOnce([
        { videoId: 'v-direct' },
        { videoId: 'v-grp' },
      ])
      .mockResolvedValueOnce([
        { videoId: 'v-direct' },
        { videoId: 'v-grp' },
        { videoId: 'v-other' },
      ])

    // Global videos (not assigned to any project)
    mockPrisma.video.findMany.mockResolvedValue([{ id: 'v-global' }])

    const result = await service.getAccessibleVideoIds('user-1', 'user')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toContain('v-direct')
    expect(result).toContain('v-grp')
    expect(result).toContain('v-global')
    // v-other is assigned to a project the user is not in, so it should not appear
    expect(result).not.toContain('v-other')
  })

  it('returns empty array when user has no access and no global videos', async () => {
    mockPrisma.groupMembership.findMany.mockResolvedValue([])
    mockPrisma.projectMembership.findMany.mockResolvedValue([])

    mockPrisma.projectVideoAssignment.findMany
      .mockResolvedValueOnce([]) // user's direct assignments
      .mockResolvedValueOnce([{ videoId: 'v-assigned-elsewhere' }]) // all assigned

    // No global videos (all videos are assigned to projects)
    mockPrisma.video.findMany.mockResolvedValue([])

    const result = await service.getAccessibleVideoIds('user-1', 'user')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual([])
  })

  it('handles user with multiple group memberships', async () => {
    mockPrisma.groupMembership.findMany.mockResolvedValue([
      { groupId: 'grp-1' },
      { groupId: 'grp-2' },
    ])
    mockPrisma.projectMembership.findMany.mockResolvedValue([])

    // Both groups own projects
    mockPrisma.project.findMany.mockResolvedValue([
      { id: 'proj-from-grp1' },
      { id: 'proj-from-grp2' },
    ])

    mockPrisma.projectVideoAssignment.findMany
      .mockResolvedValueOnce([
        { videoId: 'v-1' },
        { videoId: 'v-2' },
      ])
      .mockResolvedValueOnce([
        { videoId: 'v-1' },
        { videoId: 'v-2' },
      ])

    mockPrisma.video.findMany.mockResolvedValue([])

    const result = await service.getAccessibleVideoIds('user-1', 'user')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toContain('v-1')
    expect(result).toContain('v-2')
  })
})
