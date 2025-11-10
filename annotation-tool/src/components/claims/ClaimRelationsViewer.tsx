import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
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
import { RootState, AppDispatch } from '../../store/store'
import { fetchClaimRelations, deleteClaimRelation } from '../../store/claimsSlice'

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
  const dispatch = useDispatch<AppDispatch>()
  const relationData = useSelector((state: RootState) => state.claims.relations[claimId])
  const ontology = useSelector((state: RootState) =>
    state.persona.personaOntologies.find((o) => o.personaId === personaId)
  )
  const claims = useSelector((state: RootState) => state.claims.claimsBySummary[summaryId] || [])

  useEffect(() => {
    dispatch(fetchClaimRelations({ summaryId, claimId }))
  }, [dispatch, summaryId, claimId])

  const handleDelete = async (relationId: string) => {
    if (window.confirm('Delete this relation?')) {
      await dispatch(deleteClaimRelation({ summaryId, relationId, sourceClaimId: claimId }))
    }
  }

  const getRelationTypeName = (relationTypeId: string) => {
    return ontology?.relationTypes.find((rt) => rt.id === relationTypeId)?.name || 'Unknown'
  }

  const getClaimText = (claimId: string): string => {
    const findClaim = (claims: any[], targetId: string): any => {
      for (const claim of claims) {
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
    return claim.gloss.map((g: any) => g.content).join(' ').substring(0, 60)
  }

  if (!relationData || relationData.isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={2}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (relationData.error) {
    return <Alert severity="error">{relationData.error}</Alert>
  }

  const { asSource, asTarget } = relationData

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
