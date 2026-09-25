/**
 * Simulate the user action a tour step expects, against the step's anchor
 * element. The runner calls this so a visitor watches the workspace perform the
 * action rather than having to know how to perform it themselves.
 *
 * Each `expectAction` maps to a synthetic input sequence dispatched at the
 * anchor: the workspace's real pointer and input handlers process the events
 * exactly as they would a human's, so the resulting state (an annotation, a
 * typed value, a scrubbed playhead) is real and the next step's anchor mounts
 * against it.
 *
 * Human-feel primitives:
 *   - `humanType`         character-by-character typing with cadence and a real
 *                         KeyboardEvent + InputEvent per key, so a controlled
 *                         input's onKeyDown / onChange pipeline (including the
 *                         gloss editor's #/@/^/$ autocomplete trigger) fires.
 *   - `humanDraw`         eased pointerdown / move* / up across a rectangle.
 *   - `humanScrub`        eased horizontal pointerdown / move* / up.
 *   - `humanMoveCursorTo` lerp a synthetic-cursor element to a point.
 *
 * `simulateAction` is the dispatcher that picks the right primitive from the
 * step's `expectAction`. A `'click'` action is a no-op: the runner auto-advances
 * on the visitor's real click, so simulating one would race them off the step.
 */

import type { TourStep } from './tourSchema'

type StepAction = NonNullable<TourStep['expectAction']>

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

const isAborted = (signal?: AbortSignal) => signal?.aborted === true

// ---------------------------------------------------------------------------
// Timing + easing
// ---------------------------------------------------------------------------

/** ease-out cubic: pleasant deceleration, matching the spotlight ease curve. */
function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - c, 3)
}

/**
 * Animate `tick(progress01, easedProgress01)` from 0 to 1 over `durationMs`
 * using requestAnimationFrame. Resolves once `tick` has run with progress 1, or
 * immediately when `signal` aborts between frames (without a final `tick(1)`).
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
// Synthetic cursor — the small element the overlay may render. Looked up
// lazily by data attribute so this module stays decoupled from the overlay's
// lifecycle; humanMoveCursorTo is a no-op when no cursor element is present.
// ---------------------------------------------------------------------------

function findSyntheticCursor(): HTMLElement | null {
  return document.querySelector('[data-fovea-tour-cursor]') as HTMLElement | null
}

function placeCursor(el: HTMLElement, x: number, y: number): void {
  // The cursor element is fixed-position; translate3d keeps it on the
  // compositor and avoids layout thrash on rapid moves.
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
}

/**
 * Lerp the synthetic cursor element (if any) from its current position to
 * (targetX, targetY) over `durationMs` with ease-out cubic. No-op when no
 * cursor element is present.
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
  // Some handlers listen to mouse events instead of pointer events; dispatch
  // the matching mouse event too so both paths fire.
  const mouseType =
    type === 'pointerdown' ? 'mousedown' : type === 'pointerup' ? 'mouseup' : 'mousemove'
  target.dispatchEvent(new MouseEvent(mouseType, init))
}

// ---------------------------------------------------------------------------
// humanDraw — eased pointerdown/move*/up across a rectangle.
// ---------------------------------------------------------------------------

/**
 * Draw a bounding-box-shaped drag across the middle 40% of `anchor`. Animates
 * ~1200 ms with ease-out cubic; pointermove ticks fire at the rAF rate. The
 * synthetic cursor (if any) lerps to the start position before pointerdown so
 * the eye can follow.
 */
export async function humanDraw(anchor: HTMLElement, signal?: AbortSignal): Promise<void> {
  // The drawing canvas anchor often wraps a child SVG or canvas that holds the
  // pointer listeners. React's synthetic event delegation only fires those
  // when the event target IS the listening element (or its descendant), not a
  // wrapping div. Drill to the first SVG / CANVAS descendant when one exists;
  // fall back to the wrapper for components that listen on the wrapper itself.
  const target =
    (anchor.querySelector('svg, canvas') as HTMLElement | SVGElement | null) ?? anchor
  const rect = target.getBoundingClientRect()
  if (rect.width < 10 || rect.height < 10) return

  // A box covering the middle 40% of the anchor: big enough to look meaningful,
  // small enough that the drag does not read as a click-to-select.
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

  await animateFrames(
    1200,
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
 * Drag horizontally across `anchor` from 20% to 80% of its width over ~900 ms
 * with ease-out cubic. Drives a video playhead or timeline scrub.
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

  await animateFrames(
    900,
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
 * Find the input / textarea / contenteditable inside `anchor` that receives the
 * typed text. The anchor may be a wrapping element with the real editable child
 * nested inside.
 */
function findTypeTarget(anchor: HTMLElement): HTMLElement | null {
  if (
    anchor instanceof HTMLInputElement ||
    anchor instanceof HTMLTextAreaElement ||
    anchor.isContentEditable
  ) {
    return anchor
  }
  // Prefer the first visible input / textarea; fall back to a contenteditable
  // child for editors built on lexical / slate / prosemirror / tiptap.
  return anchor.querySelector<HTMLElement>(
    'input, textarea, [contenteditable="true"], [contenteditable=""]',
  )
}

/**
 * Set a controlled input's value via the native setter so React's onChange
 * pipeline registers the change. Assigning `.value` directly bypasses React's
 * value tracking and the controlled-input handler never fires.
 */
function setControlledValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
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
    return { key: mapped.key, code: mapped.code, bubbles: true, cancelable: true, shiftKey: mapped.shift }
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
 * Dispatch a KeyboardEvent + InputEvent sequence for a single character:
 * keydown, then the value mutation and input event, then keyup, so onKeyDown
 * handlers (gloss autocomplete navigation) and onChange handlers (gloss
 * autocomplete trigger detection) both fire in order. When the editor
 * preventDefaults the keydown (autocomplete navigation, etc.), the value
 * mutation is skipped so the keystroke is not double-applied.
 */
function dispatchSingleCharacter(target: HTMLElement, char: string): void {
  const init = keyboardInitFor(char)

  const keydown = new KeyboardEvent('keydown', init)
  target.dispatchEvent(keydown)
  if (keydown.defaultPrevented) {
    target.dispatchEvent(new KeyboardEvent('keyup', init))
    return
  }

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    // Insert the character at the caret, then advance the caret by one so
    // React's onChange sees `value[caret - 1]` match the freshly typed
    // character: exactly what the gloss editor checks to fire its autocomplete
    // popup on '#', '@', '^', or '$'.
    const start = target.selectionStart ?? target.value.length
    const end = target.selectionEnd ?? target.value.length
    const before = target.value.slice(0, start)
    const after = target.value.slice(end)
    setControlledValue(target, before + char + after)
    const caret = start + 1
    target.setSelectionRange(caret, caret)
    target.dispatchEvent(
      new InputEvent('input', { bubbles: true, cancelable: false, data: char, inputType: 'insertText' }),
    )
  } else if (target.isContentEditable) {
    // Rich-text editors update their internal model from beforeinput's `data`.
    // Dispatch a real InputEvent with inputType=insertText; when the editor
    // does not handle it, append into the DOM so the visible value updates.
    const beforeInput = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: char,
      inputType: 'insertText',
    })
    target.dispatchEvent(beforeInput)
    if (!beforeInput.defaultPrevented) {
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
      new InputEvent('input', { bubbles: true, cancelable: false, data: char, inputType: 'insertText' }),
    )
  }

  target.dispatchEvent(new KeyboardEvent('keyup', init))
}

/**
 * Type `text` into `target` one character at a time with a small jittered
 * inter-keystroke delay. Each character flows through keydown, a native-setter
 * value mutation (or beforeinput for contenteditable), an input event, and
 * keyup: the path the gloss editor's input handler listens on, so typing '#' or
 * '@' genuinely fires the autocomplete popup. Honors `signal` between
 * characters. Appends to any existing value so steps that accumulate a sentence
 * across keystrokes compose correctly.
 */
export async function humanType(target: HTMLElement, text: string, signal?: AbortSignal): Promise<void> {
  if (!text) return
  target.focus()
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const end = target.value.length
    target.setSelectionRange(end, end)
  }
  for (const char of text) {
    if (isAborted(signal)) return
    dispatchSingleCharacter(target, char)
    // 55-85 ms per key with mild jitter so the rhythm is not metronomic.
    // Trigger characters get a brief pause after them so the autocomplete
    // popup mounts before the next key.
    const base = 55 + Math.random() * 30
    const triggerPause = SHIFTED_KEY_MAP[char] ? 140 : 0
    await sleep(base + triggerPause)
  }
}

// ---------------------------------------------------------------------------
// humanHover — single mouseenter/mouseover at the anchor's center.
// ---------------------------------------------------------------------------

function humanHover(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  }
  anchor.dispatchEvent(new MouseEvent('mouseenter', init))
  anchor.dispatchEvent(new MouseEvent('mouseover', init))
}

// ---------------------------------------------------------------------------
// Default-text inference for 'type' actions on common gloss anchors. A step can
// declare expectAction: 'type' without a literal string; the text is inferred
// from the step's anchor. A step CAN override by setting `typeText`.
// ---------------------------------------------------------------------------

function defaultTypeText(anchorId: string): string {
  // Gloss editors: type a trigger character plus a short fragment so the
  // autocomplete popup mounts. The hash form is the most broadly applicable,
  // since every persona ontology has at least one entity type to list.
  if (anchorId === 'gloss-editor' || anchorId.includes('gloss')) return '#'
  // Transcript correction types a corrected word into the segment editor.
  if (anchorId.includes('transcript')) return 'grabbed'
  // Video summary edit types a short correction.
  if (anchorId.includes('summary')) return 'behind home plate'
  return 'demo'
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Drive `step.expectAction` on `anchor`. A `'click'` action is intentionally a
 * no-op: the runner auto-advances on the visitor's real click, so simulating a
 * click would race them off the step before they read the narration.
 */
export async function simulateAction(
  step: TourStep,
  action: StepAction,
  anchor: HTMLElement,
  signal?: AbortSignal,
): Promise<void> {
  if (isAborted(signal)) return
  switch (action) {
    case 'click':
    case 'none':
      return
    case 'draw':
      await humanDraw(anchor, signal)
      return
    case 'scrub':
      await humanScrub(anchor, signal)
      return
    case 'hover':
      humanHover(anchor)
      return
    case 'type': {
      const target = findTypeTarget(anchor)
      if (!target) return
      const text = step.typeText ?? defaultTypeText(step.anchor)
      await humanType(target, text, signal)
      // Settle after the last keystroke so the autocomplete popup finishes its
      // first paint before the next step's anchor resolution begins.
      await sleep(400)
      return
    }
  }
}
