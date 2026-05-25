/**
 * Tour 9 — "Admin: users, models, system config" (see plan §4).
 *
 * Sandboxed admin walkthrough. Demo mode runs this against a
 * fixture-seeded admin view so attendees can poke around RBAC, model
 * memory validation, and the system-config-propagator without touching
 * real users.
 */

import type { TourScript } from '../engine/types'

export const adminTour: TourScript = {
  id: 'admin',
  title: 'Admin: users, models, and system config',
  description:
    'Manage users, roles, and the active detection / tracking models. Validate that a model selection fits in the available VRAM before pushing it to the model-service.',
  durationMinutes: 3,
  tags: ['admin', 'rbac', 'models', 'system-config'],
  fixtureBundle: 'tour-admin',
  recap:
    'Admin surfaces are designed for operators, not annotators — you can always see who has what permissions and which models are live.',
  followUpTourId: 'import-export',
  steps: [
    {
      anchor: 'admin-panel',
      narration: 'Admins manage users, models, and system-wide config.',
      requiresFixture: true,
    },
    {
      anchor: 'user-management-page',
      narration: 'Create users, assign roles.',
      requiresFixture: true,
    },
    {
      anchor: 'permissions-page',
      narration: 'Fine-grained RBAC: who can do what, on which data.',
      requiresFixture: true,
    },
    {
      anchor: 'model-management-page',
      narration: 'Select which detection / tracking models are active.',
      expectAction: 'click',
      requiresFixture: true,
    },
    {
      anchor: 'model-memory-validation',
      narration: 'Validate the selection fits in available VRAM before pushing.',
      expectAction: 'click',
      requiresFixture: true,
    },
    {
      anchor: 'system-config-panel',
      narration: 'System-wide toggles, propagated to the model-service.',
      requiresFixture: true,
    },
    {
      anchor: 'session-management-page',
      narration: 'Operational views: live sessions, video-assignment audit.',
      requiresFixture: true,
    },
  ],
}
