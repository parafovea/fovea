/**
 * Summary dialog and claim timestamp-capture flow for the annotation workspace.
 *
 * Wires the claim time-span capture state (the scrub-to-capture banner) from
 * the claims UI store and auto-opens the summary dialog when the workspace is
 * re-entered with a draft claim for the current video.
 *
 * @module
 */

import { useEffect } from 'react'

import { useClaimsUiStore } from '@store/zustand'
import type { TimestampCapture } from '@store/zustand/claimsUiStore'

/**
 * Inputs for {@link useSummaryFlow}.
 */
export interface UseSummaryFlowOptions {
  /** The current video ID from the route, or undefined */
  videoId: string | undefined
  /** Selects a persona in the annotation UI store */
  setSelectedPersonaId: (personaId: string | null) => void
  /** Opens or closes the video summary dialog */
  setSummaryDialogOpen: (open: boolean) => void
}

/**
 * Return shape of {@link useSummaryFlow}.
 */
export interface UseSummaryFlowResult {
  /** Active claim timestamp capture phase, or null when idle */
  timestampCapture: TimestampCapture | null
  /** Records the playhead time for the current capture phase */
  captureTimestamp: (seconds: number) => void
  /** Cancels an in-progress timestamp capture */
  cancelTimestampCapture: () => void
}

/**
 * Manages the summary dialog and claim timestamp-capture flow.
 *
 * @param options - the current video ID and the persona/summary setters to drive
 * @returns the timestamp-capture state and its capture/cancel handlers
 */
export function useSummaryFlow({
  videoId,
  setSelectedPersonaId,
  setSummaryDialogOpen,
}: UseSummaryFlowOptions): UseSummaryFlowResult {
  // Scrub timestamp capture (claim time spans). The VideoSummaryDialog gates
  // its own `open` on this state so it closes while a capture is active (the
  // player becomes reachable and the capture banner is clickable) and re-opens
  // automatically when the capture finishes — no summaryDialogOpen toggling
  // here, which previously raced and left the modal overlay intercepting the
  // banner. The banner reads the capture phase and drives capture/cancel.
  const timestampCapture = useClaimsUiStore((state) => state.timestampCapture)
  const captureTimestamp = useClaimsUiStore((state) => state.captureTimestamp)
  const cancelTimestampCapture = useClaimsUiStore((state) => state.cancelTimestampCapture)

  // Claims UI state for draft restoration
  const draftClaim = useClaimsUiStore((state) => state.draftClaim)

  // Auto-open summary dialog when returning with a draft claim
  useEffect(() => {
    if (draftClaim && draftClaim.videoId === videoId) {
      setSelectedPersonaId(draftClaim.personaId)
      setSummaryDialogOpen(true)
    }
    // setSummaryDialogOpen is a stable state setter; it is intentionally
    // excluded so the effect fires only on draft/video/persona changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftClaim, videoId, setSelectedPersonaId])

  return {
    timestampCapture,
    captureTimestamp,
    cancelTimestampCapture,
  }
}
