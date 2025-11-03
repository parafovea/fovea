/**
 * Create user dialog component.
 * Provides form for creating a new user with validation.
 */

import { useState, FormEvent } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Alert,
  Box,
  CircularProgress,
} from '@mui/material'
import { useCreateUser } from '../../hooks/admin/useUsers.js'

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
export default function CreateUserDialog({ open, onClose }: CreateUserDialogProps) {
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
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create User</DialogTitle>
        <DialogContent>
          {createUser.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createUser.error?.message || 'Failed to create user'}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Username"
              value={formData.username}
              onChange={(e) => updateField('username', e.target.value)}
              error={!!errors.username}
              helperText={errors.username}
              required
              fullWidth
              autoFocus
            />

            <TextField
              label="Display Name"
              value={formData.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
              error={!!errors.displayName}
              helperText={errors.displayName}
              required
              fullWidth
            />

            <TextField
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              error={!!errors.email}
              helperText={errors.email}
              fullWidth
            />

            <TextField
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
              error={!!errors.password}
              helperText={errors.password || 'Minimum 8 characters'}
              required
              fullWidth
            />

            <TextField
              label="Confirm Password"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword}
              required
              fullWidth
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.isAdmin}
                  onChange={(e) => updateField('isAdmin', e.target.checked)}
                />
              }
              label="Administrator"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={createUser.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={createUser.isPending}
            startIcon={createUser.isPending ? <CircularProgress size={16} /> : undefined}
          >
            Create User
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
