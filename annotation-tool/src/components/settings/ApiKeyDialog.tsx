/**
 * API key dialog component.
 * Provides form for creating or editing API keys.
 */

import { useState, useEffect, FormEvent } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Box,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import { useCreateApiKey, useUpdateApiKey, ApiKey, ApiKeyProvider } from '../../hooks/useApiKeys.js'

/**
 * Props for ApiKeyDialog component.
 */
interface ApiKeyDialogProps {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  existingKey?: ApiKey
}

/**
 * API key dialog.
 * Displays form for creating or editing API keys.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @param mode - Create or edit mode
 * @param existingKey - Existing key for edit mode
 * @returns API key dialog
 */
export default function ApiKeyDialog({ open, onClose, mode, existingKey }: ApiKeyDialogProps) {
  const createApiKey = useCreateApiKey()
  const updateApiKey = useUpdateApiKey()

  const [formData, setFormData] = useState({
    provider: (existingKey?.provider || 'anthropic') as ApiKeyProvider,
    keyName: existingKey?.keyName || '',
    apiKey: '',
  })

  const [showApiKey, setShowApiKey] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form when dialog opens or existingKey changes
  useEffect(() => {
    if (mode === 'edit' && existingKey) {
      setFormData({
        provider: existingKey.provider,
        keyName: existingKey.keyName,
        apiKey: '',
      })
    } else {
      setFormData({
        provider: 'anthropic',
        keyName: '',
        apiKey: '',
      })
    }
    setErrors({})
    setShowApiKey(false)
  }, [mode, existingKey, open])

  /**
   * Validates form data.
   *
   * @returns Whether form is valid
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.keyName) {
      newErrors.keyName = 'Key name is required'
    }

    if (mode === 'create' && !formData.apiKey) {
      newErrors.apiKey = 'API key is required'
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
      if (mode === 'create') {
        await createApiKey.mutateAsync({
          provider: formData.provider,
          keyName: formData.keyName,
          apiKey: formData.apiKey,
        })
      } else if (existingKey) {
        await updateApiKey.mutateAsync({
          keyId: existingKey.id,
          data: {
            keyName: formData.keyName,
            apiKey: formData.apiKey || undefined,
          },
        })
      }

      handleClose()
    } catch (error) {
      console.error('Failed to save API key:', error)
    }
  }

  /**
   * Handles dialog close and resets form.
   */
  const handleClose = () => {
    setFormData({
      provider: 'anthropic',
      keyName: '',
      apiKey: '',
    })
    setErrors({})
    setShowApiKey(false)
    onClose()
  }

  /**
   * Updates form field and clears its error.
   *
   * @param field - Field name
   * @param value - Field value
   */
  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const isLoading = createApiKey.isPending || updateApiKey.isPending
  const error = createApiKey.error || updateApiKey.error

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {mode === 'create' ? 'Add API Key' : 'Edit API Key'}
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error.message || 'Failed to save API key'}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="provider-label">Provider</InputLabel>
              <Select
                labelId="provider-label"
                value={formData.provider}
                onChange={(e) => updateField('provider', e.target.value)}
                label="Provider"
                disabled={mode === 'edit'}
              >
                <MenuItem value="anthropic">Anthropic</MenuItem>
                <MenuItem value="openai">OpenAI</MenuItem>
                <MenuItem value="google">Google</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Key Name"
              value={formData.keyName}
              onChange={(e) => updateField('keyName', e.target.value)}
              error={!!errors.keyName}
              helperText={errors.keyName || 'Friendly name for this API key'}
              required
              fullWidth
              autoFocus
            />

            <TextField
              label="API Key"
              type={showApiKey ? 'text' : 'password'}
              value={formData.apiKey}
              onChange={(e) => updateField('apiKey', e.target.value)}
              error={!!errors.apiKey}
              helperText={
                mode === 'edit'
                  ? 'Leave blank to keep existing key'
                  : errors.apiKey || 'Your API key from the provider'
              }
              required={mode === 'create'}
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle API key visibility"
                      onClick={() => setShowApiKey(!showApiKey)}
                      edge="end"
                    >
                      {showApiKey ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading}
            startIcon={isLoading ? <CircularProgress size={16} /> : undefined}
          >
            {mode === 'create' ? 'Add Key' : 'Save Changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
