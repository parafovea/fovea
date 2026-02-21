import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Slider,
  Typography,
  Box,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  FormGroup,
  FormControlLabel,
  Checkbox,
  TextField,
  IconButton,
} from '@mui/material'
import { ExpandMore as ExpandMoreIcon, Info as InfoIcon } from '@mui/icons-material'
import { Claim, GlossItem, ClaimerType } from '@models/types'
import GlossEditor from '@components/ontology/GlossEditor'
import { logWarning } from '@services/errorLogging'
import { useClaimsUiStore } from '@store/zustand/claimsUiStore'

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

export default function ClaimEditor({
  open,
  onClose,
  onSave,
  claim,
  summaryId,
  personaId,
  videoId,
  parentClaimId,
}: ClaimEditorProps) {
  // Core content
  const [gloss, setGloss] = useState<GlossItem[]>([])
  const [confidence, setConfidence] = useState(0.9)

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
    claimEventId, claimTimeId, claimLocationId, audio, video, metadata, comment,
  })

  useEffect(() => {
    formStateRef.current = {
      gloss, confidence, claimerType, claimerGloss, claimRelation,
      claimEventId, claimTimeId, claimLocationId, audio, video, metadata, comment,
    }
  }, [gloss, confidence, claimerType, claimerGloss, claimRelation,
      claimEventId, claimTimeId, claimLocationId, audio, video, metadata, comment])

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
      }
    }
  }, [open, claim])

  // Keyboard shortcut: 'o' for Ontology Builder, 'w' for Object Builder
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

  const handleSave = () => {
    // Convert gloss to plain text for the text field
    const text = gloss.map(item => item.content).join('')

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

    onSave(claimData)
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  const confidenceMarks = [
    { value: 0, label: '0%' },
    { value: 0.5, label: '50%' },
    { value: 1, label: '100%' },
  ]

  // Check if claim has any content (at least one non-empty gloss item)
  const hasContent = gloss.some(item => item.content.trim().length > 0)
  // Check if at least one modality checkbox is checked
  const hasModalityMetadata = audio.length > 0 || video.length > 0 || metadata.length > 0
  // Check if confidence is set (should always be set, but validate anyway)
  const hasConfidence = confidence !== undefined
  // Validation: content, confidence, and modality are required
  const isValid = hasContent && hasConfidence && hasModalityMetadata

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
          glossLength: gloss.length,
        })
        previousValidationAttemptRef.current = true
      }
    } else {
      previousValidationAttemptRef.current = false
    }
  }, [isValid, hasContent, hasConfidence, hasModalityMetadata, summaryId, claim?.id, gloss.length, open])

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '500px' },
      }}
    >
      <DialogTitle>
        {claim ? 'Edit Claim' : parentClaimId ? 'Add Subclaim' : 'Add Manual Claim'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Claim Content */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Claim Content *
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Enter the claim text. Use # for entity types, @ for objects, ^ for annotations, and $ for claim references.
            </Typography>
            <GlossEditor
              gloss={gloss}
              onChange={setGloss}
              personaId={personaId}
              videoId={videoId}
              includeAnnotations={!!videoId}
              label="Claim text with references"
            />
          </Box>

          {/* Confidence Slider */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Confidence *
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', px: 2 }}>
              <Box sx={{ width: '100%', maxWidth: '600px' }}>
                <Slider
                  value={confidence}
                  onChange={(_, value) => setConfidence(value as number)}
                  min={0}
                  max={1}
                  step={0.01}
                  marks={confidenceMarks}
                  valueLabelDisplay="on"
                  valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
                />
              </Box>
            </Box>
          </Box>

          {/* Modality Metadata Section - Always visible, not in Accordion */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Modality Metadata *
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
              Indicate what sources support this claim. You can select multiple options for each field. At least one option must be selected.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {/* Audio Modality */}
              <Box sx={{ flex: '1 1 33%', minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Audio Sources
                  </Typography>
                  <Tooltip
                    title="Indicates if this claim is based at least in part on audio from the video. 'speech' means the claim is based on spoken audio (dialogue, narration, etc.). 'non-speech' means the claim is based on other audio (music, sound effects, ambient sounds, etc.). You can select both if applicable."
                    arrow
                    placement="top"
                  >
                    <IconButton size="small" sx={{ p: 0.25 }}>
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <FormGroup sx={{ gap: 0.5 }}>
                  <Tooltip
                    title="The claim is based on spoken audio (dialogue, narration, etc.)"
                    arrow
                    placement="top"
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={audio.includes('speech')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAudio([...audio, 'speech'])
                            } else {
                              setAudio(audio.filter(v => v !== 'speech'))
                            }
                          }}
                          size="small"
                        />
                      }
                      label="Speech"
                    />
                  </Tooltip>
                  <Tooltip
                    title="The claim is based on other audio (music, sound effects, ambient sounds, etc.)"
                    arrow
                    placement="top"
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={audio.includes('non-speech')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAudio([...audio, 'non-speech'])
                            } else {
                              setAudio(audio.filter(v => v !== 'non-speech'))
                            }
                          }}
                          size="small"
                        />
                      }
                      label="Non-speech"
                    />
                  </Tooltip>
                </FormGroup>
              </Box>

              {/* Video Modality */}
              <Box sx={{ flex: '1 1 33%', minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Video Sources
                  </Typography>
                  <Tooltip
                    title="Indicates if this claim is based at least in part on non-audio video information. 'text' means the claim is based on text visible in the video (captions, signs, on-screen text, etc.). 'non-text' means the claim is based on visual content (actions, objects, scenes, etc.). You can select both if applicable."
                    arrow
                    placement="top"
                  >
                    <IconButton size="small" sx={{ p: 0.25 }}>
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <FormGroup sx={{ gap: 0.5 }}>
                  <Tooltip
                    title="The claim is based on text visible in the video (captions, signs, on-screen text, etc.)"
                    arrow
                    placement="top"
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={video.includes('text')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setVideo([...video, 'text'])
                            } else {
                              setVideo(video.filter(v => v !== 'text'))
                            }
                          }}
                          size="small"
                        />
                      }
                      label="Text"
                    />
                  </Tooltip>
                  <Tooltip
                    title="The claim is based on visual content (actions, objects, scenes, etc.)"
                    arrow
                    placement="top"
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={video.includes('non-text')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setVideo([...video, 'non-text'])
                            } else {
                              setVideo(video.filter(v => v !== 'non-text'))
                            }
                          }}
                          size="small"
                        />
                      }
                      label="Non-text"
                    />
                  </Tooltip>
                </FormGroup>
              </Box>

              {/* Metadata Modality */}
              <Box sx={{ flex: '1 1 33%', minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Metadata Sources
                  </Typography>
                  <Tooltip
                    title="Indicates if this claim is based on information from the video metadata. 'text' means the claim is based on caption/subtitle metadata. 'non-text' means the claim is based on other metadata like location from .info.json files. You can select both if applicable."
                    arrow
                    placement="top"
                  >
                    <IconButton size="small" sx={{ p: 0.25 }}>
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <FormGroup sx={{ gap: 0.5 }}>
                  <Tooltip
                    title="The claim is based on caption/subtitle metadata"
                    arrow
                    placement="top"
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={metadata.includes('text')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMetadata([...metadata, 'text'])
                            } else {
                              setMetadata(metadata.filter(v => v !== 'text'))
                            }
                          }}
                          size="small"
                        />
                      }
                      label="Text"
                    />
                  </Tooltip>
                  <Tooltip
                    title="The claim is based on other metadata like location, timestamps, etc. from .info.json files"
                    arrow
                    placement="top"
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={metadata.includes('non-text')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMetadata([...metadata, 'non-text'])
                            } else {
                              setMetadata(metadata.filter(v => v !== 'non-text'))
                            }
                          }}
                          size="small"
                        />
                      }
                      label="Non-text"
                    />
                  </Tooltip>
                </FormGroup>
              </Box>
            </Box>
          </Box>

          {/* Claimer Section */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">
                Claimer (optional) {claimerType && `(${claimerType})`}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel id="claimer-type-label">Claimer Type</InputLabel>
                  <Select
                    labelId="claimer-type-label"
                    id="claimer-type-select"
                    value={claimerType || ''}
                    onChange={(e) => setClaimerType(e.target.value as ClaimerType | null || null)}
                    label="Claimer Type"
                  >
                    <MenuItem value="">
                      <em>None (standalone claim)</em>
                    </MenuItem>
                    <MenuItem value="entity">Entity (single world state entity)</MenuItem>
                    <MenuItem value="entity_type">Entity Type (ontology type)</MenuItem>
                    <MenuItem value="author">Author (video creator)</MenuItem>
                    <MenuItem value="mixed">Mixed (text + references)</MenuItem>
                  </Select>
                </FormControl>

                {claimerType && claimerType !== 'author' && (
                  <>
                    <Box>
                      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                        Who is making this claim?
                      </Typography>
                      <GlossEditor
                        gloss={claimerGloss}
                        onChange={setClaimerGloss}
                        personaId={personaId}
                        videoId={videoId}
                        includeAnnotations={!!videoId}
                        label="Claimer"
                      />
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                        How does the claimer relate to this claim? (e.g., "believes", "denies", "questions")
                      </Typography>
                      <GlossEditor
                        gloss={claimRelation}
                        onChange={setClaimRelation}
                        personaId={personaId}
                        videoId={videoId}
                        includeAnnotations={false}
                        label="Claim relation"
                      />
                    </Box>
                  </>
                )}

                {claimerType === 'author' && (
                  <Typography variant="caption" color="text.secondary">
                    The video creator explicitly asserts this claim.
                  </Typography>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Context Section */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">
                Claim Context (optional)
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Typography variant="caption" color="text.secondary">
                  Specify when and where this claim was made (if different from the video context).
                </Typography>

                <FormControl fullWidth size="small">
                  <InputLabel id="claim-event-label">Claiming Event</InputLabel>
                  <Select
                    labelId="claim-event-label"
                    id="claim-event-select"
                    value={claimEventId}
                    onChange={(e) => setClaimEventId(e.target.value)}
                    label="Claiming Event"
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {/* TODO: Populate with actual events from world state */}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel id="claim-time-label">Claiming Time</InputLabel>
                  <Select
                    labelId="claim-time-label"
                    id="claim-time-select"
                    value={claimTimeId}
                    onChange={(e) => setClaimTimeId(e.target.value)}
                    label="Claiming Time"
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {/* TODO: Populate with actual time objects from world state */}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel id="claim-location-label">Claiming Location</InputLabel>
                  <Select
                    labelId="claim-location-label"
                    id="claim-location-select"
                    value={claimLocationId}
                    onChange={(e) => setClaimLocationId(e.target.value)}
                    label="Claiming Location"
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {/* TODO: Populate with actual location objects from world state */}
                  </Select>
                </FormControl>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Comment Section */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Comment (optional)
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Add any additional notes or comments about this claim.
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Enter comment..."
              variant="outlined"
              size="small"
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!isValid}
        >
          {claim ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
