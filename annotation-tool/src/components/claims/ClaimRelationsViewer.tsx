import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Paper,
  Stack,
  CircularProgress,
  Alert,
  Tooltip,
  Button,
} from '@mui/material'
import {
  Delete as DeleteIcon,
  ArrowForward as ArrowForwardIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import { useClaimRelations, useDeleteClaimRelation, useClaims, usePersonaOntology } from '@store/queries'
import { Claim } from '@models/types'

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
      <Box display="flex" justifyContent="center" p={2}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (error) {
    return <Alert severity="error">{error instanceof Error ? error.message : 'Failed to load relations'}</Alert>
  }

  const asSource = relationData?.asSource || []
  const asTarget = relationData?.asTarget || []

  return (
    <Box data-testid="claim-relations-viewer">
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="subtitle1" fontWeight="medium">
          Claim Relations
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={(e) => {
            e.stopPropagation()
            onAddRelation()
          }}
          variant="outlined"
        >
          Add Relation
        </Button>
      </Box>

      {/* Outgoing Relations */}
      <Paper variant="outlined" sx={{ mb: 2, p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Outgoing Relations ({asSource.length})
        </Typography>
        {asSource.length === 0 ? (
          <Typography variant="body2" color="text.secondary" fontStyle="italic">
            No outgoing relations
          </Typography>
        ) : (
          <List dense disablePadding>
            {asSource.map((relation) => (
              <ListItem key={relation.id} sx={{ px: 0 }}>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        label={getRelationTypeName(relation.relationTypeId)}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                      <ArrowForwardIcon fontSize="small" color="action" />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {getClaimText(relation.targetClaimId)}
                      </Typography>
                    </Stack>
                  }
                  secondary={
                    relation.confidence && (
                      <Chip
                        label={`Confidence: ${(relation.confidence * 100).toFixed(0)}%`}
                        size="small"
                        variant="filled"
                        sx={{ mt: 0.5, fontSize: '0.7rem', height: 20 }}
                      />
                    )
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Delete relation">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(relation.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* Incoming Relations */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Incoming Relations ({asTarget.length})
        </Typography>
        {asTarget.length === 0 ? (
          <Typography variant="body2" color="text.secondary" fontStyle="italic">
            No incoming relations
          </Typography>
        ) : (
          <List dense disablePadding>
            {asTarget.map((relation) => (
              <ListItem key={relation.id} sx={{ px: 0 }}>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {getClaimText(relation.sourceClaimId)}
                      </Typography>
                      <ArrowBackIcon fontSize="small" color="action" />
                      <Chip
                        label={getRelationTypeName(relation.relationTypeId)}
                        size="small"
                        color="secondary"
                        variant="outlined"
                      />
                    </Stack>
                  }
                  secondary={
                    relation.confidence && (
                      <Chip
                        label={`Confidence: ${(relation.confidence * 100).toFixed(0)}%`}
                        size="small"
                        variant="filled"
                        sx={{ mt: 0.5, fontSize: '0.7rem', height: 20 }}
                      />
                    )
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  )
}
