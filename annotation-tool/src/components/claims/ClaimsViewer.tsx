import { useState, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Box,
  Paper,
  Stack,
  Typography,
  IconButton,
  Chip,
  Collapse,
  Button,
  Tooltip,
  Divider,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
  Alert,
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  AccountTree as RelationIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import { Claim } from '../../models/types'
import { GlossRenderer } from '../GlossRenderer'
import { ClaimRelationsViewer } from './ClaimRelationsViewer'
import { ClaimRelationEditor } from './ClaimRelationEditor'
import { createClaimRelation } from '../../store/claimsSlice'
import { RootState, AppDispatch } from '../../store/store'

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
  onSelect?: (claimId: string) => void
}

/**
 * Recursive component for rendering claim hierarchy
 */
function ClaimTreeNode({
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
  const dispatch = useDispatch<AppDispatch>()
  const [expanded, setExpanded] = useState(true)
  const [showRelations, setShowRelations] = useState(false)
  const [relationEditorOpen, setRelationEditorOpen] = useState(false)
  const hasSubclaims = claim.subclaims && claim.subclaims.length > 0
  const isSelected = selectedClaimId === claim.id

  const ontology = useSelector((state: RootState) =>
    state.persona.personaOntologies.find((o) => o.personaId === personaId)
  )

  const handleToggle = () => {
    if (hasSubclaims) {
      setExpanded(!expanded)
    }
  }

  const handleClick = () => {
    if (onSelect) {
      onSelect(claim.id)
    }
  }

  const handleCreateRelation = async (relation: {
    targetClaimId: string
    relationTypeId: string
    confidence?: number
    notes?: string
  }) => {
    await dispatch(
      createClaimRelation({
        summaryId,
        sourceClaimId: claim.id,
        relation,
      })
    )
  }

  return (
    <Box sx={{ ml: depth * 3 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          mb: 1,
          bgcolor: isSelected ? 'action.selected' : 'background.paper',
          '&:hover': {
            bgcolor: isSelected ? 'action.selected' : 'action.hover',
          },
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
        onClick={handleClick}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start">
          {/* Expand/Collapse Icon */}
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              handleToggle()
            }}
            disabled={!hasSubclaims}
            sx={{ mt: -0.5 }}
          >
            {hasSubclaims ? (
              expanded ? (
                <ExpandMoreIcon fontSize="small" />
              ) : (
                <ChevronRightIcon fontSize="small" />
              )
            ) : (
              <Box sx={{ width: 20 }} />
            )}
          </IconButton>

          {/* Claim Content */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Claim Text */}
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <strong>Claim {depth === 0 ? '' : `(depth ${depth})`}:</strong>{' '}
              {claim.gloss && claim.gloss.length > 0 ? (
                <GlossRenderer gloss={claim.gloss} personaId={personaId} inline={true} />
              ) : (
                claim.text
              )}
            </Typography>

            {/* Metadata Chips */}
            <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
              {claim.confidence !== undefined && claim.confidence !== null && (
                <Chip
                  label={`${Math.round(claim.confidence * 100)}% confident`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20 }}
                />
              )}
              {claim.extractionStrategy && (
                <Chip
                  label={claim.extractionStrategy}
                  size="small"
                  variant="outlined"
                  color="primary"
                  sx={{ height: 20 }}
                />
              )}
              {claim.modelUsed && (
                <Chip
                  label={claim.modelUsed}
                  size="small"
                  variant="outlined"
                  color="secondary"
                  sx={{ height: 20 }}
                />
              )}
              {hasSubclaims && (
                <Chip
                  label={`${claim.subclaims!.length} subclaim${claim.subclaims!.length > 1 ? 's' : ''}`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20 }}
                />
              )}
            </Stack>
          </Box>

          {/* Action Buttons */}
          <Stack direction="row" spacing={0.5}>
            <Tooltip title={showRelations ? 'Hide relations' : 'Show relations'}>
              <IconButton
                size="small"
                color={showRelations ? 'primary' : 'default'}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowRelations(!showRelations)
                }}
              >
                <RelationIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {onAdd && (
              <Tooltip title="Add subclaim">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAdd(claim.id)
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {onEdit && (
              <Tooltip title="Edit claim">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(claim)
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title="Delete claim">
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(claim)
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>

        {/* Relations Section */}
        {showRelations && (
          <>
            <Divider sx={{ my: 2 }} />
            <ClaimRelationsViewer
              claimId={claim.id}
              summaryId={summaryId}
              personaId={personaId || ''}
              onAddRelation={() => setRelationEditorOpen(true)}
            />
          </>
        )}
      </Paper>

      {/* Relation Editor Dialog */}
      {personaId && ontology && (
        <ClaimRelationEditor
          open={relationEditorOpen}
          onClose={() => setRelationEditorOpen(false)}
          onSave={handleCreateRelation}
          sourceClaim={claim}
          availableClaims={allClaims}
          relationTypes={ontology.relationTypes}
        />
      )}

      {/* Subclaims */}
      {hasSubclaims && (
        <Collapse in={expanded}>
          <Box>
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
          </Box>
        </Collapse>
      )}
    </Box>
  )
}

/**
 * ClaimsViewer - Hierarchical tree view for displaying claims and subclaims
 */
export default function ClaimsViewer({
  claims,
  summaryId,
  personaId,
  onEditClaim,
  onAddClaim,
  onDeleteClaim,
  selectedClaimId,
  loading = false,
  error = null,
}: ClaimsViewerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [minConfidence, setMinConfidence] = useState<number | ''>('')
  const [filterStrategy, setFilterStrategy] = useState<string>('all')
  const [filterModel, setFilterModel] = useState<string>('all')

  const handleSelect = (_claimId: string) => {
    // Selection is handled by parent component via Redux
  }

  // Loading state
  if (loading) {
    return (
      <Box>
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack spacing={2}>
            <Skeleton variant="rectangular" height={40} />
            <Stack direction="row" spacing={2}>
              <Skeleton variant="rectangular" height={40} width={150} />
              <Skeleton variant="rectangular" height={40} width={150} />
              <Skeleton variant="rectangular" height={40} width={150} />
            </Stack>
          </Stack>
        </Paper>
        <Stack spacing={2}>
          <Skeleton variant="rectangular" height={100} />
          <Skeleton variant="rectangular" height={80} />
          <Skeleton variant="rectangular" height={120} />
        </Stack>
      </Box>
    )
  }

  // Error state
  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        <Typography variant="body2" gutterBottom>
          Failed to load claims
        </Typography>
        <Typography variant="caption">{error}</Typography>
      </Alert>
    )
  }

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
        matches = matches && (claimText.includes(searchLower) || claim.text?.toLowerCase().includes(searchLower))
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

  // Empty state
  if (!claims || claims.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 4,
          textAlign: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No claims yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Extract claims from the summary or add them manually to get started.
        </Typography>
        {onAddClaim && (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => onAddClaim()}
          >
            Add Manual Claim
          </Button>
        )}
      </Paper>
    )
  }

  return (
    <Box>
      {/* Filter Bar */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          {/* Search */}
          <TextField
            placeholder="Search claims..."
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          {/* Filters */}
          <Stack direction="row" spacing={2}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Min Confidence</InputLabel>
              <Select
                value={minConfidence}
                onChange={(e) => setMinConfidence(e.target.value === '' ? '' : Number(e.target.value))}
                label="Min Confidence"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value={0.5}>50%+</MenuItem>
                <MenuItem value={0.7}>70%+</MenuItem>
                <MenuItem value={0.8}>80%+</MenuItem>
                <MenuItem value={0.9}>90%+</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Strategy</InputLabel>
              <Select
                value={filterStrategy}
                onChange={(e) => setFilterStrategy(e.target.value)}
                label="Strategy"
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="sentence-based">Sentence-based</MenuItem>
                <MenuItem value="semantic-units">Semantic Units</MenuItem>
                <MenuItem value="hierarchical">Hierarchical</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Model</InputLabel>
              <Select
                value={filterModel}
                onChange={(e) => setFilterModel(e.target.value)}
                label="Model"
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="gpt-4">GPT-4</MenuItem>
                <MenuItem value="gpt-3.5-turbo">GPT-3.5</MenuItem>
                <MenuItem value="llama-3-70b">Llama 3 70B</MenuItem>
                <MenuItem value="qwen-2.5">Qwen 2.5</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {/* Results count */}
          <Typography variant="caption" color="text.secondary">
            Showing {filteredClaims.length} of {claims.length} claim{claims.length !== 1 ? 's' : ''}
          </Typography>
        </Stack>
      </Paper>

      {/* Claims Tree */}
      {filteredClaims.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No claims match your filters
          </Typography>
        </Paper>
      ) : (
        <Box>
          {filteredClaims.map((claim) => (
            <ClaimTreeNode
              key={claim.id}
              claim={claim}
              depth={0}
              summaryId={summaryId}
              personaId={personaId}
              selectedClaimId={selectedClaimId}
              allClaims={claims}
              onEdit={onEditClaim}
              onDelete={onDeleteClaim}
              onAdd={onAddClaim}
              onSelect={handleSelect}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
