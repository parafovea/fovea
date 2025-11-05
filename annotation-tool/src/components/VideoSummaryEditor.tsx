import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Button,
  Badge,
  Stack,
} from '@mui/material'
import { Save as SaveIcon, Add as AddIcon } from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import {
  fetchVideoSummaryForPersona,
  saveVideoSummary,
  updateCurrentSummary,
} from '../store/videoSummarySlice'
import {
  fetchClaims,
  createClaim,
  updateClaim,
  deleteClaim,
  extractClaims,
  checkExtractionJob,
  clearExtractionState,
} from '../store/claimsSlice'
import { fetchPersonaOntology } from '../store/personaSlice'
import GlossEditor from './GlossEditor'
import ClaimsViewer from './claims/ClaimsViewer'
import ClaimEditor from './claims/ClaimEditor'
import ClaimsExtractionDialog from './claims/ClaimsExtractionDialog'
import { ClaimSpanHighlighter } from './claims/ClaimSpanHighlighter'
import { GlossItem, VideoSummary, Claim, ClaimExtractionConfig, ClaimTextSpan } from '../models/types'
import { debounce } from 'lodash'

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
  const dispatch = useDispatch<AppDispatch>()
  const { currentSummary, loading, saving, error } = useSelector(
    (state: RootState) => state.videoSummaries
  )
  const {
    claimsBySummary,
    selectedClaimId,
    extracting,
    extractionJobId,
    extractionProgress,
    extractionError,
  } = useSelector((state: RootState) => state.claims)

  const [localSummary, setLocalSummary] = useState<GlossItem[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [activeTab, setActiveTab] = useState(0) // 0 = Summary, 1 = Claims
  const [extractDialogOpen, setExtractDialogOpen] = useState(false)
  const [editorDialogOpen, setEditorDialogOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<Claim | undefined>(undefined)
  const [parentClaimId, setParentClaimId] = useState<string | undefined>(undefined)
  const [highlightedSpans, setHighlightedSpans] = useState<ClaimTextSpan[]>([])
  const [highlightedClaimId, setHighlightedClaimId] = useState<string | null>(null)

  // Get current claims
  const claims = currentSummary ? claimsBySummary[currentSummary.id] || [] : []

  // Load summary when component mounts or when video/persona changes
  useEffect(() => {
    if (videoId && personaId) {
      dispatch(fetchVideoSummaryForPersona({ videoId, personaId }))
        .then((result) => {
          if (result.payload) {
            setLocalSummary((result.payload as VideoSummary).summary || [])
          } else {
            // No existing summary - create empty one immediately so claims can be added
            const emptySummary: Partial<VideoSummary> & { videoId: string; personaId: string } = {
              videoId,
              personaId,
              summary: [],
            }
            dispatch(saveVideoSummary(emptySummary as VideoSummary))
              .then((saveResult) => {
                if (saveResult.payload) {
                  setLocalSummary([])
                }
              })
          }
        })
    }
  }, [videoId, personaId, dispatch])

  // Fetch persona ontology when personaId changes
  useEffect(() => {
    if (personaId) {
      dispatch(fetchPersonaOntology(personaId))
    }
  }, [personaId, dispatch])

  // Fetch claims when switching to Claims tab
  useEffect(() => {
    if (activeTab === 1 && currentSummary) {
      dispatch(fetchClaims({ summaryId: currentSummary.id, summaryType: 'video' }))
    }
  }, [activeTab, currentSummary, dispatch])

  // Poll for extraction job status
  useEffect(() => {
    if (extractionJobId && extracting) {
      const interval = setInterval(() => {
        dispatch(checkExtractionJob(extractionJobId))
          .unwrap()
          .then((status) => {
            if (status.status === 'completed' && currentSummary) {
              // Refresh claims when job completes
              dispatch(fetchClaims({ summaryId: currentSummary.id, summaryType: 'video' }))
              dispatch(clearExtractionState())
            } else if (status.status === 'failed') {
              dispatch(clearExtractionState())
            }
          })
          .catch(() => {
            dispatch(clearExtractionState())
          })
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [extractionJobId, extracting, currentSummary, dispatch])

  // Debounced save function
  const debouncedSave = debounce(async (summary: GlossItem[]) => {
    if (!currentSummary) {
      // Create new summary - backend will generate ID
      const newSummary = {
        videoId,
        personaId,
        summary,
      } as VideoSummary
      await dispatch(saveVideoSummary(newSummary))
    } else {
      // Update existing summary
      const updatedSummary: VideoSummary = {
        ...currentSummary,
        summary,
        updatedAt: new Date().toISOString(),
      }
      await dispatch(saveVideoSummary(updatedSummary))
    }
    setHasChanges(false)
  }, 1000) // Save after 1 second of no changes

  const handleSummaryChange = (summary: GlossItem[]) => {
    setLocalSummary(summary)
    setHasChanges(true)

    // Update Redux state locally (without saving to backend yet)
    if (currentSummary) {
      dispatch(updateCurrentSummary({ summary }))
    }

    // Trigger debounced save
    debouncedSave(summary)
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
    if (currentSummary && confirm(`Delete this claim${claim.subclaims?.length ? ' and all its subclaims' : ''}?`)) {
      await dispatch(deleteClaim({ summaryId: currentSummary.id, claimId: claim.id }))
    }
  }

  const handleSaveClaim = async (claimData: Partial<Claim>) => {
    if (!currentSummary) return

    if (editingClaim) {
      // Update existing claim - response includes full claims tree
      await dispatch(updateClaim({
        summaryId: currentSummary.id,
        claimId: editingClaim.id,
        updates: claimData,
      }))
    } else {
      // Create new claim - response includes full claims tree
      await dispatch(createClaim({
        summaryId: currentSummary.id,
        claim: {
          ...claimData,
          summaryId: currentSummary.id,
          summaryType: 'video',
          text: claimData.text || '',
          parentClaimId,
        },
      }))
    }
  }

  const handleExtractClaims = async (config: ClaimExtractionConfig) => {
    if (!currentSummary) return

    await dispatch(extractClaims({
      summaryId: currentSummary.id,
      config,
    }))
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
          {saving && (
            <>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Saving...
              </Typography>
            </>
          )}
          {!saving && hasChanges && activeTab === 0 && (
            <Typography variant="caption" color="text.secondary">
              Unsaved changes
            </Typography>
          )}
          {!saving && !hasChanges && currentSummary && activeTab === 0 && (
            <Typography variant="caption" color="success.main">
              <SaveIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
              Saved
            </Typography>
          )}
        </Box>

        {/* Action buttons for Claims tab */}
        {activeTab === 1 && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => setExtractDialogOpen(true)}
              disabled={extracting || !currentSummary || localSummary.length === 0}
              size="small"
            >
              Extract Claims
            </Button>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => handleAddClaim()}
              disabled={!currentSummary}
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
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => {}}>
                  {extractionError}
                </Alert>
              )}
              <ClaimsViewer
                claims={claims}
                summaryId={currentSummary?.id || ''}
                personaId={personaId}
                onEditClaim={handleEditClaim}
                onAddClaim={handleAddClaim}
                onDeleteClaim={handleDeleteClaim}
                selectedClaimId={selectedClaimId}
                onClaimSelect={handleClaimSelect}
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
        summaryId={currentSummary?.id || ''}
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