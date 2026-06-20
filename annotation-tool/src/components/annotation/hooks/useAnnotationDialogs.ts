/**
 * Modal and dialog state for the annotation workspace.
 *
 * Owns the editor, summary, detection, and transcript dialog flags plus the
 * transcript/diarization request flow. The transcription mutation writes its
 * result (or error) into local state and opens the transcript dialog so the
 * JSX renders the panel verbatim.
 *
 * @module
 */

import { useState } from 'react'

import { useTranscribeVideo } from '@store/queries/useTranscribe'
import type { TranscribeResponse } from '@api/client'
import type { Annotation } from '@models/types'

/**
 * Return shape of {@link useAnnotationDialogs}.
 */
export interface UseAnnotationDialogsResult {
  /** Whether the annotation editor dialog is open */
  editorOpen: boolean
  /** Setter for the annotation editor open flag */
  setEditorOpen: (open: boolean) => void
  /** The annotation currently being edited, or null */
  editingAnnotation: Annotation | null
  /** Setter for the annotation currently being edited */
  setEditingAnnotation: (annotation: Annotation | null) => void
  /** Whether the video summary dialog is open */
  summaryDialogOpen: boolean
  /** Setter for the video summary dialog open flag */
  setSummaryDialogOpen: (open: boolean) => void
  /** Whether the object detection request dialog is open */
  detectionDialogOpen: boolean
  /** Setter for the detection dialog open flag */
  setDetectionDialogOpen: (open: boolean) => void
  /** Whether the transcript dialog is open */
  transcriptDialogOpen: boolean
  /** Setter for the transcript dialog open flag */
  setTranscriptDialogOpen: (open: boolean) => void
  /** The most recent transcription result, or null */
  transcriptResult: TranscribeResponse | null
  /** Setter for the transcription result */
  setTranscriptResult: (result: TranscribeResponse | null) => void
  /** The most recent transcription error message, or null */
  transcriptError: string | null
  /** Setter for the transcription error message */
  setTranscriptError: (error: string | null) => void
  /** Whether speaker diarization is requested for transcription */
  diarizationRequested: boolean
  /** Setter for the diarization request flag */
  setDiarizationRequested: (requested: boolean) => void
  /** The transcription mutation (mutate, isPending, ...) */
  transcribeMutation: ReturnType<typeof useTranscribeVideo>
}

/**
 * Manages the modal and dialog state for the annotation workspace.
 *
 * @returns dialog open flags, transcript state, and the transcription mutation
 */
export function useAnnotationDialogs(): UseAnnotationDialogsResult {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null)
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false)
  const [detectionDialogOpen, setDetectionDialogOpen] = useState(false)
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false)
  const [transcriptResult, setTranscriptResult] = useState<TranscribeResponse | null>(null)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [diarizationRequested, setDiarizationRequested] = useState(true)

  // Transcription mutation. The backend response already carries the
  // optional diarization fields (speakers + per-segment speaker), so
  // the result is forwarded to TranscriptPanel verbatim.
  const transcribeMutation = useTranscribeVideo({
    onSuccess: (data) => {
      setTranscriptResult(data)
      setTranscriptError(null)
      setTranscriptDialogOpen(true)
    },
    onError: (error) => {
      setTranscriptError(error.message)
      setTranscriptDialogOpen(true)
    },
  })

  return {
    editorOpen,
    setEditorOpen,
    editingAnnotation,
    setEditingAnnotation,
    summaryDialogOpen,
    setSummaryDialogOpen,
    detectionDialogOpen,
    setDetectionDialogOpen,
    transcriptDialogOpen,
    setTranscriptDialogOpen,
    transcriptResult,
    setTranscriptResult,
    transcriptError,
    setTranscriptError,
    diarizationRequested,
    setDiarizationRequested,
    transcribeMutation,
  }
}
