import { useState, useMemo, memo, useCallback } from 'react'

import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Claim, ClaimTextSpan } from '@models/types'
import { GlossRenderer } from '@components/ontology/GlossRenderer'
import { ClaimRelationsViewer } from './ClaimRelationsViewer'
import { ClaimRelationEditor } from './ClaimRelationEditor'
import { useCreateClaimRelation, usePersonaOntology } from '@store/queries'

interface ClaimsViewerProps {
  claims: Claim[]
  summaryId: string
  personaId?: string
  onEditClaim?: (claim: Claim) => void
  onAddClaim?: (parentClaimId?: string) => void
  onDeleteClaim?: (claim: Claim) => void
  selectedClaimId?: string | null
  highlightSpans?: boolean
  loading?: boolean
  error?: string | null
  onClaimSelect?: (claimId: string, sourceSpans: ClaimTextSpan[]) => void
}

interface ClaimTreeNodeProps {
  claim: Claim
  depth: number
  summaryId: string
  personaId?: string
  selectedClaimId?: string | null
  allClaims: Claim[]
  onEdit?: (claim: Claim) => void
  onDelete?: (claim: Claim) => void
  onAdd?: (parentClaimId: string) => void
  onSelect?: (claimId: string, sourceSpans: ClaimTextSpan[]) => void
}

/**
 * Recursive component for rendering claim hierarchy
 */
const ClaimTreeNode = memo(function ClaimTreeNode({
  claim,
  depth,
  summaryId,
  personaId,
  selectedClaimId,
  allClaims,
  onEdit,
  onDelete,
  onAdd,
  onSelect,
}: ClaimTreeNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const [showRelations, setShowRelations] = useState(false)
  const [relationEditorOpen, setRelationEditorOpen] = useState(false)
  const hasSubclaims = claim.subclaims && claim.subclaims.length > 0
  const isSelected = selectedClaimId === claim.id

  // TanStack Query hook for persona ontology
  const { data: ontology } = usePersonaOntology(personaId)

  const createClaimRelationMutation = useCreateClaimRelation()

  const handleToggle = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    if (hasSubclaims) {
      setExpanded(!expanded)
    }
  }

  const handleClick = () => {
    // If claim has subclaims, toggle expand/collapse instead of selecting
    if (hasSubclaims) {
      setExpanded(!expanded)
    } else if (onSelect) {
      // Only call onSelect if there are no subclaims
      onSelect(claim.id, claim.textSpans || [])
    }
  }

  const handleCreateRelation = async (relation: {
    targetClaimId: string
    relationTypeId: string
    confidence?: number
    notes?: string
  }) => {
    await createClaimRelationMutation.mutateAsync({
      summaryId,
      sourceClaimId: claim.id,
      relation,
    })
  }

  return (
    <div style={{ marginLeft: `${depth * 1.5}rem` }}>
      <div
        className={cn(
          'mb-2 cursor-pointer rounded-lg border p-3 transition-colors duration-200',
          isSelected ? 'bg-accent' : 'bg-card hover:bg-accent/50',
        )}
        onClick={handleClick}
      >
        <div className="flex items-start gap-2">
          {/* Expand/Collapse Icon */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleToggle}
            disabled={!hasSubclaims}
            className="-mt-0.5"
          >
            {hasSubclaims ? (
              expanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )
            ) : (
              <span className="size-5" />
            )}
          </Button>

          {/* Claim Content */}
          <div className="min-w-0 flex-1">
            {/* Claim Text */}
            <p className="mb-1 text-sm">
              <strong>Claim {depth === 0 ? '' : `(depth ${depth})`}:</strong>{' '}
              {claim.gloss && claim.gloss.length > 0 ? (
                <GlossRenderer gloss={claim.gloss} personaId={personaId} inline={true} claims={allClaims} />
              ) : (
                claim.text
              )}
            </p>

            {/* Metadata Badges */}
            <div className="flex flex-wrap gap-1">
              {claim.confidence !== undefined && claim.confidence !== null && (
                <Badge variant="outline" className="h-5">
                  {Math.round(claim.confidence * 100)}% confident
                </Badge>
              )}
              {claim.extractionStrategy && (
                <Badge variant="outline" className="h-5">
                  {claim.extractionStrategy}
                </Badge>
              )}
              {claim.modelUsed && (
                <Badge variant="outline" className="h-5">
                  {claim.modelUsed}
                </Badge>
              )}
              {hasSubclaims && (
                <Badge variant="outline" className="h-5">
                  {claim.subclaims!.length} subclaim{claim.subclaims!.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className={showRelations ? 'text-primary' : ''}
                    aria-label={showRelations ? 'Hide relations' : 'Show relations'}
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowRelations(!showRelations)
                    }}
                  />
                }
              >
                <GitBranch className="size-4" />
              </TooltipTrigger>
              <TooltipContent>{showRelations ? 'Hide relations' : 'Show relations'}</TooltipContent>
            </Tooltip>
            {onAdd && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Add subclaim"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAdd(claim.id)
                      }}
                    />
                  }
                >
                  <Plus className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Add subclaim</TooltipContent>
              </Tooltip>
            )}
            {onEdit && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Edit claim"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(claim)
                      }}
                    />
                  }
                >
                  <Pencil className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Edit claim</TooltipContent>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive"
                      aria-label="Delete claim"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(claim)
                      }}
                    />
                  }
                >
                  <Trash2 className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Delete claim</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Relations Section */}
        {showRelations && (
          <div onClick={(e) => e.stopPropagation()}>
            <Separator className="my-4" />
            <ClaimRelationsViewer
              claimId={claim.id}
              summaryId={summaryId}
              personaId={personaId || ''}
              onAddRelation={() => setRelationEditorOpen(true)}
            />
          </div>
        )}
      </div>

      {/* Relation Editor Dialog */}
      {personaId && (
        <ClaimRelationEditor
          open={relationEditorOpen}
          onClose={() => setRelationEditorOpen(false)}
          onSave={handleCreateRelation}
          sourceClaim={claim}
          relationTypes={ontology?.relationTypes || []}
          personaId={personaId}
        />
      )}

      {/* Subclaims */}
      {hasSubclaims && (
        <Collapsible open={expanded}>
          <CollapsibleContent>
            <div>
              {claim.subclaims!.map((subclaim) => (
                <ClaimTreeNode
                  key={subclaim.id}
                  claim={subclaim}
                  depth={depth + 1}
                  summaryId={summaryId}
                  personaId={personaId}
                  selectedClaimId={selectedClaimId}
                  allClaims={allClaims}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAdd={onAdd}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for optimization
  return (
    prevProps.claim.id === nextProps.claim.id &&
    prevProps.selectedClaimId === nextProps.selectedClaimId &&
    prevProps.claim.updatedAt === nextProps.claim.updatedAt
  )
})

/**
 * ClaimsViewer - Hierarchical tree view for displaying claims and subclaims
 */
export function ClaimsViewer({
  claims,
  summaryId,
  personaId,
  onEditClaim,
  onAddClaim,
  onDeleteClaim,
  selectedClaimId,
  loading = false,
  error = null,
  onClaimSelect,
}: ClaimsViewerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [minConfidence, setMinConfidence] = useState<number | ''>('')
  const [filterStrategy, setFilterStrategy] = useState<string>('all')
  const [filterModel, setFilterModel] = useState<string>('all')

  // Memoize event handlers to prevent unnecessary re-renders
  const handleSelect = useCallback((claimId: string, sourceSpans: ClaimTextSpan[]) => {
    // Notify parent component when claim is selected with its source spans
    if (onClaimSelect) {
      onClaimSelect(claimId, sourceSpans)
    }
  }, [onClaimSelect])

  const handleEdit = useCallback((claim: Claim) => {
    if (onEditClaim) {
      onEditClaim(claim)
    }
  }, [onEditClaim])

  const handleDelete = useCallback((claim: Claim) => {
    if (onDeleteClaim) {
      onDeleteClaim(claim)
    }
  }, [onDeleteClaim])

  const handleAdd = useCallback((parentClaimId?: string) => {
    if (onAddClaim) {
      onAddClaim(parentClaimId)
    }
  }, [onAddClaim])

  // Filter claims based on search and filters
  const filteredClaims = useMemo(() => {
    if (!claims) return []

    const filterClaim = (claim: Claim): Claim | null => {
      let matches = true

      // Search term filter (check claim text/gloss)
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const claimText = claim.gloss
          .map((g) => g.content)
          .join(' ')
          .toLowerCase()
        matches = claimText.includes(searchLower) || claim.text?.toLowerCase().includes(searchLower)
      }

      // Confidence filter
      if (minConfidence !== '' && claim.confidence !== null && claim.confidence !== undefined) {
        matches = matches && claim.confidence >= minConfidence
      }

      // Strategy filter
      if (filterStrategy !== 'all' && claim.extractionStrategy) {
        matches = matches && claim.extractionStrategy === filterStrategy
      }

      // Model filter
      if (filterModel !== 'all' && claim.modelUsed) {
        matches = matches && claim.modelUsed === filterModel
      }

      // Filter subclaims recursively
      if (claim.subclaims && claim.subclaims.length > 0) {
        const filteredSubclaims = claim.subclaims
          .map(filterClaim)
          .filter((c): c is Claim => c !== null)

        // If this claim matches OR has matching subclaims, include it
        if (matches || filteredSubclaims.length > 0) {
          return {
            ...claim,
            subclaims: filteredSubclaims,
          }
        }
      }

      return matches ? claim : null
    }

    return claims.map(filterClaim).filter((c): c is Claim => c !== null)
  }, [claims, searchTerm, minConfidence, filterStrategy, filterModel])

  // Loading state
  if (loading) {
    return (
      <div>
        <div className="mb-4 rounded-lg border p-4">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full" />
            <div className="flex gap-4">
              <Skeleton className="h-10 w-[150px]" />
              <Skeleton className="h-10 w-[150px]" />
              <Skeleton className="h-10 w-[150px]" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[100px] w-full" />
          <Skeleton className="h-[80px] w-full" />
          <Skeleton className="h-[120px] w-full" />
        </div>
      </div>
    )
  }

  // Empty state
  if (!claims || claims.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-8 text-center">
        <p className="mb-2 text-base font-semibold text-muted-foreground">
          No claims yet
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          Extract claims from the summary or add them manually to get started.
        </p>
        {onAddClaim && (
          <Button
            variant="outline"
            onClick={() => onAddClaim()}
          >
            <Plus className="size-4" />
            Add Manual Claim
          </Button>
        )}
      </div>
    )
  }

  return (
    <div data-tour-id="claims-viewer">
      {/* Error state */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filter Bar */}
      <div className="mb-4 rounded-lg border p-4">
        <div className="flex flex-col gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search claims..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex min-w-[150px] flex-col gap-1">
              <Label className="text-xs">Min Confidence</Label>
              <Select
                value={String(minConfidence)}
                onValueChange={(value) => setMinConfidence(value === '' || value === null ? '' : Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="0.5">50%+</SelectItem>
                  <SelectItem value="0.7">70%+</SelectItem>
                  <SelectItem value="0.8">80%+</SelectItem>
                  <SelectItem value="0.9">90%+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-[150px] flex-col gap-1">
              <Label className="text-xs">Strategy</Label>
              <Select
                value={filterStrategy}
                onValueChange={(v) => setFilterStrategy(v ?? 'all')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="sentence-based">Sentence-based</SelectItem>
                  <SelectItem value="semantic-units">Semantic Units</SelectItem>
                  <SelectItem value="hierarchical">Hierarchical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-[150px] flex-col gap-1">
              <Label className="text-xs">Model</Label>
              <Select
                value={filterModel}
                onValueChange={(v) => setFilterModel(v ?? 'all')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="gpt-4">GPT-4</SelectItem>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5</SelectItem>
                  <SelectItem value="llama-3-70b">Llama 3 70B</SelectItem>
                  <SelectItem value="qwen-2.5">Qwen 2.5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Results count */}
          <p className="text-xs text-muted-foreground">
            Showing {filteredClaims.length} of {claims.length} claim{claims.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Claims Tree */}
      {filteredClaims.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No claims match your filters
          </p>
        </div>
      ) : (
        <div>
          {filteredClaims.map((claim) => (
            <ClaimTreeNode
              key={claim.id}
              claim={claim}
              depth={0}
              summaryId={summaryId}
              personaId={personaId}
              selectedClaimId={selectedClaimId}
              allClaims={claims}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAdd={handleAdd}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}
