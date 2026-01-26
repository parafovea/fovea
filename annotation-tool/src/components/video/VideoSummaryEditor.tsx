import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Button,
  Badge,
  Stack,
} from '@mui/material'
import { Add as AddIcon } from '@mui/icons-material'
import {
  usePersonaOntology,
  useVideoSummary,
  useSaveSummary,
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
import ClaimsViewer from '@components/claims/ClaimsViewer'
import ClaimEditor from '@components/claims/ClaimEditor'
import ClaimsExtractionDialog from '@components/claims/ClaimsExtractionDialog'
import { ClaimSpanHighlighter } from '@components/claims/ClaimSpanHighlighter'
import { GlossItem, Claim, ClaimExtractionConfig, ClaimTextSpan } from '@models/types'
import { useAutoSave, SaveStatusIndicator } from '../../hooks/data'

interface VideoSummaryEditorProps {
  videoId: string
  personaId: string
  disabled?: boolean
}

export default function VideoSummaryEditor({
  videoId,
  personaId,
  disabled = false,
}: VideoSummaryEditorProps) {
  const queryClient = useQueryClient()

  // TanStack Query for video summary
  const {
    data: currentSummary,
    isLoading: loading,
    error: queryError,
  } = useVideoSummary(videoId, personaId)
  const saveSummaryMutation = useSaveSummary()
  const error = queryError?.message || saveSummaryMutation.error?.message || null

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

  const [localSummary, setLocalSummary] = useState<GlossItem[]>([])
  const [activeTab, setActiveTab] = useState(0) // 0 = Summary, 1 = Claims
  const [extractDialogOpen, setExtractDialogOpen] = useState(false)
  const [editorDialogOpen, setEditorDialogOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<Claim | undefined>(undefined)
  const [parentClaimId, setParentClaimId] = useState<string | undefined>(undefined)
  const [highlightedSpans, setHighlightedSpans] = useState<ClaimTextSpan[]>([])
  const [highlightedClaimId, setHighlightedClaimId] = useState<string | null>(null)

  // TanStack Query hooks for claims
  const summaryId = currentSummary?.id
  const { data: claims = [], isLoading: claimsLoading } = useClaims(
    activeTab === 1 ? summaryId : undefined, // Only fetch when on Claims tab
    'video'
  )
  const createClaimMutation = useCreateClaim()
  const updateClaimMutation = useUpdateClaim()
  const deleteClaimMutation = useDeleteClaim()
  const extractClaimsMutation = useExtractClaims()

  // Extraction job status polling
  const { data: jobStatus } = useExtractionJobStatus(extractionJobId, extracting)

  // Fetch persona ontology via TanStack Query (auto-fetches when personaId changes)
  usePersonaOntology(personaId)

  // Track summary creation state
  const [summaryCreationError, setSummaryCreationError] = useState<string | null>(null)

  // Load summary when component mounts or when video/persona changes
  useEffect(() => {
    if (currentSummary) {
      // Parse summary if it's a string (from API), or use directly if already array
      const summaryData = typeof currentSummary.summary === 'string'
        ? (currentSummary.summary ? JSON.parse(currentSummary.summary) : [])
        : (currentSummary.summary || [])
      setLocalSummary(summaryData)
      setSummaryCreationError(null)
    } else if (!loading && !queryError && videoId && personaId && !saveSummaryMutation.isPending) {
      // No existing summary - create empty one immediately so claims can be added
      // Only include required fields - optional fields should be omitted, not null
      const emptySummary = {
        videoId,
        personaId,
        summary: [] as GlossItem[],
      }
      saveSummaryMutation.mutate(emptySummary, {
        onSuccess: () => {
          setLocalSummary([])
          setSummaryCreationError(null)
        },
        onError: (err) => {
          console.error('Failed to create summary:', err)
          setSummaryCreationError(`Failed to create summary: ${err.message}. Claims cannot be saved without a summary.`)
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

  // Auto-save summary using useAutoSave hook
  const { saveStatus, lastSavedAt, errorMessage, retryCount, forceSave } = useAutoSave({
    data: localSummary,
    isEnabled: !!videoId && !!personaId && !loading,
    onSave: async (summary) => {
      if (!currentSummary) {
        await saveSummaryMutation.mutateAsync({
          videoId,
          personaId,
          summary,
        })
      } else {
        await saveSummaryMutation.mutateAsync({
          videoId: currentSummary.videoId,
          personaId: currentSummary.personaId,
          summary,
          ...(currentSummary.visualAnalysis && { visualAnalysis: currentSummary.visualAnalysis }),
          ...(currentSummary.audioTranscript && { audioTranscript: currentSummary.audioTranscript }),
          ...(currentSummary.keyFrames && { keyFrames: currentSummary.keyFrames }),
          ...(currentSummary.confidence != null && { confidence: currentSummary.confidence }),
        })
      }
    },
    entityType: 'summary',
    entityId: currentSummary?.id || `${videoId}-${personaId}`,
  })

  const handleSummaryChange = (summary: GlossItem[]) => {
    setLocalSummary(summary)
    // useAutoSave handles the debounced save automatically
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
        updates: claimData,
      })
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
      {/* Summary creation error - shown inline since it doesn't block the UI */}
      {summaryCreationError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {summaryCreationError}
        </Alert>
      )}

      {/* Header with save status */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {activeTab === 0 && (
            <SaveStatusIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              errorMessage={errorMessage}
              retryCount={retryCount}
              onRetry={forceSave}
            />
          )}
        </Box>

        {/* Action buttons for Claims tab */}
        {activeTab === 1 && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => setExtractDialogOpen(true)}
              disabled={extracting || !summaryId || localSummary.length === 0}
              size="small"
            >
              Extract Claims
            </Button>
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
                <GlossEditor
                  gloss={localSummary}
                  onChange={handleSummaryChange}
                  personaId={personaId}
                  videoId={videoId}
                  includeAnnotations={true}
                  disabled={disabled}
                  label="Video Summary"
                />
              )}
            </>
          )}

          {/* Claims Tab */}
          {activeTab === 1 && (
            <>
              {extractionError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => clearExtractionState()}>
                  {extractionError}
                </Alert>
              )}
              <ClaimsViewer
                claims={claims}
                summaryId={summaryId || ''}
                personaId={personaId}
                onEditClaim={handleEditClaim}
                onAddClaim={handleAddClaim}
                onDeleteClaim={handleDeleteClaim}
                selectedClaimId={selectedClaimId}
                onClaimSelect={handleClaimSelect}
                loading={claimsLoading}
              />
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
}