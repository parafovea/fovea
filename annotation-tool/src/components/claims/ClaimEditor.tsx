import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { Info, Clock, Crosshair, X } from 'lucide-react'

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Claim, GlossItem, ClaimerType, ClaimTimeSpan } from '@models/types'
import { getAnnotationTimeBounds } from '@models/annotation'
import GlossEditor from '@components/ontology/GlossEditor'
import { useClaims, useEvents, useTimes, useEntities, usePersonaOntology, useAnnotations, useVideos } from '@store/queries'
import { glossToText } from '@/utils/glossUtils'
import { logWarning } from '@services/errorLogging'
import { useClaimsUiStore } from '@store/zustand/claimsUiStore'

/** Format seconds as m:ss.t for time-span chips. */
function formatTimeSpanSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

interface ClaimEditorProps {
  open: boolean
  onClose: () => void
  onSave: (claim: Partial<Claim>) => void
  claim?: Claim // Undefined = create, defined = edit
  summaryId: string
  personaId?: string
  videoId?: string
  parentClaimId?: string // For creating subclaims
}

export function ClaimEditor({
  open,
  onClose,
  onSave,
  claim,
  summaryId,
  personaId,
  videoId,
  parentClaimId,
}: ClaimEditorProps) {
  // Fetch sibling claims for $ references
  const { data: existingClaims = [] } = useClaims(summaryId)

  // Fetch the persona's ontology so claim text can be rendered with
  // human-readable type / object names instead of UUIDs.
  const { data: personaOntology } = usePersonaOntology(personaId)

  // Fetch world-state objects for the claim-context dropdowns. Locations
  // are entities tagged with a `locationType` field (the Fovea data model
  // does not promote them to a top-level WorldState key).
  const events = useEvents()
  const times = useTimes()
  const entities = useEntities()
  const locations = entities.filter((e): e is typeof e & { locationType: string } =>
    'locationType' in e && typeof (e as { locationType?: unknown }).locationType === 'string'
  )

  // Core content
  const [gloss, setGloss] = useState<GlossItem[]>([])
  const [confidence, setConfidence] = useState(0.9)

  // Video time spans the claim is grounded in (discontiguous).
  const [timeSpans, setTimeSpans] = useState<ClaimTimeSpan[]>([])

  // The video's object annotations (for deriving time spans) and its fps.
  const { data: annotations = [] } = useAnnotations(videoId)
  const { data: videos = [] } = useVideos()
  const videoFps = videos.find((v) => v.id === videoId)?.fps ?? 30
  const objectAnnotations = annotations.filter((a) => a.annotationType === 'object')

  // Scrub-capture: hide this dialog, let the user scrub the video, capture the
  // playhead, then re-open with the span appended (see claimsUiStore).
  const startTimestampCapture = useClaimsUiStore((state) => state.startTimestampCapture)

  // Claimer fields
  const [claimerType, setClaimerType] = useState<ClaimerType | null>(null)
  const [claimerGloss, setClaimerGloss] = useState<GlossItem[]>([])
  const [claimRelation, setClaimRelation] = useState<GlossItem[]>([])

  // Context fields
  const [claimEventId, setClaimEventId] = useState<string>('')
  const [claimTimeId, setClaimTimeId] = useState<string>('')
  const [claimLocationId, setClaimLocationId] = useState<string>('')

  // Modality metadata fields - arrays of selected values
  const [audio, setAudio] = useState<('speech' | 'non-speech')[]>([])
  const [video, setVideo] = useState<('text' | 'non-text')[]>([])
  const [metadata, setMetadata] = useState<('text' | 'non-text')[]>([])

  // Comment field
  const [comment, setComment] = useState<string>('')

  // Navigation and draft persistence for workspace toggle
  const navigate = useNavigate()
  const saveDraftClaim = useClaimsUiStore((state) => state.saveDraftClaim)

  // Ref to track current form state without triggering effect re-runs
  const formStateRef = useRef({
    gloss, confidence, claimerType, claimerGloss, claimRelation,
    claimEventId, claimTimeId, claimLocationId, audio, video, metadata, comment, timeSpans,
  })

  useEffect(() => {
    formStateRef.current = {
      gloss, confidence, claimerType, claimerGloss, claimRelation,
      claimEventId, claimTimeId, claimLocationId, audio, video, metadata, comment, timeSpans,
    }
  }, [gloss, confidence, claimerType, claimerGloss, claimRelation,
      claimEventId, claimTimeId, claimLocationId, audio, video, metadata, comment, timeSpans])

  // Initialize form when dialog opens or claim changes
  useEffect(() => {
    if (open) {
      // Check for draft claim to restore (saved before workspace toggle)
      const draft = useClaimsUiStore.getState().draftClaim
      if (draft) {
        setGloss(draft.gloss)
        setConfidence(draft.confidence)
        setClaimerType(draft.claimerType)
        setClaimerGloss(draft.claimerGloss)
        setClaimRelation(draft.claimRelation)
        setClaimEventId(draft.claimEventId)
        setClaimTimeId(draft.claimTimeId)
        setClaimLocationId(draft.claimLocationId)
        setAudio(draft.audio)
        setVideo(draft.video)
        setMetadata(draft.metadata)
        setComment(draft.comment)
        setTimeSpans(draft.timeSpans ?? [])
        useClaimsUiStore.getState().clearDraftClaim()
      } else if (claim) {
        // Edit mode
        setGloss(claim.gloss || [])
        setConfidence(claim.confidence ?? 0.9)
        setClaimerType(claim.claimerType ?? null)
        setClaimerGloss(claim.claimerGloss || [])
        setClaimRelation(claim.claimRelation || [])
        setClaimEventId(claim.claimEventId || '')
        setClaimTimeId(claim.claimTimeId || '')
        setClaimLocationId(claim.claimLocationId || '')
        setAudio(claim.audio ?? [])
        setVideo(claim.video ?? [])
        setMetadata(claim.metadata ?? [])
        setComment(claim.comment || '')
        setTimeSpans(claim.timeSpans ?? [])
      } else {
        // Create mode
        setGloss([])
        setConfidence(0.9)
        setClaimerType(null)
        setClaimerGloss([])
        setClaimRelation([])
        setClaimEventId('')
        setClaimTimeId('')
        setClaimLocationId('')
        setAudio([])
        setVideo([])
        setMetadata([])
        setComment('')
        setTimeSpans([])
      }
    }
  }, [open, claim])

  // Keyboard shortcut: 'p' for Persona Builder, 'w' for Object Builder
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('[role="combobox"]') !== null
      if (isInput) return

      if (e.key === 'o' || e.key === 'w') {
        e.preventDefault()
        const state = formStateRef.current
        saveDraftClaim({
          ...state,
          videoId: videoId || '',
          personaId: personaId || '',
          summaryId,
          editingClaimId: claim?.id,
          parentClaimId,
        })
        navigate(e.key === 'o' ? '/ontology' : '/objects')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, videoId, personaId, summaryId, claim?.id, parentClaimId, navigate, saveDraftClaim])

  // Begin a scrub capture: persist the in-progress form (including the spans
  // collected so far) so it survives the dialog hiding, signal the workspace
  // to enter capture mode, and close this dialog so the player is reachable.
  const beginScrubCapture = () => {
    const state = formStateRef.current
    saveDraftClaim({
      ...state,
      timeSpans,
      videoId: videoId || '',
      personaId: personaId || '',
      summaryId,
      editingClaimId: claim?.id,
      parentClaimId,
    })
    startTimestampCapture()
    onClose()
  }

  // Derive a span from an object annotation's keyframe time bounds.
  const addSpanFromAnnotation = (annotationId: string) => {
    const annotation = objectAnnotations.find((a) => a.id === annotationId)
    if (!annotation) return
    const bounds = getAnnotationTimeBounds(annotation, videoFps)
    if (!bounds) return
    setTimeSpans((prev) => [
      ...prev,
      { start: bounds.startTime, end: bounds.endTime, source: 'annotation', annotationIds: [annotation.id] },
    ])
  }

  const removeTimeSpan = (index: number) => {
    setTimeSpans((prev) => prev.filter((_, i) => i !== index))
  }

  // Human-readable label for an object annotation in the span picker.
  const annotationLabel = (annotationId: string): string => {
    const annotation = objectAnnotations.find((a) => a.id === annotationId)
    if (annotation?.linkedEntityId) {
      const entity = entities.find((e) => e.id === annotation.linkedEntityId)
      if (entity?.name) return entity.name
    }
    return `Object ${annotationId.slice(0, 6)}`
  }

  const handleSave = () => {
    // Convert gloss to plain text for the text field, resolving typeRef /
    // objectRef / annotationRef / claimRef ids to human-readable labels.
    // Falling back to the raw id keeps the field non-empty when an ontology
    // or world lookup misses; export consumers should still treat `text` as
    // a display string, not the canonical reference (gloss holds those).
    const text = glossToText(gloss, personaOntology ?? undefined, {
      entities,
      events,
      times,
    })

    const claimData: Partial<Claim> = {
      text,
      gloss,
      confidence,
      summaryId,
      summaryType: 'video',
      extractionStrategy: 'manual',
    }

    // Add claimer fields if claimer type is set
    if (claimerType !== null) {
      claimData.claimerType = claimerType
      claimData.claimerGloss = claimerGloss
      claimData.claimRelation = claimRelation
    }

    // Add context fields if set
    if (claimEventId) claimData.claimEventId = claimEventId
    if (claimTimeId) claimData.claimTimeId = claimTimeId
    if (claimLocationId) claimData.claimLocationId = claimLocationId

    // Add modality metadata fields if set (empty array becomes null)
    if (audio.length > 0) claimData.audio = audio
    else claimData.audio = null
    if (video.length > 0) claimData.video = video
    else claimData.video = null
    if (metadata.length > 0) claimData.metadata = metadata
    else claimData.metadata = null

    // Add comment if set
    if (comment.trim()) {
      claimData.comment = comment.trim()
    } else {
      claimData.comment = null
    }

    // Include parentClaimId if provided (for subclaims)
    if (parentClaimId) {
      claimData.parentClaimId = parentClaimId
    }

    // Always send timeSpans so removals persist (empty clears them).
    claimData.timeSpans = timeSpans

    onSave(claimData)
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  // Check if claim has any content (at least one non-empty gloss item)
  const hasContent = gloss.some(item => item.content.trim().length > 0)
  // Check if at least one modality checkbox is checked
  const hasModalityMetadata = audio.length > 0 || video.length > 0 || metadata.length > 0
  // Metadata sources alone are not sufficient - must have at least one audio or video source
  const hasNonMetadataSource = audio.length > 0 || video.length > 0
  const metadataOnly = metadata.length > 0 && !hasNonMetadataSource
  // Check if confidence is set (should always be set, but validate anyway)
  const hasConfidence = confidence !== undefined
  // Validation: content, confidence, and modality are required; metadata-only is not allowed
  const isValid = hasContent && hasConfidence && hasModalityMetadata && !metadataOnly

  // Track validation state to log failures only when user attempts to save
  const previousValidationAttemptRef = useRef<boolean>(false)

  // Log validation failures when user attempts to save invalid claim
  useEffect(() => {
    if (!isValid && gloss.length > 0 && open) {
      // User has entered content but validation is failing
      // Only log when transitioning from valid to invalid (user tried to save)
      if (!previousValidationAttemptRef.current) {
        logWarning('Claim validation failed', {
          component: 'ClaimEditor',
          summaryId,
          claimId: claim?.id,
          hasContent,
          hasConfidence,
          hasModalityMetadata,
          metadataOnly,
          glossLength: gloss.length,
        })
        previousValidationAttemptRef.current = true
      }
    } else {
      previousValidationAttemptRef.current = false
    }
  }, [isValid, hasContent, hasConfidence, hasModalityMetadata, metadataOnly, summaryId, claim?.id, gloss.length, open])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent data-tour-id="claim-editor" className="sm:max-w-lg min-h-[500px]">
        <DialogHeader>
          <DialogTitle>
            {claim ? 'Edit Claim' : parentClaimId ? 'Add Subclaim' : 'Add Manual Claim'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {/* Claim Content */}
          <div>
            <p className="mb-1 text-sm font-medium">
              Claim Content *
            </p>
            <p className="mb-2 block text-xs text-muted-foreground">
              Enter the claim text. Use # for entity types, @ for objects, ^ for annotations, and $ for claim references.
            </p>
            <GlossEditor
              gloss={gloss}
              onChange={setGloss}
              personaId={personaId}
              videoId={videoId}
              includeAnnotations={!!videoId}
              includeClaims={true}
              claims={existingClaims}
              label="Claim text with references"
            />
          </div>

          {/* Video time spans (discontiguous) */}
          <div>
            <p className="mb-1 text-sm font-medium">Video time spans</p>
            <p className="mb-2 block text-xs text-muted-foreground">
              Mark the video segment(s) this claim is grounded in. Add spans by scrubbing the video or from an object&apos;s annotation; you can add several discontiguous spans.
            </p>
            {timeSpans.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2" data-testid="claim-time-spans">
                {timeSpans.map((span, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs"
                    data-testid="claim-time-span-chip"
                  >
                    <Clock className="size-3" />
                    {formatTimeSpanSeconds(span.start)}&ndash;{formatTimeSpanSeconds(span.end)}
                    {span.source === 'annotation' && (
                      <span className="text-muted-foreground">(object)</span>
                    )}
                    <button
                      type="button"
                      aria-label="Remove time span"
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => removeTimeSpan(index)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={beginScrubCapture}
                data-testid="claim-scrub-capture-button"
              >
                <Crosshair className="size-4 mr-1" />
                Set span by scrubbing
              </Button>
              {objectAnnotations.length > 0 && (
                <Select value="" onValueChange={(value) => { if (value) addSpanFromAnnotation(value) }}>
                  <SelectTrigger className="h-8 w-[220px]" data-testid="claim-span-from-object">
                    <SelectValue placeholder="Add span from object…" />
                  </SelectTrigger>
                  <SelectContent>
                    {objectAnnotations.map((a) => {
                      const bounds = getAnnotationTimeBounds(a, videoFps)
                      return (
                        <SelectItem key={a.id} value={a.id}>
                          {annotationLabel(a.id)}
                          {bounds
                            ? ` (${formatTimeSpanSeconds(bounds.startTime)}–${formatTimeSpanSeconds(bounds.endTime)})`
                            : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Confidence Slider */}
          <div>
            <p className="mb-1 text-sm font-medium">
              Confidence *
            </p>
            <div className="flex justify-center px-4">
              <div className="w-full max-w-[600px]">
                <div className="mb-1 text-center text-sm font-medium">
                  {Math.round(confidence * 100)}%
                </div>
                <Slider
                  value={[confidence]}
                  onValueChange={(value) => {
                    const v = Array.isArray(value) ? value[0] : value
                    setConfidence(v)
                  }}
                  min={0}
                  max={1}
                  step={0.01}
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Modality Metadata Section */}
          <div>
            <p className="mb-1 text-sm font-medium">
              Modality Metadata *
            </p>
            <p className="mb-3 block text-xs text-muted-foreground">
              Indicate what sources support this claim. You can select multiple options for each field. At least one audio or video source must be selected.
            </p>
            {metadataOnly && (
              <p className="mb-3 block text-xs text-destructive">
                Please select at least one audio or video source. Metadata sources cannot be the only selection.
              </p>
            )}
            <div className="flex gap-4">
              {/* Audio Modality */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-1">
                  <span className="text-sm font-medium">
                    Audio Sources
                  </span>
                  <Tooltip>
                    <TooltipTrigger render={<button type="button" className="inline-flex p-0.5" />}>
                      <Info className="size-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Indicates if this claim is based at least in part on audio from the video. &apos;speech&apos; means the claim is based on spoken audio (dialogue, narration, etc.). &apos;non-speech&apos; means the claim is based on other audio (music, sound effects, ambient sounds, etc.). You can select both if applicable.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col gap-2">
                  <Tooltip>
                    <TooltipTrigger render={<div className="flex items-center gap-2" />}>
                      <Checkbox
                        checked={audio.includes('speech')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setAudio([...audio, 'speech'])
                          } else {
                            setAudio(audio.filter(v => v !== 'speech'))
                          }
                        }}
                        id="audio-speech"
                      />
                      <Label htmlFor="audio-speech" className="text-sm">Speech</Label>
                    </TooltipTrigger>
                    <TooltipContent>The claim is based on spoken audio (dialogue, narration, etc.)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<div className="flex items-center gap-2" />}>
                      <Checkbox
                        checked={audio.includes('non-speech')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setAudio([...audio, 'non-speech'])
                          } else {
                            setAudio(audio.filter(v => v !== 'non-speech'))
                          }
                        }}
                        id="audio-non-speech"
                      />
                      <Label htmlFor="audio-non-speech" className="text-sm">Non-speech</Label>
                    </TooltipTrigger>
                    <TooltipContent>The claim is based on other audio (music, sound effects, ambient sounds, etc.)</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Video Modality */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-1">
                  <span className="text-sm font-medium">
                    Video Sources
                  </span>
                  <Tooltip>
                    <TooltipTrigger render={<button type="button" className="inline-flex p-0.5" />}>
                      <Info className="size-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Indicates if this claim is based at least in part on non-audio video information. &apos;text&apos; means the claim is based on text visible in the video (captions, signs, on-screen text, etc.). &apos;non-text&apos; means the claim is based on visual content (actions, objects, scenes, etc.). You can select both if applicable.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col gap-2">
                  <Tooltip>
                    <TooltipTrigger render={<div className="flex items-center gap-2" />}>
                      <Checkbox
                        checked={video.includes('text')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setVideo([...video, 'text'])
                          } else {
                            setVideo(video.filter(v => v !== 'text'))
                          }
                        }}
                        id="video-text"
                      />
                      <Label htmlFor="video-text" className="text-sm">Text</Label>
                    </TooltipTrigger>
                    <TooltipContent>The claim is based on text visible in the video (captions, signs, on-screen text, etc.)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<div className="flex items-center gap-2" />}>
                      <Checkbox
                        checked={video.includes('non-text')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setVideo([...video, 'non-text'])
                          } else {
                            setVideo(video.filter(v => v !== 'non-text'))
                          }
                        }}
                        id="video-non-text"
                      />
                      <Label htmlFor="video-non-text" className="text-sm">Non-text</Label>
                    </TooltipTrigger>
                    <TooltipContent>The claim is based on visual content (actions, objects, scenes, etc.)</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Metadata Modality */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-1">
                  <span className="text-sm font-medium">
                    Metadata Sources
                  </span>
                  <Tooltip>
                    <TooltipTrigger render={<button type="button" className="inline-flex p-0.5" />}>
                      <Info className="size-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Indicates if this claim is based on information from the video metadata. &apos;text&apos; means the claim is based on caption/subtitle metadata. &apos;non-text&apos; means the claim is based on other metadata like location from .info.json files. You can select both if applicable.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col gap-2">
                  <Tooltip>
                    <TooltipTrigger render={<div className="flex items-center gap-2" />}>
                      <Checkbox
                        checked={metadata.includes('text')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setMetadata([...metadata, 'text'])
                          } else {
                            setMetadata(metadata.filter(v => v !== 'text'))
                          }
                        }}
                        id="metadata-text"
                      />
                      <Label htmlFor="metadata-text" className="text-sm">Text</Label>
                    </TooltipTrigger>
                    <TooltipContent>The claim is based on caption/subtitle metadata</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<div className="flex items-center gap-2" />}>
                      <Checkbox
                        checked={metadata.includes('non-text')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setMetadata([...metadata, 'non-text'])
                          } else {
                            setMetadata(metadata.filter(v => v !== 'non-text'))
                          }
                        }}
                        id="metadata-non-text"
                      />
                      <Label htmlFor="metadata-non-text" className="text-sm">Non-text</Label>
                    </TooltipTrigger>
                    <TooltipContent>The claim is based on other metadata like location, timestamps, etc. from .info.json files</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>

          {/* Claimer Section */}
          <Accordion>
            <AccordionItem value="claimer">
              <AccordionTrigger>
                <span className="text-sm font-medium">
                  Claimer (optional) {claimerType && `(${claimerType})`}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 pt-2">
                  <div className="flex flex-col gap-2">
                    <Label>Claimer Type</Label>
                    <Select
                      value={claimerType || ''}
                      onValueChange={(value) => setClaimerType((value as ClaimerType) || null)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="None (standalone claim)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entity">Entity (single world state entity)</SelectItem>
                        <SelectItem value="entity_type">Entity Type (ontology type)</SelectItem>
                        <SelectItem value="author">Author (video creator)</SelectItem>
                        <SelectItem value="mixed">Mixed (text + references)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {claimerType && claimerType !== 'author' && (
                    <>
                      <div>
                        <p className="mb-1 block text-xs text-muted-foreground">
                          Who is making this claim?
                        </p>
                        <GlossEditor
                          gloss={claimerGloss}
                          onChange={setClaimerGloss}
                          personaId={personaId}
                          videoId={videoId}
                          includeAnnotations={!!videoId}
                          label="Claimer"
                        />
                      </div>

                      <div>
                        <p className="mb-1 block text-xs text-muted-foreground">
                          How does the claimer relate to this claim? (e.g., &quot;believes&quot;, &quot;denies&quot;, &quot;questions&quot;)
                        </p>
                        <GlossEditor
                          gloss={claimRelation}
                          onChange={setClaimRelation}
                          personaId={personaId}
                          videoId={videoId}
                          includeAnnotations={false}
                          label="Claim relation"
                        />
                      </div>
                    </>
                  )}

                  {claimerType === 'author' && (
                    <p className="text-xs text-muted-foreground">
                      The video creator explicitly asserts this claim.
                    </p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Context Section */}
          <Accordion>
            <AccordionItem value="context">
              <AccordionTrigger>
                <span className="text-sm font-medium">
                  Claim Context (optional)
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 pt-2">
                  <p className="text-xs text-muted-foreground">
                    Specify when and where this claim was made (if different from the video context).
                  </p>

                  <div className="flex flex-col gap-2">
                    <Label>Claiming Event</Label>
                    <Select
                      value={claimEventId}
                      onValueChange={(v) => setClaimEventId(v ?? '')}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {events.map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Claiming Time</Label>
                    <Select
                      value={claimTimeId}
                      onValueChange={(v) => setClaimTimeId(v ?? '')}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {times.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.label ?? t.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Claiming Location</Label>
                    <Select
                      value={claimLocationId}
                      onValueChange={(v) => setClaimLocationId(v ?? '')}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {locations.map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Comment Section */}
          <div>
            <p className="mb-1 text-sm font-medium">
              Comment (optional)
            </p>
            <p className="mb-2 block text-xs text-muted-foreground">
              Add any additional notes or comments about this claim.
            </p>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Enter comment..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!isValid}
          >
            {claim ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
