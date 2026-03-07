/**
 * Session management dialog component.
 * Displays active sessions with ability to revoke them.
 */

import { useState } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSessions, useRevokeSession } from '@store/queries/admin/useSessions'
import { ConfirmDialog } from '../shared/ConfirmDialog'

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
export function SessionManagementDialog({ open, onClose }: SessionManagementDialogProps): JSX.Element {
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
    if (!userAgent) return '-'
    if (userAgent.length <= 50) return userAgent
    return userAgent.substring(0, 47) + '...'
  }

  const revokingSession = sessions.find((s) => s.id === revokingSessionId)

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <div className="flex justify-between items-center">
              <DialogTitle>Session Management</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isLoading}
                aria-label="refresh sessions"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>Failed to load sessions: {error.message}</AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="flex justify-center p-8">
                <Spinner />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  No active sessions
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Showing {sessions.length} active session{sessions.length !== 1 ? 's' : ''}. Auto-refreshes every 30 seconds.
                </p>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>User Agent</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div>
                            <p className="text-sm">
                              {session.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              @{session.username}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{session.ipAddress || '-'}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">
                            {truncateUserAgent(session.userAgent)}
                          </span>
                        </TableCell>
                        <TableCell>{formatDate(session.createdAt)}</TableCell>
                        <TableCell>
                          {isExpired(session.expiresAt) ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : (
                            formatDate(session.expiresAt)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRevokeClick(session.id)}
                            aria-label="revoke session"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        open={revokeConfirmOpen}
        title="Revoke Session"
        message={`Are you sure you want to revoke the session for ${revokingSession?.displayName} (@${revokingSession?.username})? They will be logged out immediately.`}
        confirmText="Revoke"
        confirmVariant="destructive"
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
