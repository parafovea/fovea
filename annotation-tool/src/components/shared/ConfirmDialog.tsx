/**
 * Reusable confirmation dialog component.
 * Displays a confirmation message with confirm and cancel actions.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/**
 * Props for ConfirmDialog component.
 */
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost'
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
 * @param confirmVariant - Confirm button variant
 * @param onConfirm - Callback when user confirms
 * @param onCancel - Callback when user cancels
 * @param loading - Whether action is in progress
 * @returns Confirmation dialog
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'default',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !loading) {
          onCancel()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Spinner className="size-4" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
