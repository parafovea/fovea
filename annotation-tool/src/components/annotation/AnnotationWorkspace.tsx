import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Trash2,
  Clock,
  ThumbsUp,
  Share2,
  MessageSquare,
  ExternalLink,
  Wrench,
  Search,
  ArrowLeft,
  Pencil,
  Mic,
} from 'lucide-react'
import './AnnotationWorkspace.css'
import { VideoPlayer, VideoPlayerHandle } from './VideoPlayer'
import { useExternalLinksConfig } from '@hooks/config'
import {
  useVideo,
  useWorld,
  useAnnotations,
  useSaveAnnotations,
  useDeleteAnnotation,
  useAddKeyframe,
  useRemoveKeyframe,
  useUpdateKeyframe,
  useUpdateInterpolationSegment,
  usePersonas,
  useAllPersonaOntologies,
} from '@store/queries'
import { useVideoUiStore, useAnnotationUiStore, useClaimsUiStore } from '@store/zustand'
import AnnotationOverlay from './AnnotationOverlay'
import AnnotationEditor from './AnnotationEditor'
import AnnotationAutocomplete from './AnnotationAutocomplete'
import VideoSummaryDialog from '@components/video/VideoSummaryDialog'
import { AnnotationCandidatesList } from './AnnotationCandidatesList'
import { DetectionDialog } from '@components/dialogs/DetectionDialog'
import type { DetectionRequest } from '@components/dialogs/DetectionDialog'
import { formatTimestamp } from '@utils/formatters'
import { Annotation, TypeAnnotation, ObjectAnnotation, InterpolationType, InterpolationSegment, getAnnotationTimeBounds } from '@models/types'
import { useDetectObjects } from '@store/queries/useDetection'
import { useTranscribeVideo } from '@store/queries/useTranscribe'
import { TranscriptPanel } from '@components/video/TranscriptPanel'
import type { TranscribeResponse } from '@api/client'
import { useModelConfig } from '@store/queries/useModelConfig'
import { TimelineComponent } from './TimelineComponent'
import { useCommands, useCommandContext } from '@hooks/commands'
import { useAutoSave, SaveStatusIndicator } from '@hooks/data'
import { config } from '@/config'

const DRAWER_WIDTH = 300

/**
 * Video annotation workspace providing video playback, annotation drawing, and AI-assisted analysis.
 * Supports persona-based type annotation and object linking with integrated detection and summarization.
 *
 * @returns React component rendering video player, annotation controls, and annotation list
 *
 * @example
 * ```tsx
 * <Route path="/annotate/:videoId" element={<AnnotationWorkspace />} />
 * ```
 */
export default function AnnotationWorkspace() {
  const { videoId } = useParams()
  const navigate = useNavigate()

  // TanStack Query hooks for keyframe manipulation
  const addKeyframe = useAddKeyframe()
  const removeKeyframe = useRemoveKeyframe()
  const updateKeyframe = useUpdateKeyframe()
  const updateInterpolationSegmentHook = useUpdateInterpolationSegment()

  const { data: modelConfig } = useModelConfig()
  const modelsDisabled = !modelConfig?.cudaAvailable && !modelConfig?.cpuModelsAvailable
  const videoPlayerRef = useRef<VideoPlayerHandle>(null)
  // Track the underlying <video> DOM node in state so AnnotationOverlay
  // re-renders when it mounts (refs don't trigger re-renders, so a
  // condition like `videoPlayerRef.current?.videoRef.current && <Overlay/>`
  // would only flip in if some unrelated state update happened to fire
  // afterwards — which under headless Chromium it often doesn't).
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [duration, setDuration] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null)
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false)
  const [detectionDialogOpen, setDetectionDialogOpen] = useState(false)
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false)
  const [transcriptResult, setTranscriptResult] = useState<TranscribeResponse | null>(null)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [diarizationRequested, setDiarizationRequested] = useState(true)

  // Scrub timestamp capture (claim time spans). The VideoSummaryDialog gates
  // its own `open` on this state so it closes while a capture is active (the
  // player becomes reachable and the capture banner is clickable) and re-opens
  // automatically when the capture finishes — no summaryDialogOpen toggling
  // here, which previously raced and left the modal overlay intercepting the
  // banner. The banner below reads the capture phase and drives capture/cancel.
  const timestampCapture = useClaimsUiStore((state) => state.timestampCapture)
  const captureTimestamp = useClaimsUiStore((state) => state.captureTimestamp)
  const cancelTimestampCapture = useClaimsUiStore((state) => state.cancelTimestampCapture)

  // Timeline UI state from Zustand store
  const timelineExpanded = useAnnotationUiStore(state => state.timelineExpanded)
  const setTimelineExpanded = useAnnotationUiStore(state => state.setTimelineExpanded)
  const timelineMounted = useAnnotationUiStore(state => state.timelineMounted)
  const setTimelineMounted = useAnnotationUiStore(state => state.setTimelineMounted)
  const { videoSources: allowExternalVideoLinks } = useExternalLinksConfig()

  // Delayed mount/unmount for smooth animation
  useEffect(() => {
    if (timelineExpanded) {
      // Delay mount to allow slide-in animation to start
      const timer = setTimeout(() => setTimelineMounted(true), 50)
      return () => clearTimeout(timer)
    } else {
      // Unmount after slide-out animation completes
      const timer = setTimeout(() => setTimelineMounted(false), 300)
      return () => clearTimeout(timer)
    }
  }, [timelineExpanded, setTimelineMounted])

  // TanStack Query for video data (server state)
  const { data: currentVideo = null } = useVideo(videoId)

  // TanStack Query for annotations (server state)
  const { data: videoAnnotations = [] } = useAnnotations(videoId)
  const { mutate: saveAnnotationsMutation } = useSaveAnnotations()
  const { mutate: deleteAnnotationMutation } = useDeleteAnnotation()

  // Zustand for video UI state
  const setLastAnnotation = useVideoUiStore((state) => state.setLastAnnotation)

  // Zustand for annotation UI state
  const selectedPersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)
  const annotationMode = useAnnotationUiStore((state) => state.annotationMode)
  const drawingMode = useAnnotationUiStore((state) => state.drawingMode)
  const selectedAnnotation = useAnnotationUiStore((state) => state.selectedAnnotation)
  const detectionResults = useAnnotationUiStore((state) => state.detectionResults)
  const detectionConfidenceThreshold = useAnnotationUiStore((state) => state.detectionConfidenceThreshold)
  const showDetectionCandidates = useAnnotationUiStore((state) => state.showDetectionCandidates)
  const setSelectedAnnotation = useAnnotationUiStore((state) => state.setSelectedAnnotation)
  const setAnnotationMode = useAnnotationUiStore((state) => state.setAnnotationMode)
  const setSelectedPersonaId = useAnnotationUiStore((state) => state.setSelectedPersonaId)
  const setSelectedTypeId = useAnnotationUiStore((state) => state.setSelectedTypeId)
  const setDrawingMode = useAnnotationUiStore((state) => state.setDrawingMode)
  const setDetectionResults = useAnnotationUiStore((state) => state.setDetectionResults)
  const setShowDetectionCandidates = useAnnotationUiStore((state) => state.setShowDetectionCandidates)
  const clearDetectionState = useAnnotationUiStore((state) => state.clearDetectionState)

  // Claims UI state for draft restoration
  const draftClaim = useClaimsUiStore((state) => state.draftClaim)

  // TanStack Query for persona data
  const { data: personas = [] } = usePersonas()
  const personaIds = personas.map(p => p.id)
  const { data: personaOntologies = [] } = useAllPersonaOntologies(personaIds)

  // Derived label for the persona Select trigger. shadcn/base-ui's
  // SelectValue falls back to rendering the controlled `value` prop
  // when the matching SelectItem isn't yet mounted (which happens
  // during the initial personas query — the trigger paints before
  // the dropdown). Render the resolved label explicitly so the
  // trigger never shows a UUID. Only the name lands in the trigger:
  // the role string can be a 100+ char description (e.g. "Maritime
  // safety analyst documenting cargo-handling incidents at container
  // terminals.") which spills out of the 250-px trigger container
  // and visually overlaps the adjacent Select Type / Detect Objects
  // controls in the second toolbar row. The dropdown list keeps the
  // full "name - role" label so visitors can still tell personas
  // apart on the rare occasion two share a name.
  const selectedPersonaLabel = useMemo(() => {
    if (!selectedPersonaId) return null
    const p = personas.find((p) => p.id === selectedPersonaId)
    return p ? `${p.name} (${p.role})` : null
  }, [personas, selectedPersonaId])

  // Get filtered annotations for display (by selected persona)
  const annotations = useMemo(() => {
    if (selectedPersonaId && videoAnnotations) {
      return videoAnnotations.filter(a => {
        if (a.annotationType === 'type') {
          return (a as TypeAnnotation).personaId === selectedPersonaId
        }
        return true
      })
    }
    return videoAnnotations || []
  }, [videoAnnotations, selectedPersonaId])

  // Keep Zustand selectedAnnotation in sync with TanStack cache.
  // Keyframe mutations update the cache but leave Zustand stale.
  useEffect(() => {
    if (selectedAnnotation && videoAnnotations.length > 0) {
      const cachedVersion = videoAnnotations.find(a => a.id === selectedAnnotation.id)
      if (cachedVersion && cachedVersion !== selectedAnnotation) {
        setSelectedAnnotation(cachedVersion)
      }
    }
  }, [videoAnnotations, selectedAnnotation, setSelectedAnnotation])

  // Demo deployments auto-select the first loaded fixture annotation
  // AND switch the persona dropdown to match that annotation's
  // personaId. Without the persona switch, the workspace's display
  // filter (which scopes annotations to the selected persona) would
  // hide every fixture row that doesn't belong to whatever persona
  // the visitor last opened — landing on a video with three pre-
  // tracked Spectator annotations but seeing "All Annotations (0)"
  // because the Port Safety persona is still selected from a prior
  // tour. The effect bails on tours that walk through creating a
  // FIRST annotation (no seeded rows) so the empty-canvas narration
  // still lines up with reality, and only runs under VITE_DEMO_PUBLIC.
  useEffect(() => {
    if (!config.deploymentMode.publicBooth) return
    if (videoAnnotations.length === 0) return
    const fixtureRow = videoAnnotations.find((a) => {
      // The backend's `source` flag rides through the API client's
      // transformBackendToFrontend under metadata.source — the
      // discriminated-union Annotation type does not declare
      // `source` as a top-level field but every row carries the
      // metadata bag. Match against the 'demo-fixture' prefix the
      // server seeder emits so a self-hoster with no demo seed
      // still sees their own annotations untouched.
      const src = a.metadata?.source
      return typeof src === 'string' && src.startsWith('demo-fixture')
    })
    if (!fixtureRow) return
    // Read personaId off the row regardless of whether the
    // serialised annotation uses `annotationType: 'type'` (the
    // discriminated-union shape) or the legacy `type: 'type'` shape
    // the backend route emits. Either way, the value lives on the
    // top-level personaId field.
    const fixturePersonaId =
      (fixtureRow as unknown as { personaId?: string | null }).personaId ?? null
    if (fixturePersonaId && selectedPersonaId !== fixturePersonaId) {
      setSelectedPersonaId(fixturePersonaId)
    }
    if (!selectedAnnotation) {
      setSelectedAnnotation(fixtureRow)
    }
  }, [
    videoAnnotations,
    selectedAnnotation,
    setSelectedAnnotation,
    selectedPersonaId,
    setSelectedPersonaId,
  ])


  // TanStack Query for world data
  const { data: worldData } = useWorld()
  const worldEntities = useMemo(() => worldData?.entities ?? [], [worldData?.entities])
  const worldEvents = useMemo(() => worldData?.events ?? [], [worldData?.events])
  const worldTimes = useMemo(() => worldData?.times ?? [], [worldData?.times])

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

  // Detection mutation
  const detectMutation = useDetectObjects({
    onSuccess: (data) => {
      setDetectionResults(data)
      setShowDetectionCandidates(true)
      setDetectionDialogOpen(false)
    },
    onError: (error) => {
      console.error('Detection failed:', error)
    },
  })

  // Memoize the auto-save callback to prevent cascading effect resets
  // that cause dropdown jitter when annotations exist
  const handleAutoSave = useCallback(async (annotations: Annotation[]) => {
    saveAnnotationsMutation({ videoId: videoId!, annotations })
  }, [saveAnnotationsMutation, videoId])

  // Auto-save annotations to database using useAutoSave hook
  const { saveStatus, lastSavedAt, errorMessage, retryCount, forceSave } = useAutoSave({
    data: videoAnnotations,
    isEnabled: !!videoId && videoAnnotations.length > 0,
    onSave: handleAutoSave,
    entityType: 'annotation',
    entityId: videoId,
  })

  // Helper function to get type name from typeId (for displaying human-readable names)
  const getTypeName = useCallback((annotation: TypeAnnotation): string => {
    const ontology = personaOntologies.find(o => o.personaId === annotation.personaId)
    if (!ontology) return annotation.typeId

    // Search in entities, roles, and events
    const entity = ontology.entities.find(e => e.id === annotation.typeId)
    if (entity) return entity.name

    const role = ontology.roles.find(r => r.id === annotation.typeId)
    if (role) return role.name

    const event = ontology.events.find(e => e.id === annotation.typeId)
    if (event) return event.name

    return annotation.typeId // Fallback to ID if not found
  }, [personaOntologies])

  // Helper function to get object name from linkedEntityId/linkedEventId/linkedTimeId
  const getObjectName = useCallback((annotation: ObjectAnnotation): string => {
    if (annotation.linkedEntityId) {
      const entity = worldEntities.find(e => e.id === annotation.linkedEntityId)
      return entity?.name || annotation.linkedEntityId
    }
    if (annotation.linkedEventId) {
      const event = worldEvents.find(e => e.id === annotation.linkedEventId)
      return event?.name || annotation.linkedEventId
    }
    if (annotation.linkedTimeId) {
      const time = worldTimes.find(t => t.id === annotation.linkedTimeId)
      return time?.label || annotation.linkedTimeId
    }
    return 'Object Annotation'
  }, [worldEntities, worldEvents, worldTimes])

  // Helper function to get object kind for consistent color coding
  const getObjectKind = useCallback((annotation: ObjectAnnotation): string => {
    if (annotation.linkedEntityId) return 'entity'
    if (annotation.linkedEventId) return 'event'
    if (annotation.linkedLocationId) return 'location'
    if (annotation.linkedCollectionId) return 'collection'
    return 'object'
  }, [])

  // Keyframe control callbacks
  const handleAddKeyframe = useCallback(async () => {
    if (!selectedAnnotation) return

    // Get current box from annotation sequence (interpolated or existing)
    const allBoxes = selectedAnnotation.boundingBoxSequence?.boxes || []
    let currentBox = allBoxes.find(b => b.frameNumber === currentFrame)

    // If no box exists at current frame, compute interpolated position
    if (!currentBox) {
      const keyframes = allBoxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)
      if (keyframes.length === 0) return

      // Find surrounding keyframes
      const prevKeyframes = keyframes.filter(k => k.frameNumber < currentFrame)
      const nextKeyframes = keyframes.filter(k => k.frameNumber > currentFrame)

      if (prevKeyframes.length === 0 && nextKeyframes.length === 0) return

      // Use nearest keyframe or interpolate
      if (prevKeyframes.length === 0) {
        currentBox = { ...nextKeyframes[0], frameNumber: currentFrame }
      } else if (nextKeyframes.length === 0) {
        currentBox = { ...prevKeyframes[prevKeyframes.length - 1], frameNumber: currentFrame }
      } else {
        // Linear interpolation
        const prev = prevKeyframes[prevKeyframes.length - 1]
        const next = nextKeyframes[0]
        const t = (currentFrame - prev.frameNumber) / (next.frameNumber - prev.frameNumber)
        currentBox = {
          x: prev.x + (next.x - prev.x) * t,
          y: prev.y + (next.y - prev.y) * t,
          width: prev.width + (next.width - prev.width) * t,
          height: prev.height + (next.height - prev.height) * t,
          frameNumber: currentFrame,
        }
      }
    }

    addKeyframe({
      videoId: selectedAnnotation.videoId,
      annotationId: selectedAnnotation.id,
      frameNumber: currentFrame,
      box: currentBox,
      fps: currentVideo?.fps || 30,
    })
    // Save immediately after keyframe operation
    await forceSave()
  }, [selectedAnnotation, currentFrame, currentVideo, addKeyframe, forceSave])

  const handleDeleteKeyframe = useCallback(async () => {
    if (!selectedAnnotation) return

    removeKeyframe({
      videoId: selectedAnnotation.videoId,
      annotationId: selectedAnnotation.id,
      frameNumber: currentFrame,
      fps: currentVideo?.fps || 30,
    })
    // Save immediately after keyframe operation
    await forceSave()
  }, [selectedAnnotation, currentFrame, currentVideo, removeKeyframe, forceSave])

  const handleCopyPreviousFrame = useCallback(async () => {
    if (!selectedAnnotation) return

    const allBoxes = selectedAnnotation.boundingBoxSequence?.boxes || []
    const keyframes = allBoxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)

    // Find nearest previous keyframe
    const prevKeyframes = keyframes.filter(k => k.frameNumber < currentFrame)
    if (prevKeyframes.length === 0) {
      return
    }

    const prevBox = prevKeyframes[prevKeyframes.length - 1]

    const isCurrentKeyframe = keyframes.some(k => k.frameNumber === currentFrame)

    if (isCurrentKeyframe) {
      updateKeyframe({
        videoId: selectedAnnotation.videoId,
        annotationId: selectedAnnotation.id,
        frameNumber: currentFrame,
        box: { ...prevBox, frameNumber: currentFrame },
      })
    } else {
      addKeyframe({
        videoId: selectedAnnotation.videoId,
        annotationId: selectedAnnotation.id,
        frameNumber: currentFrame,
        box: { ...prevBox, frameNumber: currentFrame },
        fps: currentVideo?.fps || 30,
      })
    }
    // Save immediately after keyframe operation
    await forceSave()
  }, [selectedAnnotation, currentFrame, currentVideo, addKeyframe, updateKeyframe, forceSave])

  const handleUpdateInterpolationSegment = useCallback(
    async (segmentIndex: number, type: InterpolationType, controlPoints?: InterpolationSegment['controlPoints']) => {
      if (!selectedAnnotation) return

      updateInterpolationSegmentHook({
        videoId: selectedAnnotation.videoId,
        annotationId: selectedAnnotation.id,
        segmentIndex,
        interpolationType: type,
        controlPoints,
      })
      // Save immediately after interpolation change
      await forceSave()
    },
    [selectedAnnotation, updateInterpolationSegmentHook, forceSave]
  )

  // Track this as the last annotation when we load the component
  useEffect(() => {
    if (videoId) {
      setLastAnnotation(videoId, Date.now())
    }
  }, [videoId, setLastAnnotation])

  // Auto-open summary dialog when returning with a draft claim
  useEffect(() => {
    if (draftClaim && draftClaim.videoId === videoId) {
      setSelectedPersonaId(draftClaim.personaId)
      setSummaryDialogOpen(true)
    }
  }, [draftClaim, videoId, setSelectedPersonaId])

  // Note: Annotations are automatically loaded via useAnnotations() TanStack Query hook

  // Set command context for when clauses
  useCommandContext({
    annotationWorkspaceActive: true,
    ontologyWorkspaceActive: false,
    objectWorkspaceActive: false,
    videoBrowserActive: false,
    dialogOpen: editorOpen || summaryDialogOpen || detectionDialogOpen,
    inputFocused: false, // Updated dynamically by focus events
    annotationSelected: !!selectedAnnotation,
    keyframeSelected: !!selectedAnnotation && (selectedAnnotation.boundingBoxSequence?.boxes.filter(
      b => b.isKeyframe || b.isKeyframe === undefined
    ) || []).some(kf => kf.frameNumber === currentFrame),
    hasKeyframes: !!selectedAnnotation && (selectedAnnotation.boundingBoxSequence?.boxes.filter(
      b => b.isKeyframe || b.isKeyframe === undefined
    ) || []).length > 0,
    timelineVisible: timelineExpanded,
    drawingMode: !!drawingMode,
  })

  // Register command handlers
  useCommands({
    'timeline.toggle': () => {
      setTimelineExpanded(!timelineExpanded)
    },
    'video.playPause': () => {
      videoPlayerRef.current?.handlePlayPause()
    },
    'video.nextFrame': () => {
      videoPlayerRef.current?.handleNextFrame()
    },
    'video.previousFrame': () => {
      videoPlayerRef.current?.handlePrevFrame()
    },
    'video.nextFrame10': () => {
      videoPlayerRef.current?.handleNextFrame10()
    },
    'video.previousFrame10': () => {
      videoPlayerRef.current?.handlePrevFrame10()
    },
    'video.jumpToStart': () => {
      videoPlayerRef.current?.handleJumpToStart()
    },
    'video.jumpToEnd': () => {
      videoPlayerRef.current?.handleJumpToEnd()
    },
    'annotation.addKeyframe': () => {
      handleAddKeyframe()
    },
    'annotation.copyPreviousKeyframe': () => {
      handleCopyPreviousFrame()
    },
    'annotation.deleteKeyframe': () => {
      handleDeleteKeyframe()
    },
  }, {
    context: 'annotationWorkspace',
    enabled: true,
    enableOnFormTags: false
  })

  // Note: Video metadata is loaded via useVideo() TanStack Query hook (see line 139)
  // The hook automatically fetches and caches video data when videoId changes

  /**
   * Selects an annotation and seeks video to its start time.
   * Highlights the annotation in the sidebar and moves playhead to annotation start.
   */
  const handleAnnotationClick = (annotation: Annotation) => {
    // If already selected, don't seek to start
    if (selectedAnnotation?.id === annotation.id) return

    // Select the annotation
    setSelectedAnnotation(annotation)

    // Seek video to start of annotation
    const bounds = getAnnotationTimeBounds(annotation, currentVideo?.fps || 30)
    if (videoPlayerRef.current && bounds) {
      videoPlayerRef.current.handleSeek(bounds.startTime)
    }
  }

  /**
   * Formats video time using the video player's formatTime function.
   */
  const formatTime = (seconds: number) => {
    return videoPlayerRef.current?.formatTime(seconds) || '0:00.00'
  }

  /**
   * Navigates to the persona builder and saves current annotation context.
   * Stores the current video ID and timestamp for resuming annotation later.
   */
  const handleGoToOntology = () => {
    // Save current annotation state before navigating
    if (videoId) {
      setLastAnnotation(videoId, currentTime)
    }
    navigate('/ontology')
  }


  /**
   * Initiates object detection request using AI model.
   * Triggers detection mutation and opens results dialog on success.
   *
   * @param request - Detection parameters including video ID, query, frames, and options
   */
  const handleRunDetection = (request: DetectionRequest) => {
    detectMutation.mutate(request)
  }

  /**
   * Sorts annotations by start time for chronological display.
   * Memoized to avoid re-sorting on every render.
   *
   * @returns Array of annotations sorted by start time in ascending order
   */
  const fps = currentVideo?.fps || 30
  const sortedAnnotations = useMemo(() =>
    [...annotations].sort((a, b) => {
      const boundsA = getAnnotationTimeBounds(a, fps)
      const boundsB = getAnnotationTimeBounds(b, fps)
      if (!boundsA || !boundsB) return 0
      return boundsA.startTime - boundsB.startTime
    }),
    [annotations, fps]
  )

  /**
   * Checks if an annotation is active at the current video time.
   * Used to highlight annotations in the sidebar during playback.
   *
   * @param annotation - Annotation with bounding box sequence
   * @returns True if current time falls within annotation's time bounds
   */
  const isAnnotationActive = (annotation: Annotation) => {
    const bounds = getAnnotationTimeBounds(annotation, fps)
    return bounds && bounds.startTime <= currentTime && bounds.endTime >= currentTime
  }

  /**
   * Returns badge variant for annotation type category.
   */
  const getTypeCategoryVariant = (category: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (category === 'entity') return 'default'
    if (category === 'role') return 'secondary'
    return 'outline'
  }

  /**
   * Returns badge variant for object annotation kind.
   */
  const getObjectKindVariant = (objAnn: ObjectAnnotation): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (objAnn.linkedEntityId) return 'default'
    if (objAnn.linkedEventId) return 'outline'
    if (objAnn.linkedLocationId) return 'secondary'
    return 'destructive' // collections
  }

  return (
    <div className="flex h-full">
      {timestampCapture && (
        <div
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-primary px-4 py-2 text-primary-foreground shadow-md"
          data-testid="timestamp-capture-banner"
        >
          <span className="text-sm font-medium">
            Scrub the video to the {timestampCapture.phase} of the span, then capture.
          </span>
          <Button
            variant="secondary"
            size="sm"
            data-testid="timestamp-capture-confirm"
            onClick={() => captureTimestamp(videoPlayerRef.current?.currentTime ?? currentTime)}
          >
            Capture {timestampCapture.phase} ({(videoPlayerRef.current?.currentTime ?? currentTime).toFixed(1)}s)
          </Button>
          <Button variant="ghost" size="sm" onClick={cancelTimestampCapture} data-testid="timestamp-capture-cancel">
            Cancel
          </Button>
        </div>
      )}
      <div className="flex-1 flex flex-col">
        <div className="rounded-lg ring-1 ring-foreground/10 bg-card p-4 mb-4 shadow-sm">
          <div className="flex flex-col gap-2">
            {/* Back button and uploader as main title */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => navigate('/')}
                aria-label="Back to video browser"
                className="shrink-0"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <h2 className="text-xl font-semibold">
                {currentVideo?.uploader || currentVideo?.uploaderId || 'Loading...'}
                {currentVideo?.uploaderId && (
                  <>
                    {' '}(
                    {allowExternalVideoLinks && currentVideo?.uploaderUrl ? (
                      <a
                        href={currentVideo.uploaderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        @{currentVideo.uploaderId}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">
                        @{currentVideo.uploaderId}
                      </span>
                    )}
                    )
                  </>
                )}
              </h2>
            </div>

            {/* Description */}
            {currentVideo?.description && (
              <p className="text-sm">
                {currentVideo.description}
              </p>
            )}

            {/* Metadata Row */}
            <div className="flex items-center gap-4">
              {/* Timestamp */}
              {currentVideo?.timestamp && (
                <div className="flex items-center gap-1">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(currentVideo.timestamp)}
                  </span>
                </div>
              )}

              {/* Engagement Metrics */}
              {currentVideo && (currentVideo.likeCount || currentVideo.repostCount || currentVideo.commentCount) && (
                <>
                  {currentVideo.likeCount !== undefined && (
                    <div className="flex items-center gap-1">
                      <ThumbsUp className="size-4 text-muted-foreground" />
                      <span className="text-xs">{currentVideo.likeCount.toLocaleString()}</span>
                    </div>
                  )}
                  {currentVideo.repostCount !== undefined && (
                    <div className="flex items-center gap-1">
                      <Share2 className="size-4 text-muted-foreground" />
                      <span className="text-xs">{currentVideo.repostCount.toLocaleString()}</span>
                    </div>
                  )}
                  {currentVideo.commentCount !== undefined && (
                    <div className="flex items-center gap-1">
                      <MessageSquare className="size-4 text-muted-foreground" />
                      <span className="text-xs">{currentVideo.commentCount.toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}

              {/* Source Link */}
              {currentVideo?.webpageUrl && (
                allowExternalVideoLinks ? (
                  <Button
                    size="sm"
                    render={
                      <a
                        href={currentVideo.webpageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    <ExternalLink className="size-4 mr-1" />
                    View Original
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger render={<span />}>
                      <Button
                        size="sm"
                        disabled
                      >
                        <ExternalLink className="size-4 mr-1" />
                        View Original
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>External video source links are disabled</TooltipContent>
                  </Tooltip>
                )
              )}

              {/* Auto-save status indicator */}
              <div className="ml-auto">
                <SaveStatusIndicator
                  status={saveStatus}
                  lastSavedAt={lastSavedAt}
                  errorMessage={errorMessage}
                  retryCount={retryCount}
                  onRetry={forceSave}
                  compact
                />
              </div>
            </div>
          </div>
        </div>

        <VideoPlayer
          ref={videoPlayerRef}
          videoId={videoId}
          videoMetadata={currentVideo}
          onTimeUpdate={setCurrentTime}
          onFrameChange={setCurrentFrame}
          onDurationChange={setDuration}
          onVideoElementChange={setVideoElement}
        >
          {currentVideo && videoElement && (
            <AnnotationOverlay
              videoElement={videoElement}
              currentTime={currentTime}
              videoWidth={videoElement.videoWidth || currentVideo.width}
              videoHeight={videoElement.videoHeight || currentVideo.height}
              videoFps={currentVideo.fps || 30}
              detectionResults={detectionResults}
              onAnnotationEditComplete={forceSave}
            />
          )}
        </VideoPlayer>

        <div className="rounded-lg ring-1 ring-foreground/10 bg-card p-4 mt-4 shadow-sm">
          {/* Container for sliding panels */}
          <div data-testid="dynamic-controls-wrapper" className="relative overflow-hidden" style={{ minHeight: '140px' }}>
            {/* Standard Controls Panel - slides left */}
            <div
              data-testid="standard-controls-panel"
              className="absolute top-0 left-0 right-0 transition-all duration-300 ease-in-out"
              style={{
                transform: timelineExpanded ? 'translateX(-100%)' : 'translateX(0)',
                opacity: timelineExpanded ? 0 : 1,
                pointerEvents: timelineExpanded ? 'none' : 'auto',
              }}
            >
              {/* Playback Controls Row */}
              <div className="flex items-center gap-2 mb-4">
                {/* Mode Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Mode:</span>
                  <ToggleGroup
                    value={[annotationMode]}
                    onValueChange={(newValue) => {
                      // base-ui ToggleGroup gives us the full array of pressed values
                      const newMode = newValue[newValue.length - 1]
                      if (newMode) {
                        setAnnotationMode(newMode as 'type' | 'object')
                        if (newMode === 'object') {
                          setSelectedPersonaId(null)
                        }
                      }
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <ToggleGroupItem value="type" data-tour-id="event-annotation-button">
                      Type
                    </ToggleGroupItem>
                    <ToggleGroupItem value="object">
                      Object
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <Separator orientation="vertical" className="mx-1 h-6" />

                {/* Play/pause controls */}
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => videoPlayerRef.current?.handlePlayPause()} aria-label={videoPlayerRef.current?.isPlaying ? "Pause video" : "Play video"} />}>
                      {videoPlayerRef.current?.isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </TooltipTrigger>
                    <TooltipContent>{videoPlayerRef.current?.isPlaying ? 'Pause (Space)' : 'Play (Space)'}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => videoPlayerRef.current?.handlePrevFrame()} aria-label="Previous frame" />}>
                      <SkipBack className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent>Previous frame (Left)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => videoPlayerRef.current?.handleNextFrame()} aria-label="Next frame" />}>
                      <SkipForward className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent>Next frame (Right)</TooltipContent>
                  </Tooltip>
                </div>

                {/* Time slider */}
                <div className="flex-1 px-2">
                  <Slider
                    value={[currentTime]}
                    max={duration}
                    onValueChange={(v) => { const val = Array.isArray(v) ? v[0] : v;
                      videoPlayerRef.current?.handleSeek(val)
                    }}
                  />
                </div>

                {/* Current time display */}
                <Badge variant="outline" className="font-mono text-xs">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </Badge>

                <Separator orientation="vertical" className="mx-1 h-6" />

                {/* Timeline Toggle Button */}
                <Button
                  variant={timelineExpanded ? 'default' : 'outline'}
                  onClick={() => setTimelineExpanded(!timelineExpanded)}
                  size="sm"
                  data-tour-id="show-timeline-button"
                >
                  {timelineExpanded ? 'Hide Timeline' : 'Show Timeline'}
                </Button>
              </div>

              {/* Second Row: Persona Selector and Type/Object Selection */}
              <div className="flex items-center gap-4">
                {/* Persona Selector — fixed width + min-w-0 so the
                    flex parent can shrink it instead of letting an
                    overflowing trigger label push the adjacent
                    type-picker and action buttons under each other,
                    which is the overlap mode the toolbar screenshot
                    from 2026-06-06 caught. */}
                <div className="w-[250px] shrink-0 min-w-0">
                  <Select
                    value={selectedPersonaId || ''}
                    onValueChange={(val) => setSelectedPersonaId(val || null)}
                    disabled={annotationMode === 'object'}
                  >
                    <SelectTrigger
                      aria-label="Select Persona"
                      className="w-full truncate [&>span]:truncate [&>span]:block [&>span]:overflow-hidden"
                    >
                      {/*
                        The base-ui Select trigger renders the
                        controlled `value` prop verbatim whenever the
                        SelectValue children resolve to null /
                        undefined — which is exactly what happens
                        during the (often-slow) initial /api/personas
                        round-trip, when `personas` is still empty
                        and selectedPersonaLabel is null. The
                        observable failure mode is a UUID showing up
                        as the displayed persona name on first paint
                        (the bug from 2026-06-05 the screenshot
                        flagged). Force the trigger to show the
                        placeholder text instead until the resolved
                        label is ready, so a raw UUID can never be
                        the persona dropdown's visible label.
                      */}
                      <SelectValue placeholder="Select Persona">
                        {selectedPersonaLabel || 'Select Persona'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">
                        <em>None</em>
                      </SelectItem>
                      {personas.map((persona) => (
                        <SelectItem key={persona.id} value={persona.id}>
                          {persona.name} ({persona.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Type/Object Selection */}
                {(annotationMode === 'type' || annotationMode === 'object') && (
                  // Tour 1 step 5 ("assign type") spotlights this
                  // wrapper. The autocomplete is always mounted in
                  // 'type' / 'object' annotation modes (default
                  // 'type' on workspace entry) so the anchor is
                  // available the moment the annotate route paints —
                  // no drawing, dialog open, or sidebar selection
                  // needed.
                  <div className="flex-1 max-w-[400px]" data-tour-id="type-assignment-picker">
                    <AnnotationAutocomplete
                      mode={annotationMode}
                      personaId={selectedPersonaId}
                      onSelect={(option) => {
                        if (option) {
                          if (annotationMode === 'type') {
                            const drawMode = option.type as 'entity' | 'role' | 'event'
                            setSelectedTypeId(option.id)
                            setDrawingMode(drawMode)
                          } else {
                            setDrawingMode('entity')
                          }
                        } else {
                          setSelectedTypeId(null)
                          setDrawingMode(null)
                        }
                      }}
                      disabled={annotationMode === 'type' && !selectedPersonaId}
                    />
                  </div>
                )}

                {/* Right-aligned action buttons */}
                <div className="ml-auto flex gap-2">
                  {/* Detect Objects Button */}
                  {currentVideo && videoId && (
                    <Tooltip>
                      <TooltipTrigger render={<span />}>
                        <Button
                          variant="outline"
                          onClick={() => setDetectionDialogOpen(true)}
                          size="sm"
                          disabled={modelsDisabled}
                          data-tour-id="detect-objects-button"
                        >
                          <Search className="size-4 mr-1" />
                          Detect Objects
                        </Button>
                      </TooltipTrigger>
                      {modelsDisabled && (
                        <TooltipContent>No AI models available for object detection</TooltipContent>
                      )}
                    </Tooltip>
                  )}

                  {/* Transcribe Audio Button — render as soon as the
                      workspace mounts (videoId comes from the URL) so
                      tour anchors targeting the toolbar stay stable
                      across the video-metadata fetch window. Disable
                      until currentVideo resolves; an undefined videoId
                      (an /app/annotate/ visit without a parameter)
                      still gates the button entirely. */}
                  {videoId && (
                    <Tooltip>
                      <TooltipTrigger render={<span />}>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTranscriptError(null)
                            transcribeMutation.mutate({
                              videoId,
                              enableDiarization: diarizationRequested,
                            })
                          }}
                          size="sm"
                          disabled={transcribeMutation.isPending || !currentVideo || modelsDisabled}
                          data-testid="transcribe-audio-button"
                          data-tour-id="transcribe-audio-button"
                        >
                          <Mic className="size-4 mr-1" />
                          {transcribeMutation.isPending ? 'Transcribing…' : 'Transcribe Audio'}
                        </Button>
                      </TooltipTrigger>
                      {modelsDisabled && (
                        <TooltipContent>
                          This deployment has no model service. Audio transcription is unavailable.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  )}

                  {/* Video Summary Button */}
                  {currentVideo && videoId && (
                    <Button
                      variant="outline"
                      onClick={() => setSummaryDialogOpen(true)}
                      size="sm"
                      data-tour-id="edit-summary-button"
                    >
                      <Pencil className="size-4 mr-1" />
                      Edit Summary
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Timeline Panel - slides in from right to replace standard controls */}
            <div
              data-testid="timeline-panel"
              data-tour-id="timeline-panel"
              className="absolute top-0 left-0 right-0 transition-all duration-300 ease-in-out"
              style={{
                transform: timelineExpanded ? 'translateX(0)' : 'translateX(100%)',
                opacity: timelineExpanded ? 1 : 0,
                pointerEvents: timelineExpanded ? 'auto' : 'none',
                visibility: timelineExpanded ? 'visible' : 'hidden',
              }}
            >
              {timelineMounted && (
                <TimelineComponent
                  annotation={selectedAnnotation}
                  annotations={annotations}
                  currentFrame={currentFrame}
                  totalFrames={videoPlayerRef.current?.totalFrames || 0}
                  videoFps={currentVideo?.fps || 30}
                  onSeek={(frameNumber) => {
                    if (videoPlayerRef.current) {
                      const fps = currentVideo?.fps || 30
                      const newTime = frameNumber / fps
                      videoPlayerRef.current.handleSeek(newTime)
                    }
                  }}
                  onAnnotationSelect={setSelectedAnnotation}
                  videoRef={videoPlayerRef.current?.videoRef}
                  onAddKeyframe={handleAddKeyframe}
                  onDeleteKeyframe={handleDeleteKeyframe}
                  onCopyPreviousFrame={handleCopyPreviousFrame}
                  onUpdateInterpolationSegment={handleUpdateInterpolationSegment}
                  onClose={() => setTimelineExpanded(false)}
                />
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Right sidebar (replacing MUI Drawer) */}
      <div
        className="shrink-0 border-l border-border bg-card overflow-hidden"
        style={{ width: DRAWER_WIDTH }}
      >
        {/* Spacer for toolbar height */}
        <div className="h-16" />
        <div className="overflow-auto p-4" data-tour-id="role-assignment-panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">
              All Annotations ({sortedAnnotations.length})
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Click to seek, double-click to edit
          </p>
          <ul className="divide-y">
            {sortedAnnotations.length === 0 && (
              <li className="py-2">
                <p className="text-sm text-muted-foreground text-center">
                  No annotations yet. Select a mode above and draw on the video.
                </p>
              </li>
            )}
            {sortedAnnotations.map((annotation, index) => {
              const isActive = isAnnotationActive(annotation)
              const isSelected = selectedAnnotation?.id === annotation.id

              return (
                <li
                  key={annotation.id}
                  data-tour-id={index === 0 ? 'annotation-list-first' : undefined}
                  className={`flex items-start justify-between py-2 px-2 cursor-pointer rounded-sm transition-colors ${
                    isSelected ? 'bg-accent ring-1 ring-primary/30' : isActive ? 'bg-muted' : 'hover:bg-muted'
                  }`}
                  style={{
                    borderLeft: (isSelected || isActive) ? '3px solid hsl(var(--primary))' : '3px solid transparent',
                  }}
                  onClick={() => handleAnnotationClick(annotation)}
                  onDoubleClick={() => {
                    setEditingAnnotation(annotation)
                    setEditorOpen(true)
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {annotation.annotationType === 'type' && (
                        <>
                          <Badge
                            variant={getTypeCategoryVariant(annotation.typeCategory)}
                            className="text-[0.75rem] h-5"
                          >
                            {annotation.typeCategory}
                          </Badge>
                          <span className="text-sm truncate">
                            {getTypeName(annotation as TypeAnnotation)}
                          </span>
                        </>
                      )}
                      {annotation.annotationType === 'object' && (() => {
                        const objAnn = annotation as ObjectAnnotation
                        return (
                          <>
                            <Badge
                              variant={getObjectKindVariant(objAnn)}
                              className="text-[0.75rem] h-5"
                            >
                              {getObjectKind(objAnn)}
                            </Badge>
                            <span className="text-sm font-semibold truncate">
                              {getObjectName(objAnn)}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                    <div>
                      {(() => {
                        const bounds = getAnnotationTimeBounds(annotation, fps)
                        return bounds && (
                          <span className="text-xs text-muted-foreground">
                            {formatTime(bounds.startTime)} → {formatTime(bounds.endTime)}
                          </span>
                        )
                      })()}
                      {annotation.notes && (
                        <p className="text-xs text-muted-foreground italic">
                          {annotation.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteAnnotationMutation({ videoId: videoId || '', annotationId: annotation.id })
                    }}
                    aria-label="Delete annotation"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <AnnotationEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditingAnnotation(null)
        }}
        annotation={editingAnnotation}
        videoFps={currentVideo?.fps}
      />

      {/* Video Summary Dialog */}
      {videoId && (
        <VideoSummaryDialog
          open={summaryDialogOpen}
          onClose={() => setSummaryDialogOpen(false)}
          videoId={videoId}
          initialPersonaId={selectedPersonaId}
        />
      )}

      {/* Detection Dialog */}
      {videoId && currentVideo && (
        <DetectionDialog
          open={detectionDialogOpen}
          onClose={() => setDetectionDialogOpen(false)}
          onDetect={handleRunDetection}
          videoId={videoId}
          currentTime={currentTime}
          duration={duration}
          fps={currentVideo.fps || 30}
          isLoading={detectMutation.isPending}
          error={detectMutation.isError ? detectMutation.error.message : null}
        />
      )}

      {/* Detection Candidates Dialog */}
      {detectionResults && showDetectionCandidates && videoId && (
        <Dialog open={showDetectionCandidates} onOpenChange={(isOpen) => { if (!isOpen) setShowDetectionCandidates(false) }}>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Detection Results
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Found {detectionResults.totalDetections} objects for query: "{detectionResults.query}"
              </p>
            </DialogHeader>
            <AnnotationCandidatesList
              videoId={videoId}
              frames={detectionResults.frames}
              personaId={annotationMode === 'type' ? selectedPersonaId || undefined : undefined}
              typeId={annotationMode === 'type' ? undefined : undefined}
              typeCategory={annotationMode === 'type' ? 'entity' : undefined}
              initialConfidenceThreshold={detectionConfidenceThreshold}
            />
            <DialogFooter>
              <Button onClick={() => {
                setShowDetectionCandidates(false)
                clearDetectionState()
              }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Transcript Dialog */}
      <Dialog open={transcriptDialogOpen} onOpenChange={setTranscriptDialogOpen}>
        <DialogContent className="sm:max-w-3xl" data-testid="transcript-dialog" data-tour-id="transcript-dialog">
          <DialogHeader>
            <DialogTitle>Audio Transcript</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto pr-1" data-testid="transcript-body">
            {transcriptError ? (
              <p className="text-sm text-destructive">{transcriptError}</p>
            ) : transcriptResult && transcriptResult.segments.length > 0 ? (
              <TranscriptPanel
                segments={transcriptResult.segments}
                speakers={transcriptResult.speakers}
                language={transcriptResult.language}
                modelUsed={transcriptResult.modelUsed}
                diarizationModelUsed={transcriptResult.diarizationModelUsed}
                processingTime={transcriptResult.processingTime}
                diarizationProcessingTime={transcriptResult.diarizationProcessingTime}
                duration={transcriptResult.duration}
                currentTime={currentTime}
                onSeek={(t) => videoPlayerRef.current?.handleSeek(t)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No transcript segments returned.</p>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={diarizationRequested}
                onChange={(e) => setDiarizationRequested(e.target.checked)}
                data-testid="transcribe-diarize-toggle"
              />
              Identify speakers
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!videoId) return
                  setTranscriptError(null)
                  transcribeMutation.mutate({
                    videoId,
                    enableDiarization: diarizationRequested,
                  })
                }}
                disabled={transcribeMutation.isPending}
                data-testid="transcript-rerun-button"
              >
                {transcribeMutation.isPending ? 'Re-running…' : 'Re-run'}
              </Button>
              <Button onClick={() => setTranscriptDialogOpen(false)}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Action Button to go to Ontology */}
      <div role="complementary" aria-label="Quick actions">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="lg"
                aria-label="go to ontology"
                onClick={handleGoToOntology}
                className="fixed bottom-6 right-6 z-[1000] rounded-full size-14 shadow-lg"
              />
            }
          >
            <Wrench className="size-6" />
          </TooltipTrigger>
          <TooltipContent side="left">Go to Persona Builder (P)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
