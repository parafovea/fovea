/**
 * "Admin: users, models, system config" tour.
 *
 * An operator walkthrough of the admin panel: RBAC, model memory
 * validation, and system-config propagation.
 *
 * The narration is operator-focused and carries no domain-specific
 * content, so this tour takes no content bundle; there is nothing to
 * parameterize per deployment beyond what the authentication flow
 * already supplies.
 */

import type { Tour } from '../engine/tourSchema'

export function buildAdminTour(): Tour {
  return {
    id: 'admin',
    title: 'Admin: users, models, and system config',
    description:
      'Manage users, roles, and the active detection / tracking models. Validate that a model selection fits in the available VRAM before pushing it to the model-service.',
    durationMinutes: 3,
    tags: ['admin', 'rbac', 'models', 'system-config'],
    recap:
      'Admin surfaces are designed for operators, not annotators. You can always see who has what permissions and which models are live.',
    followUpTourId: 'import-export',
    startRoute: '/app/admin',
    steps: [
      {
        anchor: 'admin-panel',
        route: '/app/admin',
        narration: 'Admins manage users, models, and system-wide config.',
      },
      {
        anchor: 'user-management-page',
        route: '/app/admin',
        narration: 'Create users, assign roles.',
      },
      {
        anchor: 'permissions-page',
        route: '/app/admin',
        narration: 'Fine-grained RBAC: who can do what, on which data.',
      },
      {
        anchor: 'model-management-page',
        route: '/app/admin',
        narration: 'Select which detection / tracking models are active.',
        expectAction: 'click',
      },
      {
        anchor: 'model-memory-validation',
        route: '/app/admin',
        narration:
          'On GPU hosts a live VRAM budget validates the selection before it is pushed to the model-service. On CPU-only deployments the same anchor confirms the validation surface is wired up.',
        expectAction: 'click',
      },
      {
        anchor: 'system-config-panel',
        route: '/app/admin',
        narration: 'System-wide toggles, propagated to the model-service.',
      },
      {
        anchor: 'session-management-page',
        route: '/app/admin',
        narration: 'Operational views: live sessions, video-assignment audit.',
      },
    ],
  }
}
