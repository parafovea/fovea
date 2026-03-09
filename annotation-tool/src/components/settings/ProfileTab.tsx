/**
 * Profile settings tab component.
 * Allows users to update their profile information and password.
 */

import { useState, FormEvent, useEffect } from 'react'
import { useAuthStore } from '@store/zustand/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'

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
  const currentUser = useAuthStore(state => state.currentUser)
  const updateUser = useAuthStore(state => state.updateUser)

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
      updateUser(updatedUser)
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
      <div className="flex justify-center p-4">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {success && (
        <Alert>
          <AlertDescription>Profile updated successfully</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Profile Information */}
      <form onSubmit={handleProfileSubmit}>
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">Profile Information</h3>

          <div className="space-y-2">
            <Label htmlFor="profile-username">Username</Label>
            <Input
              id="profile-username"
              value={currentUser.username}
              disabled
            />
            <p className="text-xs text-muted-foreground">Username cannot be changed</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-display-name">Display Name</Label>
            <Input
              id="profile-display-name"
              value={formData.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
              aria-invalid={!!errors.displayName}
              required
            />
            {errors.displayName && (
              <p className="text-xs text-destructive">{errors.displayName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div>
            <Button type="submit" disabled={loading}>
              {loading && <Spinner className="size-4" />}
              Save Profile
            </Button>
          </div>
        </div>
      </form>

      {/* Password Change Section */}
      {showPasswordChange && (
        <>
          <Separator />

          <Accordion>
            <AccordionItem value="password-change">
              <AccordionTrigger>
                <span className="text-lg font-semibold">Change Password</span>
              </AccordionTrigger>
              <AccordionContent>
                <form onSubmit={handlePasswordSubmit}>
                  <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="profile-current-password">Current Password</Label>
                      <Input
                        id="profile-current-password"
                        type="password"
                        value={passwordData.oldPassword}
                        onChange={(e) => updateField('oldPassword', e.target.value)}
                        aria-invalid={!!errors.oldPassword}
                        required
                      />
                      {errors.oldPassword && (
                        <p className="text-xs text-destructive">{errors.oldPassword}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="profile-new-password">New Password</Label>
                      <Input
                        id="profile-new-password"
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => updateField('newPassword', e.target.value)}
                        aria-invalid={!!errors.newPassword}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        {errors.newPassword || 'Minimum 8 characters'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="profile-confirm-password">Confirm New Password</Label>
                      <Input
                        id="profile-confirm-password"
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => updateField('confirmPassword', e.target.value)}
                        aria-invalid={!!errors.confirmPassword}
                        required
                      />
                      {errors.confirmPassword && (
                        <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                      )}
                    </div>

                    <div>
                      <Button type="submit" disabled={loading}>
                        {loading && <Spinner className="size-4" />}
                        Change Password
                      </Button>
                    </div>
                  </div>
                </form>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </div>
  )
}
