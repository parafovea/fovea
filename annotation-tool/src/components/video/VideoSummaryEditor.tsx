import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Paper,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Button,
  Badge,
  Stack,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material'
import { Add as AddIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
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
import ClaimsViewer from '@components/claims/ClaimsViewer'
import ClaimEditor from '@components/claims/ClaimEditor'
import ClaimsExtractionDialog from '@components/claims/ClaimsExtractionDialog'
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

  // Check for CPU-only mode
  const { data: modelConfig } = useModelConfig()
  const isCpuOnly = !modelConfig?.cudaAvailable

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
  const [activeTab, setActiveTab] = useState(1) // 0 = Summary, 1 = Claims (default to Claims)
  const [extractDialogOpen, setExtractDialogOpen] = useState(false)
  const [editorDialogOpen, setEditorDialogOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<Claim | undefined>(undefined)
  const [parentClaimId, setParentClaimId] = useState<string | undefined>(undefined)
  const [highlightedSpans, setHighlightedSpans] = useState<ClaimTextSpan[]>([])
  const [highlightedClaimId, setHighlightedClaimId] = useState<string | null>(null)
  const [summaryPreviewExpanded, setSummaryPreviewExpanded] = useState(true)

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
    isEnabled: !!videoId && !!personaId && !!summaryId,
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

  // Switch to Claims tab when a different summary loads (e.g. switching videos/personas)
  // Only depends on summaryId so background refetches don't reset the tab
  useEffect(() => {
    if (summaryId && summaryId.trim() !== '') {
      setActiveTab(1)
    }
  }, [summaryId])

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

  // Track CPU-only mode detection (only log once per session)
  const cpuOnlyLoggedRef = useRef(false)
  useEffect(() => {
    if (isCpuOnly && modelConfig && !cpuOnlyLoggedRef.current) {
      logWarning('CPU-only mode detected - Extract Claims disabled', {
        component: 'VideoSummaryEditor',
        videoId,
        personaId,
        cudaAvailable: modelConfig.cudaAvailable ?? false,
      })
      cpuOnlyLoggedRef.current = true
    }
    // Reset if GPU becomes available
    if (!isCpuOnly) {
      cpuOnlyLoggedRef.current = false
    }
  }, [isCpuOnly, videoId, personaId, modelConfig])

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
      setActiveTab(1)
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
      setActiveTab(1)
    }
  }

  const handleExtractClaims = async (config: ClaimExtractionConfig) => {
    if (!summaryId) return

    const result = await extractClaimsMutation.mutateAsync({
      summaryId,
      config,
    })
    // Start tracking the extraction job in Zustand
    startExtraction(result.jobId)
  }

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
    // Clear highlighting when switching tabs
    if (newValue === 0) {
      setHighlightedSpans([])
      setHighlightedClaimId(null)
    }
  }

  const handleClaimSelect = (claimId: string, sourceSpans: ClaimTextSpan[]) => {
    // Switch to Summary tab to show highlighted text
    setActiveTab(0)
    setHighlightedSpans(sourceSpans)
    setHighlightedClaimId(claimId)
  }

  // Convert GlossItem[] to plain text for highlighting
  const summaryText = localSummary.map(item => item.content).join(' ')

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    )
  }

  return (
    <Box>
      {/* Header with save status */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {activeTab === 0 && (
            <SaveStatusIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              errorMessage={saveErrorMessage}
              retryCount={retryCount}
              onRetry={forceSave}
            />
          )}
        </Box>

        {/* Action buttons for Claims tab */}
        {activeTab === 1 && (
          <Stack direction="row" spacing={1}>
            <Tooltip title={isCpuOnly ? 'GPU required for claim extraction (CPU-only mode detected)' : ''}>
              <span>
                <Button
                  variant="contained"
                  onClick={() => setExtractDialogOpen(true)}
                  disabled={extracting || !summaryId || localSummary.length === 0 || isCpuOnly}
                  size="small"
                >
                  Extract Claims
                </Button>
              </span>
            </Tooltip>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => handleAddClaim()}
              disabled={!summaryId}
              size="small"
            >
              Add Manual Claim
            </Button>
          </Stack>
        )}
      </Box>

      {/* Tabs */}
      <Paper variant="outlined">
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab label="Summary" />
          <Tab
            label={
              <Badge badgeContent={claims.length} color="primary">
                <Box sx={{ pr: claims.length > 0 ? 2 : 0 }}>Claims</Box>
              </Badge>
            }
          />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {/* Summary Tab */}
          {activeTab === 0 && (
            <>
              {highlightedSpans.length > 0 ? (
                <Box>
                  <Alert severity="info" sx={{ mb: 2 }} onClose={() => {
                    setHighlightedSpans([])
                    setHighlightedClaimId(null)
                  }}>
                    Showing highlighted text for selected claim. Click to dismiss.
                  </Alert>
                  <ClaimSpanHighlighter
                    text={summaryText}
                    highlightedSpans={highlightedSpans}
                    selectedClaimId={highlightedClaimId}
                  />
                </Box>
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
                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Comment (optional)
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                      Add any additional notes or comments about this summary.
                    </Typography>
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      value={localComment}
                      onChange={(e) => setLocalComment(e.target.value)}
                      placeholder="Enter comment..."
                      variant="outlined"
                      size="small"
                      disabled={disabled}
                    />
                  </Box>
                </>
              )}
            </>
          )}

          {/* Claims Tab */}
          {activeTab === 1 && (
            <>
              {localSummary.length > 0 && (
                <Accordion
                  expanded={summaryPreviewExpanded}
                  onChange={(_event, isExpanded) => setSummaryPreviewExpanded(isExpanded)}
                  sx={{ mb: 2 }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="body2" color="text.secondary">Summary Preview</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <GlossRenderer gloss={localSummary} personaId={personaId} />
                  </AccordionDetails>
                </Accordion>
              )}
              {!summaryId ? (
                <Alert severity="info">
                  Please create or select a summary first to view claims.
                </Alert>
              ) : (
                <>
                  {extractionError && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => clearExtractionState()}>
                      {extractionError}
                    </Alert>
                  )}
                  {claimsError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      Error loading claims: {claimsError instanceof Error ? claimsError.message : String(claimsError)}
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
          )}
        </Box>
      </Paper>

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
    </Box>
  )
})

export default VideoSummaryEditor