/**
 * Shared resources page.
 *
 * Shows resources shared with the current user and resources the user
 * has shared with others, with fork and revoke actions.
 */

import { useState, useMemo } from 'react'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  ContentCopy as ForkIcon,
  Delete as RevokeIcon,
  Description as AnnotationIcon,
  Summarize as SummaryIcon,
  FactCheck as ClaimIcon,
  Person as PersonaIcon,
  Public as WorldIcon,
} from '@mui/icons-material'
import { useReceivedShares, useSentShares, useForkShare, useRevokeShare } from '@store/queries/useSharing'

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  annotation: 'Annotation',
  summary: 'Summary',
  claim: 'Claim',
  persona: 'Persona',
  world_state: 'World State',
}

function ResourceTypeIcon({ type }: { type: string }): JSX.Element {
  switch (type) {
    case 'annotation': return <AnnotationIcon fontSize="small" />
    case 'summary': return <SummaryIcon fontSize="small" />
    case 'claim': return <ClaimIcon fontSize="small" />
    case 'persona': return <PersonaIcon fontSize="small" />
    case 'world_state': return <WorldIcon fontSize="small" />
    default: return <AnnotationIcon fontSize="small" />
  }
}

const FILTER_OPTIONS = ['all', 'annotation', 'summary', 'claim', 'persona', 'world_state'] as const

interface ReceivedShare {
  id: string
  resourceType: string
  resourceId: string
  sharedByUserId: string
  sharedByUser: { id: string; username: string; displayName: string }
  permissionLevel: string
  expiresAt: string | null
  createdAt: string
}

interface SentShare {
  id: string
  resourceType: string
  resourceId: string
  sharedWithUserId: string | null
  sharedWithUser?: { id: string; username: string; displayName: string }
  sharedWithGroupId: string | null
  sharedWithGroup?: { id: string; name: string; slug: string }
  permissionLevel: string
  expiresAt: string | null
  createdAt: string
}

export default function SharedAnnotationsPage(): JSX.Element {
  const { data: received = [], isLoading: receivedLoading, error: receivedError } = useReceivedShares()
  const { data: sent = [], isLoading: sentLoading, error: sentError } = useSentShares()
  const forkShare = useForkShare()
  const revokeShare = useRevokeShare()

  const [filter, setFilter] = useState<string>('all')

  const filteredReceived = useMemo(() => {
    const list = received as ReceivedShare[]
    if (filter === 'all') return list
    return list.filter((s) => s.resourceType === filter)
  }, [received, filter])

  const isLoading = receivedLoading || sentLoading
  const hasError = receivedError || sentError

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Shared With Me
        </Typography>

        {hasError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load shared resources.
          </Alert>
        )}

        {/* Filter tabs */}
        <Tabs
          value={filter}
          onChange={(_, v) => setFilter(v)}
          sx={{ mb: 2 }}
          variant="scrollable"
          scrollButtons="auto"
        >
          {FILTER_OPTIONS.map((opt) => (
            <Tab
              key={opt}
              value={opt}
              label={opt === 'all' ? 'All' : RESOURCE_TYPE_LABELS[opt] + 's'}
            />
          ))}
        </Tabs>

        {/* Received shares table */}
        {filteredReceived.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No shared resources to display.
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Shared By</TableCell>
                  <TableCell>Permission</TableCell>
                  <TableCell>Shared</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredReceived.map((share) => (
                  <TableRow key={share.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ResourceTypeIcon type={share.resourceType} />
                        {RESOURCE_TYPE_LABELS[share.resourceType] ?? share.resourceType}
                      </Box>
                    </TableCell>
                    <TableCell>{share.sharedByUser.displayName}</TableCell>
                    <TableCell>
                      <Chip
                        label={share.permissionLevel === 'forkable' ? 'Forkable' : 'Read-only'}
                        size="small"
                        color={share.permissionLevel === 'forkable' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>{new Date(share.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {share.expiresAt ? new Date(share.expiresAt).toLocaleDateString() : 'Never'}
                    </TableCell>
                    <TableCell align="right">
                      {share.permissionLevel === 'forkable' && (
                        <Tooltip title="Fork to your workspace">
                          <IconButton
                            size="small"
                            onClick={() => forkShare.mutate(share.id)}
                            disabled={forkShare.isPending}
                          >
                            <ForkIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Divider sx={{ my: 4 }} />

        {/* Sent shares */}
        <Typography variant="h5" gutterBottom>
          My Shared Resources
        </Typography>

        {(sent as SentShare[]).length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              You have not shared any resources.
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Shared With</TableCell>
                  <TableCell>Permission</TableCell>
                  <TableCell>Shared</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(sent as SentShare[]).map((share) => (
                  <TableRow key={share.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ResourceTypeIcon type={share.resourceType} />
                        {RESOURCE_TYPE_LABELS[share.resourceType] ?? share.resourceType}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {share.sharedWithUser?.displayName ??
                        share.sharedWithGroup?.name ??
                        'Unknown'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={share.permissionLevel === 'forkable' ? 'Forkable' : 'Read-only'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{new Date(share.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Revoke share">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => revokeShare.mutate(share.id)}
                          disabled={revokeShare.isPending}
                        >
                          <RevokeIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Container>
  )
}
