import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  RadioGroup,
  Radio,
  Checkbox,
  TextField,
  Typography,
  Box,
  Stack,
  LinearProgress,
  Alert,
  Divider,
} from '@mui/material'
import { ClaimExtractionConfig, ExtractionStrategy } from '../../models/types'

interface ClaimsExtractionDialogProps {
  open: boolean
  onClose: () => void
  onExtract: (config: ClaimExtractionConfig) => void
  extracting: boolean
  progress?: number
  error?: string | null
}

export default function ClaimsExtractionDialog({
  open,
  onClose,
  onExtract,
  extracting,
  progress,
  error,
}: ClaimsExtractionDialogProps) {
  // Input Sources
  const [includeAnnotations, setIncludeAnnotations] = useState(false)
  const [includeOntology, setIncludeOntology] = useState(true)
  const [ontologyDepth, setOntologyDepth] = useState<'names-only' | 'names-and-glosses' | 'full-definitions'>('names-and-glosses')

  // Extraction Strategy
  const [extractionStrategy, setExtractionStrategy] = useState<ExtractionStrategy>('sentence-based')

  // Parameters
  const [maxClaims, setMaxClaims] = useState(50)
  const [minConfidence, setMinConfidence] = useState(0.5)

  const handleExtract = () => {
    const config: ClaimExtractionConfig = {
      inputSources: {
        includeSummaryText: true, // Always include summary text
        includeAnnotations,
        includeOntology,
        ontologyDepth,
      },
      extractionStrategy,
      maxClaimsPerSummary: maxClaims,
      minConfidence,
    }

    onExtract(config)
  }

  const handleCancel = () => {
    if (!extracting) {
      onClose()
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { minHeight: '500px' },
      }}
    >
      <DialogTitle>Extract Claims from Summary</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Input Sources Section */}
          <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
              Input Sources
            </Typography>
            <Stack spacing={1}>
              <FormControlLabel
                control={<Checkbox checked={true} disabled />}
                label="Summary Text (required)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeAnnotations}
                    onChange={(e) => setIncludeAnnotations(e.target.checked)}
                  />
                }
                label="Annotations (enable @references)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeOntology}
                    onChange={(e) => setIncludeOntology(e.target.checked)}
                  />
                }
                label="Ontology (enable #references)"
              />
              {includeOntology && (
                <Box sx={{ ml: 4 }}>
                  <FormControl component="fieldset">
                    <RadioGroup
                      value={ontologyDepth}
                      onChange={(e) => setOntologyDepth(e.target.value as any)}
                    >
                      <FormControlLabel
                        value="names-only"
                        control={<Radio size="small" />}
                        label="Names only"
                      />
                      <FormControlLabel
                        value="names-and-glosses"
                        control={<Radio size="small" />}
                        label="Names + Glosses (default)"
                      />
                      <FormControlLabel
                        value="full-definitions"
                        control={<Radio size="small" />}
                        label="Full definitions"
                      />
                    </RadioGroup>
                  </FormControl>
                </Box>
              )}
            </Stack>
          </Box>

          <Divider />

          {/* Extraction Strategy Section */}
          <Box>
            <FormControl component="fieldset" fullWidth>
              <FormLabel component="legend" sx={{ fontWeight: 600, mb: 1 }}>
                Extraction Strategy
              </FormLabel>
              <RadioGroup
                value={extractionStrategy}
                onChange={(e) => setExtractionStrategy(e.target.value as ExtractionStrategy)}
              >
                <FormControlLabel
                  value="sentence-based"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">Sentence-based (default)</Typography>
                      <Typography variant="caption" color="text.secondary">
                        One claim per sentence, with subclaims
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="semantic-units"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">Semantic units</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Extract from logical chunks
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="hierarchical"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">Hierarchical</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Top-down decomposition
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>
          </Box>

          <Divider />

          {/* Parameters Section */}
          <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
              Parameters
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Max Claims"
                type="number"
                value={maxClaims}
                onChange={(e) => setMaxClaims(Math.max(1, Math.min(200, parseInt(e.target.value) || 50)))}
                inputProps={{ min: 1, max: 200 }}
                helperText="Maximum number of claims to extract (1-200)"
                fullWidth
              />
              <TextField
                label="Min Confidence"
                type="number"
                value={minConfidence}
                onChange={(e) => setMinConfidence(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.5)))}
                inputProps={{ min: 0, max: 1, step: 0.1 }}
                helperText="Minimum confidence threshold (0-1)"
                fullWidth
              />
            </Stack>
          </Box>

          {/* Progress Indicator */}
          {extracting && (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Extracting claims...
              </Typography>
              <LinearProgress
                variant={progress !== null && progress !== undefined ? 'determinate' : 'indeterminate'}
                value={progress || 0}
              />
              {progress !== null && progress !== undefined && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  {Math.round(progress)}% complete
                </Typography>
              )}
            </Box>
          )}

          {/* Error Alert */}
          {error && (
            <Alert severity="error" onClose={() => {}}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} disabled={extracting}>
          Cancel
        </Button>
        <Button
          onClick={handleExtract}
          variant="contained"
          disabled={extracting}
        >
          {extracting ? 'Extracting...' : 'Extract Claims'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
