import { useState, useEffect } from 'react'
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  Alert,
  Paper,
  Chip,
  Link,
  CircularProgress,
} from '@mui/material'
import {
  Language as WikidataIcon,
  OpenInNew as OpenInNewIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material'
import WikidataSearch from '../WikidataSearch'
import { useWikidataImport, ImportType, WikidataImportData } from '../../hooks/useWikidataImport'

interface WikidataImportFlowProps {
  /** Type of item being imported */
  type: ImportType
  /** Persona ID for ontology types */
  personaId?: string
  /** Entity type for search filtering (type, object, time) */
  entityType?: 'type' | 'object' | 'time'
  /** Object subtype for search filtering (entity, event, location) */
  objectSubtype?: 'entity' | 'event' | 'location'
  /** Callback when import completes successfully */
  onSuccess?: (id: string) => void
  /** Callback when import fails */
  onError?: (error: Error) => void
  /** Callback when user cancels */
  onCancel?: () => void
}

/**
 * Stepper-based Wikidata import flow component.
 *
 * Provides an industry-standard import experience with search, preview, and success steps.
 * Implements one-click import with undo functionality (10-second window).
 *
 * @example
 * ```tsx
 * <WikidataImportFlow
 *   type="entity-type"
 *   personaId={personaId}
 *   entityType="type"
 *   onSuccess={(id) => toast.success('Imported successfully')}
 *   onCancel={() => setDialogOpen(false)}
 * />
 * ```
 */
export default function WikidataImportFlow({
  type,
  personaId,
  entityType = 'type',
  objectSubtype,
  onSuccess,
  onError,
  onCancel,
}: WikidataImportFlowProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [selectedData, setSelectedData] = useState<WikidataImportData | null>(null)
  const [importedId, setImportedId] = useState<string | null>(null)
  const [importError, setImportError] = useState<Error | null>(null)

  const { importItem, importing, error, undo } = useWikidataImport(
    type,
    personaId,
    (id) => {
      setImportedId(id)
      setActiveStep(2)
      onSuccess?.(id)
    },
    (err) => {
      setImportError(err)
      onError?.(err)
    }
  )

  useEffect(() => {
    if (error) {
      setImportError(new Error(error))
    }
  }, [error])

  const steps = ['Search Wikidata', 'Preview & Confirm', 'Success']

  const handleDataSelect = (data: WikidataImportData) => {
    setSelectedData(data)
    setActiveStep(1)
  }

  const handleImport = async () => {
    if (!selectedData) return
    try {
      await importItem(selectedData)
    } catch (err) {
      // Error handled by hook callback
    }
  }

  const handleUndo = () => {
    if (importedId) {
      try {
        undo(importedId)
        setImportedId(null)
        setActiveStep(0)
        setSelectedData(null)
      } catch (err) {
        setImportError(err instanceof Error ? err : new Error('Failed to undo import'))
      }
    }
  }

  const handleRetry = () => {
    setImportError(null)
    setActiveStep(0)
    setSelectedData(null)
  }

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1)
      setImportError(null)
    }
  }

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        // Step 1: Search
        return (
          <Box sx={{ mt: 3 }}>
            <WikidataSearch
              onImport={handleDataSelect}
              entityType={entityType}
              objectSubtype={objectSubtype}
            />
          </Box>
        )

      case 1:
        // Step 2: Preview & Confirm
        if (!selectedData) return null
        return (
          <Box sx={{ mt: 3 }}>
            <Alert severity="info" icon={<WikidataIcon />} sx={{ mb: 2 }}>
              Review the information below. Clicking "Import and Save" will immediately add this item to your {type.replace('-', ' ')}.
              You will have 10 seconds to undo the import.
            </Alert>

            <Paper variant="outlined" sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="h6">{selectedData.name}</Typography>
                  <Link
                    href={selectedData.wikidataUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <Typography variant="caption">{selectedData.wikidataId}</Typography>
                    <OpenInNewIcon fontSize="small" />
                  </Link>
                </Box>

                {selectedData.description && (
                  <Typography variant="body2" color="text.secondary">
                    {selectedData.description}
                  </Typography>
                )}

                {selectedData.aliases && selectedData.aliases.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Also known as:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                      {selectedData.aliases.map((alias, index) => (
                        <Chip key={index} label={alias} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </Box>
                )}

                {selectedData.coordinates && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Coordinates:
                    </Typography>
                    <Typography variant="body2">
                      {selectedData.coordinates.latitude}, {selectedData.coordinates.longitude}
                      {selectedData.coordinates.altitude && ` (${selectedData.coordinates.altitude}m)`}
                    </Typography>
                  </Box>
                )}

                {selectedData.temporalData && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Temporal Information Available
                    </Typography>
                    <Chip label="Includes time data" size="small" color="info" variant="outlined" sx={{ ml: 1 }} />
                  </Box>
                )}
              </Box>
            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button onClick={handleBack}>
                Back
              </Button>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleImport}
                  disabled={importing}
                  startIcon={importing ? <CircularProgress size={16} /> : <WikidataIcon />}
                >
                  {importing ? 'Importing...' : 'Import and Save'}
                </Button>
              </Box>
            </Box>
          </Box>
        )

      case 2:
        // Step 3: Success
        return (
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <SuccessIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Successfully Imported!
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              "{selectedData?.name}" has been added to your {type.replace('-', ' ')}.
            </Typography>

            <Alert severity="success" sx={{ mt: 2, textAlign: 'left' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">
                  Import successful. You have 10 seconds to undo this action.
                </Typography>
                <Button onClick={handleUndo} size="small" variant="outlined">
                  Undo
                </Button>
              </Box>
            </Alert>

            <Box sx={{ mt: 3 }}>
              <Button variant="contained" onClick={onCancel}>
                Done
              </Button>
            </Box>
          </Box>
        )

      default:
        return null
    }
  }

  // Error state
  if (importError && activeStep !== 2) {
    return (
      <Box sx={{ mt: 3 }}>
        <Alert
          severity="error"
          icon={<ErrorIcon />}
          action={
            <Button color="inherit" size="small" onClick={handleRetry}>
              Retry
            </Button>
          }
        >
          <Typography variant="body2" fontWeight="bold">
            Import Failed
          </Typography>
          <Typography variant="body2">
            {importError.message}
          </Typography>
        </Alert>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button onClick={handleBack} disabled={activeStep === 0}>
            Back
          </Button>
          <Button onClick={onCancel}>
            Cancel
          </Button>
        </Box>
      </Box>
    )
  }

  return (
    <Box>
      <Stepper activeStep={activeStep} sx={{ mb: 2 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {renderStepContent()}
    </Box>
  )
}
