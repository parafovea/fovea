/**
 * "Collaboration: projects, groups, sharing" tour.
 *
 * The multi-user surface. Projects bundle videos, personas, and
 * members; groups are reusable membership sets; the shared-annotations
 * view shows another member's annotations on the same clip. The tour
 * crosses route boundaries (Projects, Admin, Groups, Shared), which the
 * engine handles by persisting its cursor as it navigates.
 *
 * The project and group names the narration suggests come from the
 * deployment's content bundle. The default microvent bundle uses an
 * incident-review project and a stadium-operations team group; admins
 * for other domains supply their own names.
 */

import type { Tour } from '../engine/tourSchema'
import type { TourCollaborationContent } from '../content/types'

export function buildCollaborationTour(
  c: TourCollaborationContent,
): Tour {
  return {
    id: 'collaboration',
    title: 'Collaboration: projects, groups, sharing',
    description:
      'Projects bundle videos, personas, and members. Groups are reusable membership sets. See annotations your collaborators made on the same clip.',
    durationMinutes: 5,
    tags: ['projects', 'groups', 'sharing', 'collaboration'],
    startRoute: '/app/projects',
    recap:
      'Fovea scales from a solo annotator to a team without changing the data model.',
    followUpTourId: 'admin',
    steps: [
      {
        anchor: 'projects-page',
        route: '/app/projects',
        narration: `Projects bundle videos, personas, and members. E.g., '${c.projectName}'.`,
      },
      {
        anchor: 'projects-create-button',
        route: '/app/projects',
        narration: 'Start a new project here.',
        expectAction: 'click',
      },
      {
        anchor: 'project-name-input',
        route: '/app/projects',
        narration: `Name the project. E.g., '${c.projectName}'.`,
        expectAction: 'type',
        typeText: c.projectName,
      },
      {
        anchor: 'project-video-assignment',
        route: '/app/projects',
        narration:
          'Assignment rules route freshly-uploaded clips to specific annotators on a project.',
        driver: { capability: 'open-project-video-assignment' },
      },
      {
        anchor: 'group-management-page',
        route: '/app/admin',
        narration:
          'Groups gate project membership in bulk. The admin view lists every group.',
      },
      {
        anchor: 'groups-page',
        route: '/app/groups',
        narration: `Each member sees the groups they belong to here. E.g., '${c.groupName}'.`,
      },
      {
        anchor: 'groups-create-button',
        route: '/app/groups',
        narration: 'Create a new group.',
        expectAction: 'click',
      },
      {
        anchor: 'group-name-input',
        route: '/app/groups',
        narration: `Name the group. E.g., '${c.groupName}'.`,
        expectAction: 'type',
        typeText: c.groupName,
      },
      {
        anchor: 'shared-annotations-page',
        route: '/app/shared',
        narration:
          'See annotations, summaries, and claims another member shared with you on the same clip.',
      },
    ],
  }
}
