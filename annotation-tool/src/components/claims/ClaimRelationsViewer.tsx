import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Claim } from '@models/types'
import { useClaimRelations, useDeleteClaimRelation, useClaims, usePersonaOntology } from '@store/queries'

interface ClaimRelationsViewerProps {
  claimId: string
  summaryId: string
  personaId: string
  onAddRelation: () => void
}

export function ClaimRelationsViewer({
  claimId,
  summaryId,
  personaId,
  onAddRelation,
}: ClaimRelationsViewerProps) {
  // TanStack Query hooks
  const { data: relationData, isLoading, error } = useClaimRelations(summaryId, claimId)
  const { data: claims = [] } = useClaims(summaryId, 'video')
  const deleteRelationMutation = useDeleteClaimRelation()
  const { data: ontology } = usePersonaOntology(personaId)

  const handleDelete = async (relationId: string) => {
    if (window.confirm('Delete this relation?')) {
      await deleteRelationMutation.mutateAsync({ summaryId, relationId, sourceClaimId: claimId })
    }
  }

  const getRelationTypeName = (relationTypeId: string) => {
    return ontology?.relationTypes.find((rt) => rt.id === relationTypeId)?.name || 'Unknown'
  }

  const getClaimText = (claimId: string): string => {
    const findClaim = (claimList: Claim[], targetId: string): Claim | null => {
      for (const claim of claimList) {
        if (claim.id === targetId) return claim
        if (claim.subclaims) {
          const found = findClaim(claim.subclaims, targetId)
          if (found) return found
        }
      }
      return null
    }

    const claim = findClaim(claims, claimId)
    if (!claim) return `Claim ${claimId.substring(0, 8)}...`
    return claim.gloss.map((g) => g.content).join(' ').substring(0, 60)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner className="size-5" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error instanceof Error ? error.message : 'Failed to load relations'}</AlertDescription>
      </Alert>
    )
  }

  const asSource = relationData?.asSource || []
  const asTarget = relationData?.asTarget || []

  return (
    <div data-testid="claim-relations-viewer">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium">
          Claim Relations
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            onAddRelation()
          }}
        >
          <Plus className="size-4" />
          Add Relation
        </Button>
      </div>

      {/* Outgoing Relations */}
      <div className="mb-4 rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          Outgoing Relations ({asSource.length})
        </h3>
        {asSource.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No outgoing relations
          </p>
        ) : (
          <ul className="space-y-1">
            {asSource.map((relation) => (
              <li key={relation.id} className="flex items-center justify-between py-1">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {getRelationTypeName(relation.relationTypeId)}
                    </Badge>
                    <ArrowRight className="size-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">
                      {getClaimText(relation.targetClaimId)}
                    </span>
                  </div>
                  {relation.confidence && (
                    <Badge variant="secondary" className="mt-1 text-[0.7rem]">
                      Confidence: {(relation.confidence * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() => handleDelete(relation.id)}
                      />
                    }
                  >
                    <Trash2 className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Delete relation</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Incoming Relations */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          Incoming Relations ({asTarget.length})
        </h3>
        {asTarget.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No incoming relations
          </p>
        ) : (
          <ul className="space-y-1">
            {asTarget.map((relation) => (
              <li key={relation.id} className="py-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-sm">
                    {getClaimText(relation.sourceClaimId)}
                  </span>
                  <ArrowLeft className="size-4 text-muted-foreground" />
                  <Badge variant="outline">
                    {getRelationTypeName(relation.relationTypeId)}
                  </Badge>
                </div>
                {relation.confidence && (
                  <Badge variant="secondary" className="mt-1 text-[0.7rem]">
                    Confidence: {(relation.confidence * 100).toFixed(0)}%
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
