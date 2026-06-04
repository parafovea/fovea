/**
 * API key dialog component.
 * Provides form for creating or editing API keys.
 */

import { useState, useEffect, FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useCreateApiKey, useUpdateApiKey, ApiKey, ApiKeyProvider } from '@store/queries/useApiKeys'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Add API Key' : 'Edit API Key'}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription>
                {error.message || 'Failed to save API key'}
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-4 flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="api-key-provider">Provider</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) => updateField('provider', value as string)}
                disabled={mode === 'edit'}
              >
                <SelectTrigger id="api-key-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key-name">Key Name</Label>
              <Input
                id="api-key-name"
                value={formData.keyName}
                onChange={(e) => updateField('keyName', e.target.value)}
                aria-invalid={!!errors.keyName}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {errors.keyName || 'Friendly name for this API key'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key-value">API Key</Label>
              <div className="relative">
                <Input
                  id="api-key-value"
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.apiKey}
                  onChange={(e) => updateField('apiKey', e.target.value)}
                  aria-invalid={!!errors.apiKey}
                  required={mode === 'create'}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-0.5"
                  aria-label="toggle API key visibility"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === 'edit'
                  ? 'Leave blank to keep existing key'
                  : errors.apiKey || 'Your API key from the provider'}
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="size-4" />}
              {mode === 'create' ? 'Add Key' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
