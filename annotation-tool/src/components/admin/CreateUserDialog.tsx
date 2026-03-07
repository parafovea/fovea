/**
 * Create user dialog component.
 * Provides form for creating a new user with validation.
 */

import { useState, FormEvent } from 'react'
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
import { Spinner } from '@/components/ui/spinner'
import { useCreateUser } from '@store/queries/admin/useUsers'

/**
 * Props for CreateUserDialog component.
 */
interface CreateUserDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Create user dialog.
 * Displays form for creating a new user with validation.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @returns Create user dialog
 */
export function CreateUserDialog({ open, onClose }: CreateUserDialogProps): JSX.Element {
  const createUser = useCreateUser()

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    email: '',
    isAdmin: false,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  /**
   * Validates form data.
   *
   * @returns Whether form is valid
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.username) {
      newErrors.username = 'Username is required'
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters'
    }

    if (!formData.displayName) {
      newErrors.displayName = 'Display name is required'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address'
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
      await createUser.mutateAsync({
        username: formData.username,
        password: formData.password,
        displayName: formData.displayName,
        email: formData.email || undefined,
        isAdmin: formData.isAdmin,
      })

      handleClose()
    } catch (error) {
      console.error('Failed to create user:', error)
    }
  }

  /**
   * Handles dialog close and resets form.
   */
  const handleClose = () => {
    setFormData({
      username: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      email: '',
      isAdmin: false,
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {createUser.isError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  {createUser.error?.message || 'Failed to create user'}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-username">Username *</Label>
                <Input
                  id="create-username"
                  value={formData.username}
                  onChange={(e) => updateField('username', e.target.value)}
                  autoFocus
                />
                {errors.username && (
                  <p className="text-sm text-destructive">{errors.username}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-displayName">Display Name *</Label>
                <Input
                  id="create-displayName"
                  value={formData.displayName}
                  onChange={(e) => updateField('displayName', e.target.value)}
                />
                {errors.displayName && (
                  <p className="text-sm text-destructive">{errors.displayName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-password">Password *</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => updateField('password', e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  {errors.password || 'Minimum 8 characters'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-confirmPassword">Confirm Password *</Label>
                <Input
                  id="create-confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="create-isAdmin"
                  checked={formData.isAdmin}
                  onCheckedChange={(checked) => updateField('isAdmin', !!checked)}
                />
                <Label htmlFor="create-isAdmin">Administrator</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={createUser.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending && <Spinner className="mr-2 h-4 w-4" />}
              Create User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
