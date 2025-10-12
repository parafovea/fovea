/**
 * Session management dialog component.
 * Displays active sessions with ability to revoke them.
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  CircularProgress,
  Box,
  Typography,
  Chip,
} from '@mui/material'
import { Delete as DeleteIcon, Refresh as RefreshIcon } from '@mui/icons-material'
import { useSessions, useRevokeSession } from '../../hooks/admin/useSessions.js'
import ConfirmDialog from '../shared/ConfirmDialog.js'
import { useState } from 'react'

/**
 * Props for SessionManagementDialog component.
 */
interface SessionManagementDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Session management dialog.
 * Displays all active sessions with ability to revoke them.
 * Auto-refreshes every 30 seconds.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @returns Session management dialog
 */
export default function SessionManagementDialog({ open, onClose }: SessionManagementDialogProps) {
  const { data: sessions = [], isLoading, error, refetch } = useSessions()
  const revokeSession = useRevokeSession()

  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false)
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)

  /**
   * Opens revoke confirmation dialog.
   *
   * @param sessionId - Session ID to revoke
   */
  const handleRevokeClick = (sessionId: string) => {
    setRevokingSessionId(sessionId)
    setRevokeConfirmOpen(true)
  }

  /**
   * Confirms and executes session revocation.
   */
  const handleRevokeConfirm = async () => {
    if (revokingSessionId) {
      try {
        await revokeSession.mutateAsync(revokingSessionId)
        setRevokeConfirmOpen(false)
        setRevokingSessionId(null)
      } catch (error) {
        console.error('Failed to revoke session:', error)
      }
    }
  }

  /**
   * Formats date for display.
   *
   * @param dateString - ISO date string
   * @returns Formatted date string
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  /**
   * Checks if session is expired.
   *
   * @param expiresAt - Expiration date string
   * @returns Whether session is expired
   */
  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date()
  }

  /**
   * Truncates user agent string for display.
   *
   * @param userAgent - User agent string
   * @returns Truncated user agent
   */
  const truncateUserAgent = (userAgent: string | undefined) => {
    if (!userAgent) return '—'
    if (userAgent.length <= 50) return userAgent
    return userAgent.substring(0, 47) + '...'
  }

  const revokingSession = sessions.find((s) => s.id === revokingSessionId)

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Session Management
            <IconButton
              onClick={() => refetch()}
              disabled={isLoading}
              aria-label="refresh sessions"
              size="small"
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Failed to load sessions: {error.message}
            </Alert>
          )}

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : sessions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" color="text.secondary">
                No active sessions
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Showing {sessions.length} active session{sessions.length !== 1 ? 's' : ''}. Auto-refreshes every 30 seconds.
              </Typography>

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>User</TableCell>
                      <TableCell>IP Address</TableCell>
                      <TableCell>User Agent</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell>Expires</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="body2">
                              {session.displayName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              @{session.username}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>{session.ipAddress || '—'}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {truncateUserAgent(session.userAgent)}
                          </Typography>
                        </TableCell>
                        <TableCell>{formatDate(session.createdAt)}</TableCell>
                        <TableCell>
                          {isExpired(session.expiresAt) ? (
                            <Chip label="Expired" size="small" color="error" />
                          ) : (
                            formatDate(session.expiresAt)
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => handleRevokeClick(session.id)}
                            aria-label="revoke session"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        open={revokeConfirmOpen}
        title="Revoke Session"
        message={`Are you sure you want to revoke the session for ${revokingSession?.displayName} (@${revokingSession?.username})? They will be logged out immediately.`}
        confirmText="Revoke"
        confirmColor="error"
        onConfirm={handleRevokeConfirm}
        onCancel={() => {
          setRevokeConfirmOpen(false)
          setRevokingSessionId(null)
        }}
        loading={revokeSession.isPending}
      />
    </>
  )
}
