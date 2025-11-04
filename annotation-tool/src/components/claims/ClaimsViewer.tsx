import { useState } from 'react'
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
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import { Claim } from '../../models/types'
import { GlossRenderer } from '../GlossRenderer'

interface ClaimsViewerProps {
  claims: Claim[]
  summaryId: string
  personaId?: string
  onEditClaim?: (claim: Claim) => void
  onAddClaim?: (parentClaimId?: string) => void
  onDeleteClaim?: (claim: Claim) => void
  selectedClaimId?: string | null
  highlightSpans?: boolean
}

interface ClaimTreeNodeProps {
  claim: Claim
  depth: number
  personaId?: string
  selectedClaimId?: string | null
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
  personaId,
  selectedClaimId,
  onEdit,
  onDelete,
  onAdd,
  onSelect,
}: ClaimTreeNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const hasSubclaims = claim.subclaims && claim.subclaims.length > 0
  const isSelected = selectedClaimId === claim.id

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
      </Paper>

      {/* Subclaims */}
      {hasSubclaims && (
        <Collapse in={expanded}>
          <Box>
            {claim.subclaims!.map((subclaim) => (
              <ClaimTreeNode
                key={subclaim.id}
                claim={subclaim}
                depth={depth + 1}
                personaId={personaId}
                selectedClaimId={selectedClaimId}
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
  personaId,
  onEditClaim,
  onAddClaim,
  onDeleteClaim,
  selectedClaimId,
}: ClaimsViewerProps) {
  const handleSelect = (_claimId: string) => {
    // Selection is handled by parent component via Redux
  }

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
      {claims.map((claim) => (
        <ClaimTreeNode
          key={claim.id}
          claim={claim}
          depth={0}
          personaId={personaId}
          selectedClaimId={selectedClaimId}
          onEdit={onEditClaim}
          onDelete={onDeleteClaim}
          onAdd={onAddClaim}
          onSelect={handleSelect}
        />
      ))}
    </Box>
  )
}
