import { useState, useEffect } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Claim, RelationType } from '@models/types'
import { useClaims, usePersonaOntology, useEntities, useEvents, useTimes } from '@store/queries'
import { glossToText } from '@/utils/glossUtils'

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
  relationTypes: RelationType[]
  personaId?: string
}

export function ClaimRelationEditor({
  open,
  onClose,
  onSave,
  sourceClaim,
  relationTypes,
  personaId,
}: ClaimRelationEditorProps) {
  const [targetClaimId, setTargetClaimId] = useState<string>('')
  const [relationTypeId, setRelationTypeId] = useState<string>('')
  const [confidence, setConfidence] = useState<number>(0.8)
  const [notes, setNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch claims using TanStack Query
  const { data: allClaims = [] } = useClaims(sourceClaim.summaryId, sourceClaim.summaryType)

  // Ontology + world for human-readable rendering of gloss items in the
  // source / target previews. Without these the preview shows raw UUIDs
  // for typeRef / objectRef / annotationRef / claimRef items.
  const { data: ontology } = usePersonaOntology(personaId)
  const entities = useEntities()
  const events = useEvents()
  const times = useTimes()

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

  const flatClaims = flattenClaims(allClaims).filter((c) => c.id !== sourceClaim.id)

  // Filter relation types to only show those that support claim->claim
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save relation')
    } finally {
      setSaving(false)
    }
  }

  const getClaimText = (claim: Claim) => {
    return glossToText(claim.gloss, ontology ?? undefined, { entities, events, times })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Claim Relation</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {claimRelationTypes.length === 0 && (
            <Alert>
              <AlertDescription>
                No relation types support claim-to-claim relations. Please create a relation type
                with both sourceTypes and targetTypes including &apos;claim&apos; in the Ontology Workspace.
              </AlertDescription>
            </Alert>
          )}

          {/* Source Claim (read-only) */}
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              Source Claim
            </p>
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm">
                {getClaimText(sourceClaim).substring(0, 150)}
                {getClaimText(sourceClaim).length > 150 ? '...' : ''}
              </p>
            </div>
          </div>

          {/* Relation Type */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="claim-relation-type">Relation Type</Label>
            <Select
              value={relationTypeId}
              onValueChange={(v) => setRelationTypeId(v ?? '')}
              disabled={claimRelationTypes.length === 0}
            >
              <SelectTrigger id="claim-relation-type" className="w-full" aria-label="Relation Type">
                <SelectValue placeholder="Select relation type" />
              </SelectTrigger>
              <SelectContent>
                {claimRelationTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>
                    <div>
                      <span className="text-sm">{rt.name}</span>
                      {rt.gloss && rt.gloss.length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {glossToText(rt.gloss, ontology ?? undefined, { entities, events, times }).substring(0, 80)}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Claim */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="claim-relation-target">Target Claim</Label>
            <Select
              value={targetClaimId}
              onValueChange={(v) => setTargetClaimId(v ?? '')}
              disabled={flatClaims.length === 0}
            >
              <SelectTrigger id="claim-relation-target" className="w-full" aria-label="Target Claim">
                <SelectValue placeholder="Select target claim" />
              </SelectTrigger>
              <SelectContent>
                {flatClaims.map((claim) => (
                  <SelectItem key={claim.id} value={claim.id}>
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {getClaimText(claim).substring(0, 100)}
                        {getClaimText(claim).length > 100 ? '...' : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ID: {claim.id.substring(0, 8)}...
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {flatClaims.length === 0 && (
            <Alert>
              <AlertDescription>
                No other claims available. Create more claims to establish relations between them.
              </AlertDescription>
            </Alert>
          )}

          {/* Confidence Slider */}
          <div className="flex flex-col gap-2">
            <Label>
              Confidence: {(confidence * 100).toFixed(0)}%
            </Label>
            <Slider
              value={[confidence]}
              onValueChange={(value) => {
                const v = Array.isArray(value) ? value[0] : value
                setConfidence(v)
              }}
              min={0}
              max={1}
              step={0.05}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes explaining this relationship..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !targetClaimId || !relationTypeId || claimRelationTypes.length === 0}
          >
            {saving ? 'Saving...' : 'Save Relation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
