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
   * Route this step's anchor lives on, expressed as a React Router
   * path. When set, the engine navigates to this route before
   * waitForAnchor begins polling for the anchor. Omitted ⇒ the engine
   * stays on whatever route the previous step left it on (default:
   * the tour's `startRoute`).
   *
   * Patterns:
   *   - "/app" — the video browser
   *   - "/app/annotate/:videoId" — supply a concrete id via
   *     `routeParams` (engine substitutes them into the template)
   *   - "/app/ontology" — the persona-rooted ontology workspace
   *   - "/app/world/:personaId" — world workspace
   *
   * Tours that traverse multiple workspaces declare `route` on every
   * step. The engine performs a React Router navigate before
   * mounting the step, and the existing `waitForAnchor` 3 s budget
   * handles the post-navigation DOM-settle.
   */
  route?: string
  /**
   * Concrete values to substitute for `:param` placeholders in
   * `route`. e.g. `route: "/app/annotate/:videoId"` paired with
   * `routeParams: { videoId: "abc123" }` navigates to
   * `/app/annotate/abc123`. Engine throws at runtime if the route
   * has unfilled placeholders.
   */
  routeParams?: Record<string, string>
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
   * Text the demo engine should type when `expectAction === 'type'`.
   * Each character is dispatched as a real KeyboardEvent + InputEvent
   * with ~55-85 ms cadence so React onKeyDown / onChange handlers
   * (including the gloss-editor autocomplete trigger on '#', '@',
   * '^', '$') fire exactly as they would for a human typist.
   *
   * When omitted, the engine picks a sensible default based on the
   * step's anchor (e.g. '#' for the gloss-editor anchor, a corrected
   * word for transcript / summary anchors). Stock (non-demo) builds
   * never read this field — they leave the action to the visitor.
   */
  typeText?: string
  /**
   * Force modal mode on this step regardless of the tour-level default.
   * Use sparingly; modal blocks click-through and frustrates attendees
   * who want to wander.
   */
  modal?: boolean
  /**
   * `data-tour-id`(s) of element(s) the engine should click BEFORE
   * it starts polling for this step's anchor. Use this when the
   * step's real anchor lives inside a dialog / popover / accordion
   * that only mounts after a specific control is activated.
   *
   * A single string clicks one opener — e.g. the Import tour anchors
   * on `import-dialog` (a Radix Dialog content surface that does
   * not mount until the visitor opens it), so the step declares
   * `revealBy: 'import-trigger'` and the engine synthesises the
   * click on the header Import button first.
   *
   * An array of strings clicks the openers in sequence with a
   * short settle pause between each — e.g. the ontology-authoring
   * tour's "switch to event types and open the event editor" step
   * declares `revealBy: ['ontology-tab-events', 'ontology-add-type-button']`,
   * the engine clicks the tab, waits for the tab content to
   * commit, clicks the add-type FAB, and then resolves
   * `event-type-editor`. Each element in the array is independently
   * polled for in the DOM with a short timeout, so a missing
   * intermediate opener does not silently break the chain — the
   * step still ends up surfacing the missing-anchor banner if any
   * link fails.
   *
   * The reveal click happens once per step entry; the engine then
   * runs its normal `waitForAnchor` flow for `anchor` so the runner
   * still fails loudly if the dialog never opens or the anchor was
   * renamed.
   */
  revealBy?: string | readonly string[]
}

export interface TourScript {
  id: string
  title: string
  description: string
  durationMinutes: number
  /** Feature-area chips that surface on the menu tile. */
  tags?: readonly string[]
  /**
   * Route the engine navigates to BEFORE mounting the runner. Lets a
   * tour declare its initial workspace context without forcing the
   * caller to navigate by hand. Step 0's `route` (if it has one)
   * still wins — `startRoute` is the default when no step declares
   * its own route, and the entry point for visitors arriving from
   * the public catalogue at `/`.
   *
   * Default: `/app` (the video browser).
   */
  startRoute?: string
  /**
   * If set, fixture-mode launches POST to /api/demo/seed with this id to
   * stage the workspace before step 1.
   */
  fixtureBundle?: string
  /**
   * Display name of the persona this tour treats as the demonstrator —
   * matched against the names returned by /api/personas (case-
   * insensitive, exact match). When set, TourProvider.launch sets the
   * active selectedPersonaId to that persona's id BEFORE the runner
   * mounts so narrations like "as the Tech-Curious Spectator" /
   * "Ballpark Guest Services Supervisor" line up with the persona
   * dropdown visible in the workspace toolbar. Sourced from the tour
   * content bundle's per-tour personaName field.
   */
  personaName?: string
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
