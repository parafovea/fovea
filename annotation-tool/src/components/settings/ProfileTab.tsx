/**
 * Profile settings tab component.
 * Allows users to update their profile information and password.
 */

import { useState, FormEvent, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Box,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store.js'
import { updateUser } from '../../store/userSlice.js'

/**
 * Props for ProfileTab component.
 */
interface ProfileTabProps {
  showPasswordChange: boolean
}

/**
 * Profile settings tab.
 * Displays form for updating user profile and password.
 *
 * @param showPasswordChange - Whether to show password change section
 * @returns Profile settings form
 */
export default function ProfileTab({ showPasswordChange }: ProfileTabProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { currentUser } = useSelector((state: RootState) => state.user)

  const [formData, setFormData] = useState({
    displayName: currentUser?.displayName || '',
    email: currentUser?.email || '',
  })

  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when user changes
  useEffect(() => {
    setFormData({
      displayName: currentUser?.displayName || '',
      email: currentUser?.email || '',
    })
  }, [currentUser])

  /**
   * Validates profile form data.
   *
   * @returns Whether form is valid
   */
  const validateProfileForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.displayName) {
      newErrors.displayName = 'Display name is required'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /**
   * Validates password form data.
   *
   * @returns Whether password form is valid
   */
  const validatePasswordForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!passwordData.oldPassword) {
      newErrors.oldPassword = 'Current password is required'
    }

    if (!passwordData.newPassword) {
      newErrors.newPassword = 'New password is required'
    } else if (passwordData.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters'
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /**
   * Handles profile update submission.
   *
   * @param e - Form event
   */
  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSuccess(false)
    setError(null)

    if (!validateProfileForm() || !currentUser) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName: formData.displayName,
          email: formData.email || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update profile')
      }

      const updatedUser = await response.json()
      dispatch(updateUser(updatedUser))
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handles password change submission.
   *
   * @param e - Form event
   */
  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSuccess(false)
    setError(null)

    if (!validatePasswordForm() || !currentUser) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          password: passwordData.newPassword,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to change password')
      }

      setPasswordData({
        oldPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Updates form field and clears its error.
   *
   * @param field - Field name
   * @param value - Field value
   */
  const updateField = (field: string, value: string) => {
    if (field in formData) {
      setFormData((prev) => ({ ...prev, [field]: value }))
    } else {
      setPasswordData((prev) => ({ ...prev, [field]: value }))
    }

    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }

    setSuccess(false)
    setError(null)
  }

  if (!currentUser) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {success && (
        <Alert severity="success">Profile updated successfully</Alert>
      )}

      {error && (
        <Alert severity="error">{error}</Alert>
      )}

      {/* Profile Information */}
      <form onSubmit={handleProfileSubmit}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6">Profile Information</Typography>

          <TextField
            label="Username"
            value={currentUser.username}
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

          <Box>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : undefined}
            >
              Save Profile
            </Button>
          </Box>
        </Box>
      </form>

      {/* Password Change Section */}
      {showPasswordChange && (
        <>
          <Divider />

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Change Password</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <form onSubmit={handlePasswordSubmit}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Current Password"
                    type="password"
                    value={passwordData.oldPassword}
                    onChange={(e) => updateField('oldPassword', e.target.value)}
                    error={!!errors.oldPassword}
                    helperText={errors.oldPassword}
                    required
                    fullWidth
                  />

                  <TextField
                    label="New Password"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => updateField('newPassword', e.target.value)}
                    error={!!errors.newPassword}
                    helperText={errors.newPassword || 'Minimum 8 characters'}
                    required
                    fullWidth
                  />

                  <TextField
                    label="Confirm New Password"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => updateField('confirmPassword', e.target.value)}
                    error={!!errors.confirmPassword}
                    helperText={errors.confirmPassword}
                    required
                    fullWidth
                  />

                  <Box>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={loading}
                      startIcon={loading ? <CircularProgress size={16} /> : undefined}
                    >
                      Change Password
                    </Button>
                  </Box>
                </Box>
              </form>
            </AccordionDetails>
          </Accordion>
        </>
      )}
    </Box>
  )
}
