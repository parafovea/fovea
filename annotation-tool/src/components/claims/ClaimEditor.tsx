import { useState, useEffect } from 'react'
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
} from '@mui/material'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { Claim, GlossItem, ClaimerType } from '../../models/types'
import GlossEditor from '../GlossEditor'

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

  // Initialize form when dialog opens or claim changes
  useEffect(() => {
    if (open) {
      if (claim) {
        // Edit mode
        setGloss(claim.gloss || [])
        setConfidence(claim.confidence ?? 0.9)
        setClaimerType(claim.claimerType ?? null)
        setClaimerGloss(claim.claimerGloss || [])
        setClaimRelation(claim.claimRelation || [])
        setClaimEventId(claim.claimEventId || '')
        setClaimTimeId(claim.claimTimeId || '')
        setClaimLocationId(claim.claimLocationId || '')
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
      }
    }
  }, [open, claim])

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

          {/* Claimer Section */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">
                Claimer (optional) {claimerType && `— ${claimerType}`}
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

          {/* Confidence Slider */}
          <Box sx={{ maxWidth: 300 }}>
            <Typography variant="body2" gutterBottom>
              Confidence: {Math.round(confidence * 100)}%
            </Typography>
            <Slider
              value={confidence}
              onChange={(_, value) => setConfidence(value as number)}
              min={0}
              max={1}
              step={0.01}
              marks={confidenceMarks}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!hasContent}
        >
          {claim ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
