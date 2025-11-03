/**
 * Reusable confirmation dialog component.
 * Displays a confirmation message with confirm and cancel actions.
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
} from '@mui/material'

/**
 * Props for ConfirmDialog component.
 */
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmColor?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  loading?: boolean
}

/**
 * Confirmation dialog component.
 * Displays a message and asks for user confirmation.
 *
 * @param open - Whether dialog is open
 * @param title - Dialog title
 * @param message - Confirmation message
 * @param confirmText - Confirm button text
 * @param cancelText - Cancel button text
 * @param confirmColor - Confirm button color
 * @param onConfirm - Callback when user confirms
 * @param onCancel - Callback when user cancels
 * @param loading - Whether action is in progress
 * @returns Confirmation dialog
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'primary',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          color={confirmColor}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
