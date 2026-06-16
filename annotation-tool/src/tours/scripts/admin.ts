/**
 * Tour 9 — "Admin: users, models, system config" (see plan §4).
 *
 * Sandboxed admin walkthrough. Demo mode runs this against a
 * fixture-seeded admin view so attendees can poke around RBAC, model
 * memory validation, and the system-config-propagator without
 * touching real users.
 *
 * The tour's narration is operator-focused (RBAC, model memory) and
 * doesn't surface domain-specific content, so the TourContentBundle
 * doesn't carry an admin slot — there's nothing meaningful to
 * parameterize per deployment beyond what's already in the engine's
 * authentication flow.
 */

import type { TourScript } from '../engine/types'

export function buildAdminTour(): TourScript {
  return {
    id: 'admin',
    title: 'Admin: users, models, and system config',
    description:
      'Manage users, roles, and the active detection / tracking models. Validate that a model selection fits in the available VRAM before pushing it to the model-service.',
    durationMinutes: 3,
    tags: ['admin', 'rbac', 'models', 'system-config'],
    fixtureBundle: 'admin',
    recap:
      'Admin surfaces are designed for operators, not annotators. You can always see who has what permissions and which models are live.',
    followUpTourId: 'import-export',
    startRoute: '/app/admin',
    steps: [
      {
        anchor: 'admin-panel',
        route: '/app/admin',
        narration: 'Admins manage users, models, and system-wide config.',
        requiresFixture: false,
      },
      {
        anchor: 'user-management-page',
        route: '/app/admin',
        // Users tab is the default but stepping back from a later
        // tab and forward again needs to reopen it explicitly.
        revealBy: 'admin-tab-users',
        narration: 'Create users, assign roles.',
        requiresFixture: false,
      },
      {
        anchor: 'permissions-page',
        route: '/app/admin',
        revealBy: 'admin-tab-permissions',
        narration: 'Fine-grained RBAC: who can do what, on which data.',
        requiresFixture: false,
      },
      {
        anchor: 'model-management-page',
        route: '/app/admin',
        revealBy: 'admin-tab-models',
        narration: 'Select which detection / tracking models are active.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'model-memory-validation',
        route: '/app/admin',
        revealBy: 'admin-tab-models',
        narration:
          'On GPU hosts a live VRAM budget validates the selection before it is pushed to the model-service. On CPU-only deployments the same anchor confirms the validation surface is wired up.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'system-config-panel',
        route: '/app/admin',
        revealBy: 'admin-tab-system-config',
        narration: 'System-wide toggles, propagated to the model-service.',
        requiresFixture: false,
      },
      {
        anchor: 'session-management-page',
        route: '/app/admin',
        revealBy: 'admin-tab-sessions',
        narration: 'Operational views: live sessions, video-assignment audit.',
        requiresFixture: false,
      },
    ],
  }
}
