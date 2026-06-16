/**
 * Editor component for video summaries with claims management.
 */

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Plus } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertAction } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  usePersonaOntology,
  useVideoSummary,
  useSaveSummary,
  useModelConfig,
} from '@store/queries'
import {
  useClaims,
  useCreateClaim,
  useUpdateClaim,
  useDeleteClaim,
  useExtractClaims,
  useExtractionJobStatus,
  claimsQueryKeys,
} from '@store/queries/useClaims'
import { useClaimsUiStore } from '@store/zustand/claimsUiStore'
import { useQueryClient } from '@tanstack/react-query'
import GlossEditor from '@components/ontology/GlossEditor'
import { GlossRenderer } from '@components/ontology'
import { ClaimsViewer } from '@components/claims/ClaimsViewer'
import { ClaimEditor } from '@components/claims/ClaimEditor'
import { ClaimsExtractionDialog } from '@components/claims/ClaimsExtractionDialog'
import { ClaimSpanHighlighter } from '@components/claims/ClaimSpanHighlighter'
import { SaveStatusIndicator } from '@components/shared/SaveStatusIndicator'
import { useAutoSave } from '@hooks/data/useAutoSave'
import { GlossItem, Claim, ClaimExtractionConfig, ClaimTextSpan, UpdateClaimRequest } from '@models/types'
import { logError, logWarning } from '@services/errorLogging'

interface VideoSummaryEditorProps {
  videoId: string
  personaId: string
  disabled?: boolean
}

export interface VideoSummaryEditorRef {
  forceSave: () => Promise<void>
}

const VideoSummaryEditor = forwardRef<VideoSummaryEditorRef, VideoSummaryEditorProps>(function VideoSummaryEditor({
  videoId,
  personaId,
  disabled = false,
}, ref) {
  const queryClient = useQueryClient()

  // TanStack Query for video summary
  const {
    data: currentSummary,
    isLoading: loading,
    error: queryError,
  } = useVideoSummary(videoId, personaId)
  const saveSummaryMutation = useSaveSummary()
  const error = queryError?.message || saveSummaryMutation.error?.message || null

  // Check whether AI models are available
  const { data: modelConfig } = useModelConfig()
  const modelsDisabled = !modelConfig?.cudaAvailable && !modelConfig?.cpuModelsAvailable

  // Claims UI state from Zustand
  const selectedClaimId = useClaimsUiStore((state) => state.selectedClaimId)
  const extracting = useClaimsUiStore((state) => state.extracting)
  const extractionJobId = useClaimsUiStore((state) => state.extractionJobId)
  const extractionProgress = useClaimsUiStore((state) => state.extractionProgress)
  const extractionError = useClaimsUiStore((state) => state.extractionError)
  const startExtraction = useClaimsUiStore((state) => state.startExtraction)
  const updateExtractionProgress = useClaimsUiStore((state) => state.updateExtractionProgress)
  const setExtractionError = useClaimsUiStore((state) => state.setExtractionError)
  const clearExtractionState = useClaimsUiStore((state) => state.clearExtractionState)
  const draftClaim = useClaimsUiStore((state) => state.draftClaim)

  const [localSummary, setLocalSummary] = useState<GlossItem[]>([])
  const [localComment, setLocalComment] = useState<string>('')
  const [activeTab, setActiveTab] = useState('summary')
  const [extractDialogOpen, setExtractDialogOpen] = useState(false)
  const [editorDialogOpen, setEditorDialogOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<Claim | undefined>(undefined)
  const [parentClaimId, setParentClaimId] = useState<string | undefined>(undefined)
  const [highlightedSpans, setHighlightedSpans] = useState<ClaimTextSpan[]>([])
  const [highlightedClaimId, setHighlightedClaimId] = useState<string | null>(null)
  const [summaryPreviewOpen, setSummaryPreviewOpen] = useState<string[]>(['preview'])

  // Track which video/persona combo we've initialized local state for
  // This prevents re-syncing localSummary when currentSummary updates after autosave
  const initializedForRef = useRef<string | null>(null)

  // Track whether we have already restored a draft claim for this mount
  const draftRestoredRef = useRef(false)

  // TanStack Query hooks for claims
  const summaryId = currentSummary?.id
  const claimsQueryResult = useClaims(
    summaryId, // Always fetch when summaryId exists
    'video'
  )
  const claims: Claim[] = (claimsQueryResult.data as Claim[]) || []
  const claimsLoading = claimsQueryResult.isLoading
  const claimsError = claimsQueryResult.error
  const createClaimMutation = useCreateClaim()
  const updateClaimMutation = useUpdateClaim()
  const deleteClaimMutation = useDeleteClaim()
  const extractClaimsMutation = useExtractClaims()

  // Extraction job status polling
  const { data: jobStatus } = useExtractionJobStatus(extractionJobId, extracting)

  // Fetch persona ontology via TanStack Query (auto-fetches when personaId changes)
  usePersonaOntology(personaId)

  // Autosave callback - memoized to prevent useAutoSave from re-triggering
  const handleAutoSave = useCallback(async (summary: GlossItem[]) => {
    if (!currentSummary) {
      // Create new summary - only required fields
      await saveSummaryMutation.mutateAsync({ videoId, personaId, summary, comment: localComment.trim() || null })
    } else {
      // Update existing summary - spread only defined optional fields
      await saveSummaryMutation.mutateAsync({
        videoId: currentSummary.videoId,
        personaId: currentSummary.personaId,
        summary,
        comment: localComment.trim() || null,
        ...(currentSummary.visualAnalysis && { visualAnalysis: currentSummary.visualAnalysis }),
        ...(currentSummary.audioTranscript && { audioTranscript: currentSummary.audioTranscript }),
        ...(currentSummary.keyFrames && { keyFrames: currentSummary.keyFrames }),
        ...(currentSummary.confidence != null && { confidence: currentSummary.confidence }),
      })
    }
  }, [videoId, personaId, currentSummary, saveSummaryMutation, localComment])

  // Use autosave hook for summary persistence
  // Note: isEnabled doesn't need the ref check - the ref is only for preventing
  // re-syncing localSummary from server data, not for controlling autosave
  const {
    saveStatus,
    lastSavedAt,
    errorMessage: saveErrorMessage,
    retryCount,
    forceSave,
  } = useAutoSave({
    data: localSummary,
    // Autosave is enabled as soon as videoId + personaId resolve. The
    // previous gate (&& !!summaryId) meant the dialog could only
    // autosave AFTER a row already existed for this video/persona —
    // which silently broke the common workflow of opening Edit Video
    // Summary to add atomic claims first: claims need a parent
    // summaryId, the parent summary is only ever created by the
    // autosave path, so without summaryId the autosave never fired,
    // the summary was never created, and the Add Claim click had
    // nothing to POST against. handleAutoSave above handles the
    // create-on-first-save branch (the `if (!currentSummary)` arm),
    // so dropping summaryId from the gate lets the initial debounce
    // tick fire a save with empty `localSummary` on first mount,
    // materializing the parent row before any claim work.
    isEnabled: !!videoId && !!personaId,
    onSave: handleAutoSave,
    entityType: 'summary',
    entityId: `${videoId}-${personaId}`,
  })

  // Expose forceSave to parent components via ref
  useImperativeHandle(ref, () => ({
    forceSave,
  }), [forceSave])

  // Track if we've already tried to create an empty summary for this video/persona
  const creatingEmptySummaryRef = useRef<string | null>(null)

  // Note: do NOT auto-switch to Claims when a summary loads. Opening
  // the Edit Video Summary dialog should land on the Summary tab so
  // users can read / edit the summary content first; switching to
  // Claims is an explicit action.

  // Log claims loading errors
  useEffect(() => {
    if (claimsError) {
      logError(
        claimsError instanceof Error ? claimsError : new Error(String(claimsError)),
        undefined,
        {
          component: 'VideoSummaryEditor',
          action: 'fetchClaims',
          summaryId,
          videoId,
          personaId,
        }
      )
    }
  }, [claimsError, summaryId, videoId, personaId])

  // Track models-disabled state detection (only log once per session)
  const modelsDisabledLoggedRef = useRef(false)
  useEffect(() => {
    if (modelsDisabled && modelConfig && !modelsDisabledLoggedRef.current) {
      logWarning('No AI models available - Extract Claims disabled', {
        component: 'VideoSummaryEditor',
        videoId,
        personaId,
        cudaAvailable: modelConfig.cudaAvailable ?? false,
        cpuModelsAvailable: modelConfig.cpuModelsAvailable ?? false,
      })
      modelsDisabledLoggedRef.current = true
    }
    // Reset if models become available
    if (!modelsDisabled) {
      modelsDisabledLoggedRef.current = false
    }
  }, [modelsDisabled, videoId, personaId, modelConfig])

  // Load summary when video/persona changes - only sync on actual changes, not after autosave
  // IMPORTANT: This effect should NOT have saveSummaryMutation in deps to avoid re-running
  // when mutation state changes (isPending, etc.)
  useEffect(() => {
    const key = `${videoId}-${personaId}`

    // Only sync localSummary when video/persona actually changes
    if (initializedForRef.current !== key && currentSummary) {
      // Parse summary if it's a string (from API), or use directly if already array
      const summaryData = typeof currentSummary.summary === 'string'
        ? (currentSummary.summary ? JSON.parse(currentSummary.summary) : [])
        : (currentSummary.summary || [])
      setLocalSummary(summaryData)
      setLocalComment(currentSummary.comment || '')
      initializedForRef.current = key
    }
  }, [videoId, personaId, currentSummary])

  // Separate effect for creating empty summary when none exists
  // This is separate to avoid the mutation object in deps causing re-runs
  useEffect(() => {
    const key = `${videoId}-${personaId}`

    // Only create empty summary if:
    // 1. Not loading
    // 2. No query error (don't create if we just couldn't fetch existing one)
    // 3. No current summary
    // 4. Haven't already initialized for this key
    // 5. Haven't already started creating for this key
    if (
      !loading &&
      !queryError &&
      !currentSummary &&
      videoId &&
      personaId &&
      initializedForRef.current !== key &&
      creatingEmptySummaryRef.current !== key
    ) {
      creatingEmptySummaryRef.current = key
      const emptySummary = {
        videoId,
        personaId,
        summary: [] as GlossItem[],
        comment: null,
      }
      saveSummaryMutation.mutate(emptySummary, {
        onSuccess: () => {
          setLocalSummary([])
          setLocalComment('')
          initializedForRef.current = key
        },
        onError: () => {
          // Reset so we can try again if needed
          creatingEmptySummaryRef.current = null
        },
      })
    }
  }, [videoId, personaId, currentSummary, loading, queryError, saveSummaryMutation])

  // Handle extraction job status updates from TanStack Query
  useEffect(() => {
    if (jobStatus) {
      if (jobStatus.progress !== undefined) {
        updateExtractionProgress(jobStatus.progress)
      }
      if (jobStatus.status === 'completed' && summaryId) {
        // Invalidate claims cache to trigger refetch
        queryClient.invalidateQueries({ queryKey: claimsQueryKeys.bySummary(summaryId) })
        clearExtractionState()
      } else if (jobStatus.status === 'failed') {
        setExtractionError(jobStatus.error || 'Extraction failed')
      }
    }
  }, [jobStatus, summaryId, queryClient, updateExtractionProgress, clearExtractionState, setExtractionError])

  // Restore draft claim when returning from another workspace
  useEffect(() => {
    if (
      draftClaim &&
      draftClaim.videoId === videoId &&
      draftClaim.personaId === personaId &&
      !draftRestoredRef.current
    ) {
      draftRestoredRef.current = true
      setActiveTab('claims')
      setEditorDialogOpen(true)
    }
  }, [draftClaim, videoId, personaId])

  // Simple handler - useAutoSave handles the debounced saving
  const handleSummaryChange = (summary: GlossItem[]) => {
    setLocalSummary(summary)
  }

  // Claims handlers
  const handleAddClaim = (parentId?: string) => {
    setEditingClaim(undefined)
    setParentClaimId(parentId)
    setEditorDialogOpen(true)
  }

  const handleEditClaim = (claim: Claim) => {
    setEditingClaim(claim)
    setParentClaimId(undefined)
    setEditorDialogOpen(true)
  }

  const handleDeleteClaim = async (claim: Claim) => {
    if (summaryId && confirm(`Delete this claim${claim.subclaims?.length ? ' and all its subclaims' : ''}?`)) {
      await deleteClaimMutation.mutateAsync({ summaryId, claimId: claim.id })
    }
  }

  const handleSaveClaim = async (claimData: Partial<Claim>) => {
    if (!summaryId) return

    if (editingClaim) {
      // Update existing claim - response includes full claims tree
      await updateClaimMutation.mutateAsync({
        summaryId,
        claimId: editingClaim.id,
        updates: claimData as UpdateClaimRequest,
      })
      // Invalidate claims queries to ensure updates appear immediately
      queryClient.invalidateQueries({ queryKey: claimsQueryKeys.bySummary(summaryId) })
    } else {
      // Create new claim - response includes full claims tree
      await createClaimMutation.mutateAsync({
        summaryId,
        claim: {
          ...claimData,
          summaryId,
          summaryType: 'video',
          text: claimData.text || '',
          parentClaimId,
        },
      })
      // Invalidate claims queries to ensure subclaims appear immediately
      queryClient.invalidateQueries({ queryKey: claimsQueryKeys.bySummary(summaryId) })
      // Switch to Claims tab to show the new claim
      setActiveTab('claims')
    }
  }

  const handleExtractClaims = async (config: ClaimExtractionConfig) => {
    if (!summaryId) return

    const result = await extractClaimsMutation.mutateAsync({
      summaryId,
      config,
    })
    // Start tracking the extraction job in Zustand and dismiss the
    // configuration dialog. The dialog has no business staying open
    // for the duration of the extraction job — the user has already
    // configured and submitted; surface progress on the Claims tab
    // (badge + progress indicator), not as a blocking dialog.
    startExtraction(result.jobId)
    setExtractDialogOpen(false)
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    // Clear highlighting when switching tabs
    if (value === 'summary') {
      setHighlightedSpans([])
      setHighlightedClaimId(null)
    }
  }

  const handleClaimSelect = (claimId: string, sourceSpans: ClaimTextSpan[]) => {
    // Switch to Summary tab to show highlighted text
    setActiveTab('summary')
    setHighlightedSpans(sourceSpans)
    setHighlightedClaimId(claimId)
  }

  // Convert GlossItem[] to plain text for highlighting
  const summaryText = localSummary.map(item => item.content).join(' ')

  if (loading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div data-tour-id="video-summary-editor">
      {/* Header with save status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {activeTab === 'summary' && (
            <SaveStatusIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              errorMessage={saveErrorMessage}
              retryCount={retryCount}
              onRetry={forceSave}
            />
          )}
        </div>

        {/* Action buttons for Claims tab */}
        {activeTab === 'claims' && (
          <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span>
                    <Button
                      onClick={() => setExtractDialogOpen(true)}
                      disabled={extracting || !summaryId || localSummary.length === 0 || modelsDisabled}
                      size="sm"
                      data-tour-id="extract-claims-button"
                    >
                      Extract Claims
                    </Button>
                  </span>
                </TooltipTrigger>
                {modelsDisabled && (
                  <TooltipContent>
                    No AI models available for claim extraction
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAddClaim()}
              // In demo mode the public visitor cannot persist a
              // summary (anonymous-session RBAC rejects the empty-
              // summary auto-create POST), so summaryId stays
              // undefined. We still want the ClaimEditor to open so
              // the gloss-reference showcase has a textarea to type
              // into — the editor's Save is the no-op path for
              // anonymous visitors but the dialog still renders.
              disabled={!summaryId && import.meta.env.VITE_DEMO_PUBLIC !== '1'}
              data-tour-id="add-manual-claim-button"
            >
              <Plus className="size-4 mr-1" />
              Add Manual Claim
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="m-2">
              <TabsTrigger value="summary" data-tour-id="summary-tab-summary">Summary</TabsTrigger>
              <TabsTrigger value="claims" data-tour-id="summary-tab-claims">
                <span className="flex items-center gap-1">
                  Claims
                  {claims.length > 0 && (
                    <Badge variant="default" className="ml-1 h-5 min-w-5 px-1">
                      {claims.length}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
            </TabsList>

            <div className="p-4">
              {/* Summary Tab */}
              <TabsContent value="summary">
                <>
                  {highlightedSpans.length > 0 ? (
                    <div>
                      <Alert className="mb-4">
                        <AlertDescription>
                          Showing highlighted text for selected claim. Click to dismiss.
                        </AlertDescription>
                        <AlertAction>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setHighlightedSpans([])
                              setHighlightedClaimId(null)
                            }}
                          >
                            &times;
                          </Button>
                        </AlertAction>
                      </Alert>
                      <ClaimSpanHighlighter
                        text={summaryText}
                        highlightedSpans={highlightedSpans}
                        selectedClaimId={highlightedClaimId}
                      />
                    </div>
                  ) : (
                    <>
                      <GlossEditor
                        gloss={localSummary}
                        onChange={handleSummaryChange}
                        personaId={personaId}
                        videoId={videoId}
                        includeAnnotations={true}
                        disabled={disabled}
                        label="Video Summary"
                      />
                      <div className="mt-6">
                        <Label className="mb-1 block text-sm font-medium">
                          Comment (optional)
                        </Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Add any additional notes or comments about this summary.
                        </p>
                        <Textarea
                          value={localComment}
                          onChange={(e) => setLocalComment(e.target.value)}
                          placeholder="Enter comment..."
                          rows={3}
                          disabled={disabled}
                        />
                      </div>
                    </>
                  )}
                </>
              </TabsContent>

              {/* Claims Tab */}
              <TabsContent value="claims">
                <>
                  {localSummary.length > 0 && (
                    <Accordion
                      value={summaryPreviewOpen}
                      onValueChange={setSummaryPreviewOpen}
                      className="mb-4"
                    >
                      <AccordionItem value="preview">
                        <AccordionTrigger>
                          <span className="text-sm text-muted-foreground">Summary Preview</span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <GlossRenderer gloss={localSummary} personaId={personaId} />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                  {!summaryId ? (
                    <Alert>
                      <AlertDescription>
                        Please create or select a summary first to view claims.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      {extractionError && (
                        <Alert variant="destructive" className="mb-4">
                          <AlertDescription>{extractionError}</AlertDescription>
                          <AlertAction>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => clearExtractionState()}
                            >
                              &times;
                            </Button>
                          </AlertAction>
                        </Alert>
                      )}
                      {claimsError && (
                        <Alert variant="destructive" className="mb-4">
                          <AlertDescription>
                            Error loading claims: {claimsError instanceof Error ? claimsError.message : String(claimsError)}
                          </AlertDescription>
                        </Alert>
                      )}
                      <ClaimsViewer
                        claims={claims}
                        summaryId={summaryId}
                        personaId={personaId}
                        onEditClaim={handleEditClaim}
                        onAddClaim={handleAddClaim}
                        onDeleteClaim={handleDeleteClaim}
                        selectedClaimId={selectedClaimId}
                        onClaimSelect={handleClaimSelect}
                        loading={claimsLoading}
                        error={claimsError ? (claimsError instanceof Error ? claimsError.message : String(claimsError)) : null}
                      />
                    </>
                  )}
                </>
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ClaimEditor
        open={editorDialogOpen}
        onClose={() => {
          setEditorDialogOpen(false)
          setEditingClaim(undefined)
          setParentClaimId(undefined)
        }}
        onSave={handleSaveClaim}
        claim={editingClaim}
        summaryId={summaryId || ''}
        personaId={personaId}
        videoId={videoId}
        parentClaimId={parentClaimId}
      />

      <ClaimsExtractionDialog
        open={extractDialogOpen}
        onClose={() => setExtractDialogOpen(false)}
        onExtract={handleExtractClaims}
        extracting={extracting}
        progress={extractionProgress || undefined}
        error={extractionError}
      />
    </div>
  )
})

export default VideoSummaryEditor
