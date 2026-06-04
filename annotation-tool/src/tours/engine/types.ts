/**
 * Tour engine types — the on-the-wire shape of a tour script (built-in or
 * authored by a self-hoster) and the runtime types the engine consumes.
 *
 * Two execution modes (see CVPR_2026_DEMO_PLAN.md §6.6):
 *
 *   anchored — tour drives the user's actual workspace state. Steps tagged
 *              with requiresFixture are skipped with a graceful inline note.
 *   fixture  — tour seeds a known workspace via the demo fixture seeder
 *              first, then runs every step against that state. Available
 *              only when FOVEA_DEMO_MODE is enabled.
 */

export type TourMode = 'anchored' | 'fixture'

export interface TourStep {
  /** Stable selector — `[data-tour-id="..."]` on the anchor element. */
  anchor: string
  /** ≤ 15 words; the step card is a caption, not a manual. */
  narration: string
  /** Optional inline body — rendered as markdown under the narration. */
  body?: string
  /**
   * If true, this step depends on demo-seeded state. Anchored mode shows
   * an inline "this step uses demo content" note and lets the user skip.
   */
  requiresFixture?: boolean
  /**
   * Optional expected user action. Purely informational — engine does not
   * block on it. Useful for analytics and for self-hosters writing tours.
   */
  expectAction?: 'click' | 'draw' | 'type' | 'hover' | 'scrub' | 'none'
  /**
   * Force modal mode on this step regardless of the tour-level default.
   * Use sparingly; modal blocks click-through and frustrates attendees
   * who want to wander.
   */
  modal?: boolean
}

export interface TourScript {
  id: string
  title: string
  description: string
  durationMinutes: number
  /** Feature-area chips that surface on the menu tile. */
  tags?: readonly string[]
  /**
   * If set, fixture-mode launches POST to /api/demo/seed with this id to
   * stage the workspace before step 1.
   */
  fixtureBundle?: string
  /**
   * Recap shown on the post-tour page. Plain text; one or two sentences.
   */
  recap?: string
  /**
   * Suggested follow-up tour id. Used by the recap page.
   */
  followUpTourId?: string
  steps: readonly TourStep[]
}
