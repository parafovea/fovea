/**
 * SMPTE-style timecode formatting.
 *
 * The timeline's transport readout mirrors the convention used by every
 * professional video editor: ``HH:MM:SS:FF`` where ``FF`` is the frame
 * number within the current second (0-indexed up to ``videoFps - 1``).
 *
 * Frame-only readouts (e.g. during scrub) also use zero-padded numbers so
 * the character count stays stable and the UI doesn't jitter as the user
 * drags the playhead.
 */

/**
 * Format an absolute frame number as SMPTE ``HH:MM:SS:FF``.
 *
 * Negative frames collapse to ``00:00:00:00`` — we treat the start-of-video
 * as a hard floor; the timeline prevents navigation past it anyway, this
 * is just a defense against transient arithmetic during drag.
 */
export function formatTimecode(frame: number, fps: number): string {
  if (!Number.isFinite(frame) || frame < 0 || !Number.isFinite(fps) || fps <= 0) {
    return '00:00:00:00'
  }
  const totalSeconds = Math.floor(frame / fps)
  const frames = Math.floor(frame % fps)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(minutes).padStart(2, '0') +
    ':' +
    String(seconds).padStart(2, '0') +
    ':' +
    String(frames).padStart(2, '0')
  )
}

/**
 * Format a frame number as a compact ruler label.
 *
 * For low zoom levels where major ticks are far apart we print full
 * timecode; at higher zoom we drop the hour field. The goal is to keep
 * each label under ~6 characters so neighbouring labels don't collide.
 */
export function formatRulerLabel(frame: number, fps: number, majorTickInterval: number): string {
  if (majorTickInterval < fps) {
    // Sub-second granularity: print SS:FF only.
    const seconds = Math.floor(frame / fps)
    const frames = Math.floor(frame % fps)
    return `${seconds}:${String(frames).padStart(2, '0')}`
  }
  if (majorTickInterval < fps * 60) {
    // Sub-minute granularity: MM:SS.
    const totalSeconds = Math.floor(frame / fps)
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60)
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }
  return formatTimecode(frame, fps)
}
