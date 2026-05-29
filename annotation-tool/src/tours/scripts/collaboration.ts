/**
 * Tour 8 — "Collaboration: projects, groups, sharing" (see plan §4).
 *
 * Multi-user surface. Projects bundle videos, personas, and members;
 * groups are reusable membership sets; shared-annotations views show
 * another member's annotations on the same clip. Crosses route
 * boundaries (Projects → Project detail → Shared), which is why the
 * tour engine persists its cursor in sessionStorage.
 */

import type { TourScript } from '../engine/types'

export const collaborationTour: TourScript = {
  id: 'collaboration',
  title: 'Collaboration: projects, groups, sharing',
  description:
    'Projects bundle videos, personas, and members. Groups are reusable membership sets. See annotations your collaborators made on the same clip.',
  durationMinutes: 3,
  tags: ['projects', 'groups', 'sharing', 'collaboration'],
  fixtureBundle: 'tour-collaboration',
  recap: 'Fovea scales from a solo annotator to a team without changing the data model.',
  followUpTourId: 'admin',
  steps: [
    {
      anchor: 'projects-page',
      narration: 'Projects bundle videos, personas, and members.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'project-video-assignment',
      narration: 'Assign clips to specific annotators.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'groups-page',
      narration: 'Groups are reusable membership sets across projects.',
      requiresFixture: false,
    },
    {
      anchor: 'shared-annotations-page',
      narration: 'See annotations another member made on the same clip.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'persona-preferences-section',
      narration: 'Per-persona defaults: shortcuts, default types, model picks.',
      requiresFixture: false,
    },
    {
      anchor: 'api-keys-page',
      narration: 'Programmatic access for scripted pipelines.',
      requiresFixture: false,
    },
  ],
}
