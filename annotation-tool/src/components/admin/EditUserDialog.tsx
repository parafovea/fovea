/**
 * Edit user dialog component.
 * Provides form for editing existing user with validation.
 */

import { useState, useEffect, FormEvent } from 'react'
import { useSelector } from 'react-redux'
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
  Typography,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { useUpdateUser, useDeleteUser, UserWithStats } from '../../hooks/admin/useUsers.js'
import { RootState } from '../../store/store.js'
import ConfirmDialog from '../shared/ConfirmDialog.js'

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
export default function EditUserDialog({ open, user, onClose }: EditUserDialogProps) {
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const { currentUser } = useSelector((state: RootState) => state.user)

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
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle>Edit User: {user.username}</DialogTitle>
          <DialogContent>
            {updateUser.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {updateUser.error?.message || 'Failed to update user'}
              </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {/* User Statistics */}
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  User Statistics
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Typography variant="body2">
                    Personas: <strong>{user.personaCount || 0}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Sessions: <strong>{user.sessionCount || 0}</strong>
                  </Typography>
                  <Typography variant="body2" sx={{ gridColumn: '1 / -1' }}>
                    Created: <strong>{formatDate(user.createdAt)}</strong>
                  </Typography>
                </Box>
              </Box>

              <TextField
                label="Username"
                value={user.username}
                disabled
                fullWidth
                helperText="Username cannot be changed"
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

              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.isAdmin}
                    onChange={(e) => updateField('isAdmin', e.target.checked)}
                  />
                }
                label="Administrator"
              />

              <Divider sx={{ my: 1 }} />

              {/* Change Password Section */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2">Change Password</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      label="New Password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      error={!!errors.password}
                      helperText={errors.password || 'Leave blank to keep current password'}
                      fullWidth
                    />

                    <TextField
                      label="Confirm New Password"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => updateField('confirmPassword', e.target.value)}
                      error={!!errors.confirmPassword}
                      helperText={errors.confirmPassword}
                      fullWidth
                      disabled={!formData.password}
                    />
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Box>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
            <Button
              color="error"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={!canDelete || updateUser.isPending}
            >
              Delete User
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={handleClose} disabled={updateUser.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={updateUser.isPending}
                startIcon={updateUser.isPending ? <CircularProgress size={16} /> : undefined}
              >
                Save Changes
              </Button>
            </Box>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete User"
        message={`Are you sure you want to delete user "${user.username}"? This will also delete all their personas and annotations. This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        loading={deleteUser.isPending}
      />
    </>
  )
}
