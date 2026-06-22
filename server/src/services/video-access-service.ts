/**
 * Service for determining video access based on project assignments and roles.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'
import { trace } from '@opentelemetry/api'

import { demoGrantsAllVideos } from '../lib/demo-rbac.js'

const tracer = trace.getTracer('fovea-rbac')

/**
 * Determines which videos a user can access based on project assignments,
 * group memberships, and system role.
 *
 * System admins receive unrestricted access. For other users, access is derived
 * from the union of two sets: videos assigned to the user's projects (including
 * projects owned by the user's groups) or directly to the user, and "global"
 * videos that have no project assignment at all.
 *
 * @example
 * ```typescript
 * const service = new VideoAccessService(fastify.prisma)
 * const accessible = await service.getAccessibleVideoIds(userId, 'user')
 * if (accessible === 'all') {
 *   // system admin, no filtering needed
 * } else {
 *   // filter by accessible video IDs
 * }
 * ```
 */
export class VideoAccessService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Returns video IDs accessible to the user, or 'all' for system admins.
   *
   * The access logic follows these steps:
   * 1. System admins get unrestricted access ('all').
   * 2. Resolve the user's group memberships.
   * 3. Resolve the user's project memberships (direct and via group ownership).
   * 4. Collect video IDs from project video assignments matching the user's projects
   *    or assigned directly to the user.
   * 5. Collect "global" video IDs (videos with no project assignment).
   * 6. Return the union of assigned and global video IDs.
   *
   * @param userId - UUID of the user
   * @param systemRole - the user's system-level role (e.g., 'system_admin', 'user')
   * @returns array of accessible video IDs, or 'all' for system admins
   */
  async getAccessibleVideoIds(
    userId: string,
    systemRole: string
  ): Promise<string[] | 'all'> {
    // 1. System admins have unrestricted access
    const span = tracer.startSpan('video-access.resolve')
    span.setAttribute('video_access.user_id', userId)
    span.setAttribute('video_access.system_role', systemRole)

    if (systemRole === 'system_admin') {
      span.setAttribute('video_access.result_count', -1)
      span.end()
      return 'all'
    }

    // 1b. Demo deployment override: in the booth flow every visitor (including
    // auto-issued demo-anonymous-* sessions) must see the same curated demo
    // corpus the tours are anchored to. The per-user sharing/group/project
    // chain returns the empty set for anonymous visitors (no projects, no group
    // memberships, no shares), so the VideoBrowser would render "No videos
    // found" and every tour anchor would be missing. demoGrantsAllVideos is
    // true only in demo mode, so a self-hosted deployment keeps its per-user
    // RBAC intact (see lib/demo-rbac.ts).
    if (demoGrantsAllVideos()) {
      span.setAttribute('video_access.result_count', -1)
      span.setAttribute('video_access.demo_mode_override', true)
      span.end()
      return 'all'
    }

    try {
      // 2. Get user's group IDs via GroupMembership
      const groupMemberships = await this.prisma.groupMembership.findMany({
        where: { userId },
        select: { groupId: true },
      })
      const groupIds = groupMemberships.map(gm => gm.groupId)

      // 3. Get user's project IDs (personal memberships + via group-owned projects)
      const [directProjects, groupProjects] = await Promise.all([
        this.prisma.projectMembership.findMany({
          where: { userId },
          select: { projectId: true },
        }),
        groupIds.length > 0
          ? this.prisma.project.findMany({
              where: { ownerGroupId: { in: groupIds } },
              select: { id: true },
            })
          : Promise.resolve([]),
      ])

      const projectIds = [
        ...new Set([
          ...directProjects.map(p => p.projectId),
          ...groupProjects.map(p => p.id),
        ]),
      ]

      // 4. Get assigned video IDs from projects or direct user assignments
      const assignments = projectIds.length > 0
        ? await this.prisma.projectVideoAssignment.findMany({
            where: {
              OR: [
                { projectId: { in: projectIds } },
                { assignedUserId: userId },
              ],
            },
            select: { videoId: true },
          })
        : await this.prisma.projectVideoAssignment.findMany({
            where: { assignedUserId: userId },
            select: { videoId: true },
          })

      const assignedVideoIds = [...new Set(assignments.map(a => a.videoId))]

      // 5. Get "global" video IDs (videos with zero assignments)
      const assignedVideoIdsAll = await this.prisma.projectVideoAssignment.findMany({
        select: { videoId: true },
        distinct: ['videoId'],
      })
      const allAssignedIds = new Set(assignedVideoIdsAll.map(a => a.videoId))

      const globalVideos = await this.prisma.video.findMany({
        where: { id: { notIn: [...allAssignedIds] } },
        select: { id: true },
      })

      const globalVideoIds = globalVideos.map(v => v.id)

      // 6. Return the union of assigned and global video IDs
      const result = [...new Set([...assignedVideoIds, ...globalVideoIds])]
      span.setAttribute('video_access.result_count', result.length)
      return result
    } finally {
      span.end()
    }
  }
}
