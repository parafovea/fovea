/**
 * Edit user dialog component.
 * Provides form for editing existing user with validation.
 */

import { useState, useEffect, FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { useUpdateUser, useDeleteUser, UserWithStats } from '@store/queries/admin/useUsers'
import { useAuthStore } from '@store/zustand/authStore'
import { ConfirmDialog } from '../shared/ConfirmDialog'

/**
 * Props for EditUserDialog component.
 */
interface EditUserDialogProps {
  open: boolean
  user: UserWithStats
  onClose: () => void
}

/**
 * Edit user dialog.
 * Displays form for editing user with statistics and delete option.
 *
 * @param open - Whether dialog is open
 * @param user - User to edit
 * @param onClose - Callback when dialog closes
 * @returns Edit user dialog
 */
export function EditUserDialog({ open, user, onClose }: EditUserDialogProps): JSX.Element {
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const currentUser = useAuthStore(state => state.currentUser)

  const [formData, setFormData] = useState({
    displayName: user.displayName,
    email: user.email || '',
    isAdmin: user.isAdmin,
    password: '',
    confirmPassword: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Reset form when user changes
  useEffect(() => {
    setFormData({
      displayName: user.displayName,
      email: user.email || '',
      isAdmin: user.isAdmin,
      password: '',
      confirmPassword: '',
    })
    setErrors({})
  }, [user])

  /**
   * Validates form data.
   *
   * @returns Whether form is valid
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.displayName) {
      newErrors.displayName = 'Display name is required'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address'
    }

    if (formData.password) {
      if (formData.password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters'
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /**
   * Handles form submission.
   *
   * @param e - Form event
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      await updateUser.mutateAsync({
        userId: user.id,
        data: {
          displayName: formData.displayName,
          email: formData.email || undefined,
          isAdmin: formData.isAdmin,
          password: formData.password || undefined,
        },
      })

      handleClose()
    } catch (error) {
      console.error('Failed to update user:', error)
    }
  }

  /**
   * Handles user deletion.
   */
  const handleDelete = async () => {
    try {
      await deleteUser.mutateAsync(user.id)
      setDeleteConfirmOpen(false)
      handleClose()
    } catch (error) {
      console.error('Failed to delete user:', error)
    }
  }

  /**
   * Handles dialog close and resets form.
   */
  const handleClose = () => {
    setFormData({
      displayName: user.displayName,
      email: user.email || '',
      isAdmin: user.isAdmin,
      password: '',
      confirmPassword: '',
    })
    setErrors({})
    onClose()
  }

  /**
   * Updates form field and clears its error.
   *
   * @param field - Field name
   * @param value - Field value
   */
  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  /**
   * Checks if user can be deleted.
   */
  const canDelete = currentUser?.id !== user.id

  /**
   * Formats date for display.
   *
   * @param dateString - ISO date string
   * @returns Formatted date string
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Edit User: {user.username}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {updateUser.isError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>
                    {updateUser.error?.message || 'Failed to update user'}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-4">
                {/* User Statistics */}
                <div className="p-4 bg-muted rounded-md">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    User Statistics
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <p className="text-sm">
                      Personas: <strong>{user.personaCount || 0}</strong>
                    </p>
                    <p className="text-sm">
                      Sessions: <strong>{user.sessionCount || 0}</strong>
                    </p>
                    <p className="text-sm col-span-2">
                      Created: <strong>{formatDate(user.createdAt)}</strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-username">Username</Label>
                  <Input
                    id="edit-username"
                    value={user.username}
                    disabled
                  />
                  <p className="text-sm text-muted-foreground">Username cannot be changed</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-displayName">Display Name *</Label>
                  <Input
                    id="edit-displayName"
                    value={formData.displayName}
                    onChange={(e) => updateField('displayName', e.target.value)}
                  />
                  {errors.displayName && (
                    <p className="text-sm text-destructive">{errors.displayName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-isAdmin"
                    checked={formData.isAdmin}
                    onCheckedChange={(checked) => updateField('isAdmin', !!checked)}
                  />
                  <Label htmlFor="edit-isAdmin">Administrator</Label>
                </div>

                <Separator className="my-2" />

                {/* Change Password Section */}
                <Accordion>
                  <AccordionItem value="password">
                    <AccordionTrigger className="text-sm font-medium">
                      Change Password
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-4 pt-2">
                        <div className="space-y-2">
                          <Label htmlFor="edit-password">New Password</Label>
                          <Input
                            id="edit-password"
                            type="password"
                            value={formData.password}
                            onChange={(e) => updateField('password', e.target.value)}
                          />
                          <p className="text-sm text-muted-foreground">
                            {errors.password || 'Leave blank to keep current password'}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-confirmPassword">Confirm New Password</Label>
                          <Input
                            id="edit-confirmPassword"
                            type="password"
                            value={formData.confirmPassword}
                            onChange={(e) => updateField('confirmPassword', e.target.value)}
                            disabled={!formData.password}
                          />
                          {errors.confirmPassword && (
                            <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
            <DialogFooter className="flex justify-between sm:justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={!canDelete || updateUser.isPending}
              >
                Delete User
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClose} disabled={updateUser.isPending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateUser.isPending}>
                  {updateUser.isPending && <Spinner className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete User"
        message={`Are you sure you want to delete user "${user.username}"? This will also delete all their personas and annotations. This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        loading={deleteUser.isPending}
      />
    </>
  )
}
