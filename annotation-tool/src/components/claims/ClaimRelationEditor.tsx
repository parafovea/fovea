import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Stack,
  Typography,
  Autocomplete,
  Slider,
  Alert,
  Box,
  Paper,
} from '@mui/material'
import { Claim, RelationType } from '../../models/types'

interface ClaimRelationEditorProps {
  open: boolean
  onClose: () => void
  onSave: (relation: {
    targetClaimId: string
    relationTypeId: string
    confidence?: number
    notes?: string
  }) => Promise<void>
  sourceClaim: Claim
  availableClaims: Claim[]
  relationTypes: RelationType[]
}

export function ClaimRelationEditor({
  open,
  onClose,
  onSave,
  sourceClaim,
  availableClaims,
  relationTypes,
}: ClaimRelationEditorProps) {
  const [targetClaimId, setTargetClaimId] = useState<string>('')
  const [relationTypeId, setRelationTypeId] = useState<string>('')
  const [confidence, setConfidence] = useState<number>(0.8)
  const [notes, setNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Flatten claim tree for selection
  const flattenClaims = (claims: Claim[]): Claim[] => {
    const result: Claim[] = []
    const traverse = (claims: Claim[]) => {
      for (const claim of claims) {
        result.push(claim)
        if (claim.subclaims) {
          traverse(claim.subclaims)
        }
      }
    }
    traverse(claims)
    return result
  }

  const flatClaims = flattenClaims(availableClaims).filter((c) => c.id !== sourceClaim.id)

  // Filter relation types to only show those that support claim→claim
  const claimRelationTypes = relationTypes.filter(
    (rt) => rt.sourceTypes.includes('claim') && rt.targetTypes.includes('claim')
  )

  useEffect(() => {
    if (open) {
      setTargetClaimId('')
      setRelationTypeId('')
      setConfidence(0.8)
      setNotes('')
      setError(null)
    }
  }, [open])

  const handleSave = async () => {
    // Validation
    if (!targetClaimId) {
      setError('Please select a target claim')
      return
    }
    if (!relationTypeId) {
      setError('Please select a relation type')
      return
    }
    if (targetClaimId === sourceClaim.id) {
      setError('Cannot create relation to the same claim')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await onSave({
        targetClaimId,
        relationTypeId,
        confidence,
        notes: notes.trim() || undefined,
      })
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save relation')
    } finally {
      setSaving(false)
    }
  }

  const selectedTargetClaim = flatClaims.find((c) => c.id === targetClaimId)

  const getClaimText = (claim: Claim) => {
    return claim.gloss.map((g) => g.content).join(' ')
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Create Claim Relation</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {claimRelationTypes.length === 0 && (
            <Alert severity="warning">
              No relation types support claim-to-claim relations. Please create a relation type
              with both sourceTypes and targetTypes including 'claim' in the Ontology Workspace.
            </Alert>
          )}

          {/* Source Claim (read-only) */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Source Claim
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Typography variant="body2">
                {getClaimText(sourceClaim).substring(0, 150)}
                {getClaimText(sourceClaim).length > 150 ? '...' : ''}
              </Typography>
            </Paper>
          </Box>

          {/* Relation Type */}
          <FormControl fullWidth disabled={claimRelationTypes.length === 0}>
            <InputLabel>Relation Type</InputLabel>
            <Select
              value={relationTypeId}
              onChange={(e) => setRelationTypeId(e.target.value)}
              label="Relation Type"
            >
              {claimRelationTypes.map((rt) => (
                <MenuItem key={rt.id} value={rt.id}>
                  <Box>
                    <Typography variant="body2">{rt.name}</Typography>
                    {rt.gloss && rt.gloss.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {rt.gloss.map((g) => g.content).join(' ').substring(0, 80)}
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Target Claim */}
          <Autocomplete
            options={flatClaims}
            getOptionLabel={(claim) => getClaimText(claim).substring(0, 80)}
            value={selectedTargetClaim || null}
            onChange={(_, newValue) => {
              setTargetClaimId(newValue?.id || '')
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Target Claim"
                placeholder="Select target claim"
              />
            )}
            renderOption={(props, claim) => (
              <li {...props} key={claim.id}>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="body2">
                    {getClaimText(claim).substring(0, 100)}
                    {getClaimText(claim).length > 100 ? '...' : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ID: {claim.id.substring(0, 8)}...
                  </Typography>
                </Box>
              </li>
            )}
            disabled={flatClaims.length === 0}
          />

          {flatClaims.length === 0 && (
            <Alert severity="info">
              No other claims available. Create more claims to establish relations between them.
            </Alert>
          )}

          {/* Confidence Slider */}
          <Box>
            <Typography gutterBottom>
              Confidence: {(confidence * 100).toFixed(0)}%
            </Typography>
            <Slider
              value={confidence}
              onChange={(_, value) => setConfidence(value as number)}
              min={0}
              max={1}
              step={0.05}
              marks={[
                { value: 0, label: '0%' },
                { value: 0.5, label: '50%' },
                { value: 1, label: '100%' },
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${(value * 100).toFixed(0)}%`}
            />
          </Box>

          {/* Notes */}
          <TextField
            label="Notes (optional)"
            multiline
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes explaining this relationship..."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || !targetClaimId || !relationTypeId || claimRelationTypes.length === 0}
        >
          {saving ? 'Saving...' : 'Save Relation'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
