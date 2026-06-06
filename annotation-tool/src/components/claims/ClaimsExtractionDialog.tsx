import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { ClaimExtractionConfig, ExtractionStrategy } from '@models/types'

interface ClaimsExtractionDialogProps {
  open: boolean
  onClose: () => void
  onExtract: (config: ClaimExtractionConfig) => void
  extracting: boolean
  progress?: number
  error?: string | null
}

export function ClaimsExtractionDialog({
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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent data-tour-id="claims-extraction-dialog" className="sm:max-w-md min-h-[500px]">
        <DialogHeader>
          <DialogTitle>Extract Claims from Summary</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {/* Input Sources Section */}
          <div>
            <p className="mb-2 text-sm font-semibold">
              Input Sources
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={true} disabled id="summary-text" />
                <Label htmlFor="summary-text" className="text-sm text-muted-foreground">Summary Text (required)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={includeAnnotations}
                  onCheckedChange={(checked) => setIncludeAnnotations(checked === true)}
                  id="include-annotations"
                />
                <Label htmlFor="include-annotations" className="text-sm">Annotations (enable @references)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={includeOntology}
                  onCheckedChange={(checked) => setIncludeOntology(checked === true)}
                  id="include-ontology"
                />
                <Label htmlFor="include-ontology" className="text-sm">Ontology (enable #references)</Label>
              </div>
              {includeOntology && (
                <div className="ml-8">
                  <RadioGroup
                    value={ontologyDepth}
                    onValueChange={(value) => setOntologyDepth(value as typeof ontologyDepth)}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="names-only" id="names-only" />
                      <Label htmlFor="names-only" className="text-sm">Names only</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="names-and-glosses" id="names-and-glosses" />
                      <Label htmlFor="names-and-glosses" className="text-sm">Names + Glosses (default)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="full-definitions" id="full-definitions" />
                      <Label htmlFor="full-definitions" className="text-sm">Full definitions</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Extraction Strategy Section */}
          <div>
            <p className="mb-2 text-sm font-semibold">
              Extraction Strategy
            </p>
            <RadioGroup
              value={extractionStrategy}
              onValueChange={(value) => setExtractionStrategy(value as ExtractionStrategy)}
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="sentence-based" id="sentence-based" className="mt-1" />
                <Label htmlFor="sentence-based" className="flex flex-col gap-0.5">
                  <span className="text-sm">Sentence-based (default)</span>
                  <span className="text-xs text-muted-foreground">
                    One claim per sentence, with subclaims
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="semantic-units" id="semantic-units" className="mt-1" />
                <Label htmlFor="semantic-units" className="flex flex-col gap-0.5">
                  <span className="text-sm">Semantic units</span>
                  <span className="text-xs text-muted-foreground">
                    Extract from logical chunks
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="hierarchical" id="hierarchical" className="mt-1" />
                <Label htmlFor="hierarchical" className="flex flex-col gap-0.5">
                  <span className="text-sm">Hierarchical</span>
                  <span className="text-xs text-muted-foreground">
                    Top-down decomposition
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Parameters Section */}
          <div>
            <p className="mb-2 text-sm font-semibold">
              Parameters
            </p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="max-claims">Max Claims</Label>
                <Input
                  id="max-claims"
                  type="number"
                  value={maxClaims}
                  onChange={(e) => setMaxClaims(Math.max(1, Math.min(200, parseInt(e.target.value) || 50)))}
                  min={1}
                  max={200}
                />
                <p className="text-xs text-muted-foreground">Maximum number of claims to extract (1-200)</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="min-confidence">Min Confidence</Label>
                <Input
                  id="min-confidence"
                  type="number"
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.5)))}
                  min={0}
                  max={1}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">Minimum confidence threshold (0-1)</p>
              </div>
            </div>
          </div>

          {/* Progress Indicator */}
          {extracting && (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Extracting claims...
              </p>
              <Progress value={progress !== null && progress !== undefined ? progress : null} />
              {progress !== null && progress !== undefined && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {Math.round(progress)}% complete
                </p>
              )}
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={extracting}>
            Cancel
          </Button>
          <Button
            onClick={handleExtract}
            disabled={extracting}
          >
            {extracting ? 'Extracting...' : 'Extract Claims'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
