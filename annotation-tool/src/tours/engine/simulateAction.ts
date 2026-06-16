/**
 * Simulate a user action on a tour anchor.
 *
 * In demo deployments (VITE_DEMO_PUBLIC=1) the engine drives the
 * workspace itself — visitors watch the demo perform actions on
 * their behalf and press Next when they're ready to move on. This
 * is what makes a tour feel like a guided walkthrough instead of a
 * quiz; the visitor never has to know HOW to draw a box on the
 * canvas, they just watch a box appear.
 *
 * Each `expectAction` maps to a synthetic input sequence the engine
 * dispatches against the anchor element after revealBy completes.
 * The workspace's real pointer / input handlers process the events
 * exactly as if a human did them, so the resulting state change
 * (an annotation, a typed value, a scrubbed playhead) is real and
 * the downstream steps' anchors can mount against it.
 *
 * Stock deployments (VITE_DEMO_PUBLIC unset) skip simulation
 * entirely — the production tour shape (visitor performs the
 * action) is preserved.
 *
 * ------------------------------------------------------------------
 * Human-feel primitives
 * ------------------------------------------------------------------
 * The headline demo feature is the rich-text gloss reference system
 * (typing '#', '@', '^', '$' in any GlossEditor pops an autocomplete
 * of types / objects / annotations / claims). For that popup to fire
 * during simulated typing, each character has to flow through React's
 * onKeyDown + onChange pipeline exactly the way a real keystroke
 * would — that means a real KeyboardEvent per char and a native-setter
 * value mutation per char so the controlled input sees the cursor
 * advance one position at a time.
 *
 * The drawing / scrubbing primitives use requestAnimationFrame and an
 * ease-out cubic curve so the motion looks like a hand on a mouse
 * rather than four teleporting waypoints.
 *
 * Helpers exported:
 *   - humanType            character-by-character typing with cadence + KeyboardEvent
 *   - humanDraw            eased pointerdown / move* / up across a rectangle
 *   - humanScrub           eased horizontal pointerdown / move* / up
 *   - humanMoveCursorTo    lerp the synthetic-cursor element to a point
 *
 * All four are composable; simulateAction is the dispatcher that picks
 * the right one based on the step's expectAction.
 */

import type { TourStep } from './types'

type DemoAction = NonNullable<TourStep['expectAction']>

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

const isAborted = (signal?: AbortSignal) => signal?.aborted === true

// ---------------------------------------------------------------------------
// Timing + easing
// ---------------------------------------------------------------------------

/** ease-out cubic — pleasant deceleration, matches the spotlight ease curve. */
function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - c, 3)
}

/**
 * Animate `tick(progress01, easedProgress01)` from progress=0 to
 * progress=1 over `durationMs`. Uses requestAnimationFrame for smooth
 * ~60fps ticks; resolves once tick has been called with progress=1.
 * Honors AbortSignal — aborting between ticks short-circuits without
 * calling tick(1).
 */
function animateFrames(
  durationMs: number,
  tick: (progress: number, eased: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (isAborted(signal)) {
      resolve()
      return
    }
    const start = performance.now()
    const frame = (now: number) => {
      if (isAborted(signal)) {
        resolve()
        return
      }
      const raw = Math.min(1, (now - start) / Math.max(1, durationMs))
      tick(raw, easeOutCubic(raw))
      if (raw >= 1) {
        resolve()
        return
      }
      window.requestAnimationFrame(frame)
    }
    window.requestAnimationFrame(frame)
  })
}

// ---------------------------------------------------------------------------
// Synthetic cursor — the small SVG dot the spotlight overlay may render.
// We look it up lazily by data-tour-id so this module stays decoupled from
// the overlay's lifecycle. If there is no synthetic cursor in the DOM,
// humanMoveCursorTo is a no-op.
// ---------------------------------------------------------------------------

function findSyntheticCursor(): HTMLElement | null {
  return document.querySelector('[data-tour-id="synthetic-cursor"]') as HTMLElement | null
}

function placeCursor(el: HTMLElement, x: number, y: number): void {
  // The cursor element is fixed-position; translate3d keeps it on the
  // compositor and avoids layout thrash on rapid moves.
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
}

/**
 * Lerp the synthetic cursor element (if any) from its current position
 * to (targetX, targetY) over ~durationMs using ease-out cubic. No-op
 * when the cursor element is absent.
 */
export async function humanMoveCursorTo(
  targetX: number,
  targetY: number,
  durationMs = 500,
  signal?: AbortSignal,
): Promise<void> {
  const cursor = findSyntheticCursor()
  if (!cursor) return
  const rect = cursor.getBoundingClientRect()
  const startX = rect.left
  const startY = rect.top
  if (startX === targetX && startY === targetY) return
  await animateFrames(
    durationMs,
    (_, eased) => {
      placeCursor(cursor, startX + (targetX - startX) * eased, startY + (targetY - startY) * eased)
    },
    signal,
  )
}

// ---------------------------------------------------------------------------
// Pointer / mouse dispatch
// ---------------------------------------------------------------------------

function dispatchPointer(
  target: HTMLElement | SVGElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
): void {
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    pointerType: 'mouse',
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    isPrimary: true,
  }
  target.dispatchEvent(new PointerEvent(type, init))
  // Some handlers listen to mouse events instead of pointer events
  // — dispatch the matching mouse event too so both paths fire.
  const mouseType =
    type === 'pointerdown' ? 'mousedown' : type === 'pointerup' ? 'mouseup' : 'mousemove'
  target.dispatchEvent(new MouseEvent(mouseType, init))
}

// ---------------------------------------------------------------------------
// humanDraw — eased pointerdown/move*/up across a rectangle.
// ---------------------------------------------------------------------------

/**
 * Draw a bounding-box-shaped drag across the middle 40% of `anchor`.
 * Animates ~1100-1400 ms with ease-out cubic; pointermove ticks fire
 * at the rAF rate (~60Hz). The synthetic cursor (if any) lerps to the
 * start position over ~450 ms before pointerdown so the eye can follow.
 */
export async function humanDraw(anchor: HTMLElement, signal?: AbortSignal): Promise<void> {
  // The drawing-canvas data-tour-id often wraps a child SVG or canvas
  // element that holds the actual onMouseDown / onPointerDown
  // listeners. React's synthetic event delegation only fires those
  // handlers when the event's target IS the listening element (or a
  // child of it), not the wrapper div. Drill down to the first SVG /
  // CANVAS descendant when one exists; fall back to the wrapper for
  // components that listen on the wrapper itself.
  const target =
    (anchor.querySelector('svg, canvas') as HTMLElement | SVGElement | null) ?? anchor
  const rect = (target as HTMLElement | SVGElement).getBoundingClientRect()
  if (rect.width < 10 || rect.height < 10) return

  // Draw a box covering the middle 40% of the anchor's area. Big
  // enough to look meaningful, small enough that the drag does not
  // confuse a click-to-select handler.
  const startX = rect.left + rect.width * 0.3
  const startY = rect.top + rect.height * 0.3
  const endX = rect.left + rect.width * 0.7
  const endY = rect.top + rect.height * 0.7

  await humanMoveCursorTo(startX, startY, 450, signal)
  if (isAborted(signal)) return

  dispatchPointer(target, 'pointerdown', startX, startY)
  await sleep(80)
  if (isAborted(signal)) {
    dispatchPointer(target, 'pointerup', startX, startY)
    return
  }

  const DURATION = 1200 // 1.1-1.4s window; midpoint feels confident
  await animateFrames(
    DURATION,
    (_, eased) => {
      const x = startX + (endX - startX) * eased
      const y = startY + (endY - startY) * eased
      dispatchPointer(target, 'pointermove', x, y)
      const cursor = findSyntheticCursor()
      if (cursor) placeCursor(cursor, x, y)
    },
    signal,
  )

  dispatchPointer(target, 'pointerup', endX, endY)
}

// ---------------------------------------------------------------------------
// humanScrub — eased horizontal pointerdown/move*/up.
// ---------------------------------------------------------------------------

/**
 * Drag horizontally across `anchor` from 20% to 80% of its width.
 * Animates ~900 ms with ease-out cubic via rAF. Used for video
 * playhead / timeline scrubbing.
 */
export async function humanScrub(anchor: HTMLElement, signal?: AbortSignal): Promise<void> {
  const rect = anchor.getBoundingClientRect()
  if (rect.width < 10) return
  const startX = rect.left + rect.width * 0.2
  const endX = rect.left + rect.width * 0.8
  const y = rect.top + rect.height / 2

  await humanMoveCursorTo(startX, y, 450, signal)
  if (isAborted(signal)) return

  dispatchPointer(anchor, 'pointerdown', startX, y)
  await sleep(80)
  if (isAborted(signal)) {
    dispatchPointer(anchor, 'pointerup', startX, y)
    return
  }

  const DURATION = 900
  await animateFrames(
    DURATION,
    (_, eased) => {
      const x = startX + (endX - startX) * eased
      dispatchPointer(anchor, 'pointermove', x, y)
      const cursor = findSyntheticCursor()
      if (cursor) placeCursor(cursor, x, y)
    },
    signal,
  )

  dispatchPointer(anchor, 'pointerup', endX, y)
}

// ---------------------------------------------------------------------------
// humanType — character-by-character keystroke dispatch.
// ---------------------------------------------------------------------------

/**
 * Find the input/textarea/contenteditable inside `anchor` that should
 * receive the typed text. The anchor itself may be a wrapping div with
 * a data-tour-id on it, with the real editable child nested inside.
 */
function findTypeTarget(anchor: HTMLElement): HTMLElement | null {
  if (
    anchor instanceof HTMLInputElement ||
    anchor instanceof HTMLTextAreaElement ||
    anchor.isContentEditable
  ) {
    return anchor
  }
  // Prefer the FIRST visible input/textarea — GlossEditor wraps a
  // Textarea as the primary input, so a single nested match is usually
  // the right one. Fall back to a contenteditable child for editors
  // built on lexical/slate/prosemirror/tiptap/draft-js.
  const nested = anchor.querySelector<HTMLElement>(
    'input, textarea, [contenteditable="true"], [contenteditable=""]',
  )
  return nested ?? null
}

/**
 * Set the value of a controlled input/textarea via the native setter so
 * React's onChange synthetic-event pipeline registers the change.
 * Assigning `.value` directly bypasses React's internal value tracking
 * and the controlled-input handler never fires.
 */
function setControlledValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
}

/** Key map for the trigger characters that fire gloss autocomplete. */
const SHIFTED_KEY_MAP: Record<string, { key: string; code: string; shift: boolean }> = {
  '#': { key: '#', code: 'Digit3', shift: true },
  '@': { key: '@', code: 'Digit2', shift: true },
  '^': { key: '^', code: 'Digit6', shift: true },
  $: { key: '$', code: 'Digit4', shift: true },
}

function keyboardInitFor(char: string): KeyboardEventInit {
  const mapped = SHIFTED_KEY_MAP[char]
  if (mapped) {
    return {
      key: mapped.key,
      code: mapped.code,
      bubbles: true,
      cancelable: true,
      shiftKey: mapped.shift,
    }
  }
  return {
    key: char,
    code: char.length === 1 ? `Key${char.toUpperCase()}` : char,
    bubbles: true,
    cancelable: true,
    shiftKey: char >= 'A' && char <= 'Z',
  }
}

/**
 * Dispatch a real KeyboardEvent + InputEvent pair for a single character.
 * The flow is: keydown -> input mutation -> input event -> keyup so
 * onKeyDown handlers (gloss autocomplete navigation) and onChange handlers
 * (gloss autocomplete trigger detection) both fire in the right order.
 *
 * Returns false if the keydown event was preventDefault'd, in which case
 * the caller may decide to skip the character (the GlossEditor's onKeyDown
 * preventDefaults Enter/Tab/Escape/Arrows when the popup is open, but
 * leaves regular character keys alone, so this is generally harmless).
 */
function dispatchSingleCharacter(
  target: HTMLElement,
  char: string,
): void {
  const init = keyboardInitFor(char)

  const keydown = new KeyboardEvent('keydown', init)
  target.dispatchEvent(keydown)
  if (keydown.defaultPrevented) {
    // Editor consumed the keystroke (autocomplete navigation, etc.) —
    // skip the value mutation so we don't double-apply.
    target.dispatchEvent(new KeyboardEvent('keyup', init))
    return
  }

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    // Append the character at the current cursor position, then advance
    // the cursor by one so React's onChange sees `value[cursorPos - 1]`
    // match the freshly-typed character — that's exactly what
    // GlossEditor.handleInputChange checks to fire the autocomplete
    // popup when the user types '#', '@', '^', or '$'.
    const start = target.selectionStart ?? target.value.length
    const end = target.selectionEnd ?? target.value.length
    const before = target.value.slice(0, start)
    const after = target.value.slice(end)
    const next = before + char + after
    setControlledValue(target, next)
    const caret = start + 1
    target.setSelectionRange(caret, caret)
    target.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        data: char,
        inputType: 'insertText',
      }),
    )
  } else if (target.isContentEditable) {
    // Rich-text editors (lexical/slate/prosemirror/tiptap/draft-js)
    // listen for beforeinput and update their internal model from the
    // event's `data` rather than reading the DOM. Dispatch a real
    // InputEvent with inputType=insertText so the editor's handler
    // sees the character. document.execCommand('insertText') would
    // also work but is deprecated and inserts via the browser's
    // own undo stack, which fights React's controlled-input model.
    const beforeInput = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: char,
      inputType: 'insertText',
    })
    target.dispatchEvent(beforeInput)
    if (!beforeInput.defaultPrevented) {
      // The editor did not handle beforeinput — append into the DOM
      // ourselves so the visible value still updates. Editors that
      // DID handle beforeinput will have moved their internal cursor
      // already; the DOM mutation here is a no-op against the editor's
      // model in that case.
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        range.insertNode(document.createTextNode(char))
        range.collapse(false)
      } else {
        target.appendChild(document.createTextNode(char))
      }
    }
    target.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        data: char,
        inputType: 'insertText',
      }),
    )
  }

  target.dispatchEvent(new KeyboardEvent('keyup', init))
}

/**
 * Type `text` into `target` one character at a time with a small
 * inter-keystroke delay (55-85 ms with jitter). Each character flows
 * through:
 *
 *   1. `KeyboardEvent('keydown')`
 *   2. native-setter value mutation + cursor advance
 *      (or `InputEvent('beforeinput')` for contenteditable editors)
 *   3. `InputEvent('input', { data, inputType: 'insertText' })`
 *   4. `KeyboardEvent('keyup')`
 *
 * This is the path GlossEditor.handleInputChange and friends listen on
 * — typing '#' or '@' here genuinely fires the autocomplete popup.
 * Honors AbortSignal between characters.
 */
export async function humanType(
  target: HTMLElement,
  text: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!text) return
  target.focus()
  // APPEND semantics: position caret at the end of any existing value
  // and let the per-char dispatch concatenate. Earlier code cleared
  // first; that broke the gloss-reference showcase where steps
  // intentionally accumulate into a coherent sentence ("A kind of
  // #Spectator that lives at @LoanDepotPark" across two steps). When
  // a tour wants a fresh textarea the surrounding flow takes care of
  // it — the dialog re-mounts via revealBy or the workspace navigates
  // to a different route, both of which produce a fresh DOM node with
  // an empty value. With the clear in place the events-roles-claims
  // gloss showcase only ever displayed the final step's fragment
  // (' as established in ^') instead of the accumulated narrative the
  // tour script was composing.
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const end = target.value.length
    target.setSelectionRange(end, end)
  }
  for (const char of text) {
    if (isAborted(signal)) return
    dispatchSingleCharacter(target, char)
    // 55-85 ms per key with mild jitter so the rhythm doesn't feel like
    // a metronome. Trigger characters get a small pause AFTER them so
    // the autocomplete popup has time to mount before the next key.
    const base = 55 + Math.random() * 30
    const triggerPause = SHIFTED_KEY_MAP[char] ? 140 : 0
    await sleep(base + triggerPause)
  }
  // Note: we used to dispatch a trailing 'change' event here, but on
  // controlled inputs that listen for it (some form/library wrappers)
  // it caused a re-sync that nuked any React state set by the prior
  // onChange handler — in particular the GlossEditor autocomplete
  // popup would mount on the last keystroke and immediately unmount
  // on the trailing 'change'. The per-char InputEvent('input') already
  // fires React's onChange, so the final 'change' is redundant for the
  // common case.
}

// ---------------------------------------------------------------------------
// humanHover — single mouseenter/mouseover at the anchor's centre.
// ---------------------------------------------------------------------------

function humanHover(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  }
  anchor.dispatchEvent(new MouseEvent('mouseenter', init))
  anchor.dispatchEvent(new MouseEvent('mouseover', init))
}

// ---------------------------------------------------------------------------
// Default-text inference for 'type' actions on common gloss anchors.
// Lets a script declare expectAction: 'type' without picking a literal
// string — the engine infers a sensible demo string based on the anchor's
// data-tour-id. Scripts CAN override by passing typeText on the step.
// ---------------------------------------------------------------------------

function defaultTypeText(anchorId: string | undefined): string {
  if (!anchorId) return 'demo'
  // Gloss editors: type a trigger character + a short fragment so the
  // autocomplete popup mounts during the demo. The hash form is the
  // most generally-applicable trigger because every persona ontology
  // has at least one entity type the popup will list.
  if (anchorId === 'gloss-editor') return '#'
  if (anchorId.includes('gloss')) return '#'
  // Transcript correction step types a corrected word into the
  // segment editor.
  if (anchorId.includes('transcript')) return 'grabbed'
  // Video summary edit step types a short correction.
  if (anchorId.includes('summary')) return 'behind home plate'
  return 'demo'
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Drive `action` on `anchor`. The `step` argument is optional and is
 * used only to pull per-step overrides (e.g. step.typeText). Callers
 * that don't have a step handy may pass only the action + anchor —
 * humanType will fall back to a sensible default text based on the
 * anchor's data-tour-id.
 */
export async function simulateAction(
  action: DemoAction,
  anchor: HTMLElement,
  signal?: AbortSignal,
  step?: TourStep,
): Promise<void> {
  if (isAborted(signal)) return
  // 'click' is INTENTIONALLY skipped. The engine auto-advances on a
  // real click of the anchor, so simulating a click here would race
  // the visitor off the step before they could read the narration.
  // The revealBy chain already opens any dialog / popover that needs
  // a click before the anchor mounts, so the click-action case only
  // needs the visitor's manual Next.
  if (action === 'click') return
  if (action === 'draw') {
    await humanDraw(anchor, signal)
    return
  }
  if (action === 'scrub') {
    await humanScrub(anchor, signal)
    return
  }
  if (action === 'type') {
    const target = findTypeTarget(anchor)
    if (!target) return
    const anchorId = anchor.getAttribute('data-tour-id') ?? step?.anchor
    const text = step?.typeText ?? defaultTypeText(anchorId)
    await humanType(target, text, signal)
    // Settle pause after the last keystroke so the autocomplete popup
    // (which mounts via setShowAutocomplete in a React commit triggered
    // by the final input event) finishes its first paint before the
    // next step's anchor poll fires. Without this, a fast Next press
    // by the probe / visitor races the React commit and the popup
    // anchor briefly looks absent to the engine's MutationObserver.
    await sleep(400)
    return
  }
  if (action === 'hover') {
    humanHover(anchor)
    return
  }
  // 'none' — nothing to do.
}
