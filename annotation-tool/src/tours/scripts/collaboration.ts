/**
 * Tour 8 — "Collaboration: projects, groups, sharing" (see plan §4).
 *
 * Multi-user surface. Projects bundle videos, personas, and members;
 * groups are reusable membership sets; shared-annotations views show
 * another member's annotations on the same clip. Crosses route
 * boundaries (Projects → Admin Video Access → Admin Groups → Groups →
 * Shared), which is why the tour engine persists its cursor in
 * sessionStorage.
 *
 * The project + group names the narration suggests come from the
 * deployment's TourContentBundle. Default microvent uses a
 * Phillies-Marlins incident review project + Stadium operations
 * team group. Admins for other domains supply their own names.
 *
 * Demo notes: on demo.fovea.video the visitor is anonymous and the
 * admin route renders DemoAdminPanel (a fully-static synthetic
 * preview). The project / group create dialogs on the user-facing
 * Projects and Groups pages still mount their forms for the demo
 * visitor; only the final POST fails, which the tour never reaches
 * because no step clicks Save.
 */

import type { TourScript } from '../engine/types'
import type { TourCollaborationContent } from '../content/types'

export function buildCollaborationTour(
  c: TourCollaborationContent,
): TourScript {
  return {
    id: 'collaboration',
    title: 'Collaboration: projects, groups, sharing',
    description:
      'Projects bundle videos, personas, and members. Groups are reusable membership sets. See annotations your collaborators made on the same clip.',
    durationMinutes: 5,
    tags: ['projects', 'groups', 'sharing', 'collaboration'],
    fixtureBundle: 'collaboration',
    startRoute: '/app/projects',
    recap:
      'Fovea scales from a solo annotator to a team without changing the data model.',
    followUpTourId: 'admin',
    steps: [
      {
        anchor: 'projects-page',
        route: '/app/projects',
        narration: `Projects bundle videos, personas, and members. E.g., '${c.projectName}'.`,
        requiresFixture: false,
      },
      {
        anchor: 'projects-create-button',
        route: '/app/projects',
        narration: 'Start a new project here.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'project-name-input',
        route: '/app/projects',
        revealBy: 'projects-create-button',
        narration: `Name the project. E.g., '${c.projectName}'.`,
        expectAction: 'type',
        typeText: c.projectName,
        requiresFixture: false,
      },
      {
        anchor: 'project-video-assignment',
        route: '/app/admin',
        revealBy: 'admin-tab-video-access',
        narration:
          'Assignment rules route freshly-uploaded clips to specific annotators on a project.',
        requiresFixture: false,
      },
      {
        anchor: 'group-management-page',
        route: '/app/admin',
        revealBy: 'admin-tab-groups',
        narration:
          'Groups gate project membership in bulk. The admin view lists every group.',
        requiresFixture: false,
      },
      {
        anchor: 'groups-page',
        route: '/app/groups',
        narration: `Each member sees the groups they belong to here. E.g., '${c.groupName}'.`,
        requiresFixture: false,
      },
      {
        anchor: 'groups-create-button',
        route: '/app/groups',
        narration: 'Create a new group.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'group-name-input',
        route: '/app/groups',
        revealBy: 'groups-create-button',
        narration: `Name the group. E.g., '${c.groupName}'.`,
        expectAction: 'type',
        typeText: c.groupName,
        requiresFixture: false,
      },
      {
        anchor: 'shared-annotations-page',
        route: '/app/shared',
        narration:
          'See annotations, summaries, and claims another member shared with you on the same clip.',
        requiresFixture: false,
      },
    ],
  }
}
