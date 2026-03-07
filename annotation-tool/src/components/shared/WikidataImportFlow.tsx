import { useState, useEffect } from 'react'
import { Globe, ExternalLink, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription, AlertAction } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import WikidataSearch from './WikidataSearch'
import { useWikidataImport, ImportType, WikidataImportData } from '@hooks/wikidata'

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
 * Provides an import experience with search, preview, and success steps.
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

  const handleDataSelect = async (data: WikidataImportData) => {
    setSelectedData(data)
    try {
      await importItem(data)
      // Close dialog after successful one-click import
      onCancel?.()
    } catch (err) {
      // Error handled by useWikidataImport hook
    }
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
          <div className="mt-6">
            <WikidataSearch
              onImport={handleDataSelect}
              entityType={entityType}
              objectSubtype={objectSubtype}
              importType={type}
            />
          </div>
        )

      case 1:
        // Step 2: Preview & Confirm
        if (!selectedData) return null
        return (
          <div className="mt-6">
            <Alert className="mb-4">
              <Globe className="h-4 w-4" />
              <AlertDescription>
                Review the information below. Clicking "Import and Save" will immediately add this item to your {type.replace('-', ' ')}.
                You will have 10 seconds to undo the import.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border p-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h6 className="text-base font-semibold">{selectedData.name}</h6>
                  <a
                    href={selectedData.wikidataUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <span className="text-xs">{selectedData.wikidataId}</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>

                {selectedData.description && (
                  <p className="text-sm text-muted-foreground">
                    {selectedData.description}
                  </p>
                )}

                {selectedData.aliases && selectedData.aliases.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Also known as:
                    </p>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {selectedData.aliases.map((alias, index) => (
                        <Badge key={index} variant="outline">{alias}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedData.coordinates && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Coordinates:
                    </p>
                    <p className="text-sm">
                      {selectedData.coordinates.latitude}, {selectedData.coordinates.longitude}
                      {selectedData.coordinates.altitude && ` (${selectedData.coordinates.altitude}m)`}
                    </p>
                  </div>
                )}

                {selectedData.temporalData && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Temporal Information Available
                    </p>
                    <Badge variant="outline" className="mt-1">Includes time data</Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? (
                    <Spinner className="mr-2 h-4 w-4" />
                  ) : (
                    <Globe className="mr-2 h-4 w-4" />
                  )}
                  {importing ? 'Importing...' : 'Import and Save'}
                </Button>
              </div>
            </div>
          </div>
        )

      case 2:
        // Step 3: Success
        return (
          <div className="mt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h6 className="text-base font-semibold mb-2">
              Successfully Imported!
            </h6>
            <p className="text-sm text-muted-foreground mb-4">
              "{selectedData?.name}" has been added to your {type.replace('-', ' ')}.
            </p>

            <Alert className="mt-4 text-left">
              <AlertDescription>
                <div className="flex justify-between items-center">
                  <span className="text-sm">
                    Import successful. You have 10 seconds to undo this action.
                  </span>
                  <Button onClick={handleUndo} size="sm" variant="outline">
                    Undo
                  </Button>
                </div>
              </AlertDescription>
            </Alert>

            <div className="mt-6">
              <Button onClick={onCancel}>
                Done
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // Error state
  if (importError && activeStep !== 2) {
    return (
      <div className="mt-6">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle className="font-bold">Import Failed</AlertTitle>
          <AlertDescription>
            {importError.message}
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </AlertAction>
        </Alert>
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={handleBack} disabled={activeStep === 0}>
            Back
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4">
        {steps.map((label, index) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium ${
              index <= activeStep
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}>
              {index + 1}
            </div>
            <span className={`text-sm ${
              index <= activeStep ? 'text-foreground' : 'text-muted-foreground'
            }`}>
              {label}
            </span>
            {index < steps.length - 1 && (
              <div className={`h-px w-8 ${
                index < activeStep ? 'bg-primary' : 'bg-muted'
              }`} />
            )}
          </div>
        ))}
      </div>

      {renderStepContent()}
    </div>
  )
}
