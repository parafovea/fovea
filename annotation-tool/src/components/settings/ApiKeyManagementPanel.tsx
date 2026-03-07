/**
 * API key management panel component.
 * Displays user API keys and inherited admin keys with CRUD operations.
 */

import { useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Lock,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { useAuthStore } from '@store/zustand/authStore'
import { useAllApiKeys, useDeleteApiKey, useUpdateApiKey, ApiKey } from '@store/queries/useApiKeys'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ApiKeyDialog from './ApiKeyDialog'
import { ConfirmDialog } from '../shared/ConfirmDialog'

/**
 * API key management panel.
 * Displays list of user API keys and admin keys with management options.
 */
export default function ApiKeyManagementPanel() {
  const currentUser = useAuthStore(state => state.currentUser)
  const { data: apiKeys = [], isLoading, error } = useAllApiKeys(currentUser?.isAdmin || false)
  const deleteApiKey = useDeleteApiKey()
  const updateApiKey = useUpdateApiKey()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingKey, setDeletingKey] = useState<ApiKey | null>(null)

  /**
   * Opens edit dialog for an API key.
   *
   * @param key - API key to edit
   */
  const handleEdit = (key: ApiKey) => {
    setEditingKey(key)
    setEditDialogOpen(true)
  }

  /**
   * Opens delete confirmation dialog.
   *
   * @param key - API key to delete
   */
  const handleDeleteClick = (key: ApiKey) => {
    setDeletingKey(key)
    setDeleteConfirmOpen(true)
  }

  /**
   * Confirms and executes API key deletion.
   */
  const handleDeleteConfirm = async () => {
    if (deletingKey) {
      try {
        await deleteApiKey.mutateAsync(deletingKey.id)
        setDeleteConfirmOpen(false)
        setDeletingKey(null)
      } catch (error) {
        console.error('Failed to delete API key:', error)
      }
    }
  }

  /**
   * Toggles API key active status.
   *
   * @param key - API key to toggle
   */
  const handleToggleActive = async (key: ApiKey) => {
    try {
      await updateApiKey.mutateAsync({
        keyId: key.id,
        data: { isActive: !key.isActive },
      })
    } catch (error) {
      console.error('Failed to toggle API key:', error)
    }
  }

  /**
   * Formats date for display.
   *
   * @param dateString - ISO date string or undefined
   * @returns Formatted date string
   */
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  /**
   * Gets provider display name.
   *
   * @param provider - Provider identifier
   * @returns Provider display name
   */
  const getProviderName = (provider: string) => {
    const providers: Record<string, string> = {
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google',
    }
    return providers[provider] || provider
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load API keys: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage your API keys for external services. Admin keys are inherited and cannot be modified.
        </p>
        <Button
          size="sm"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="size-4" />
          Add Key
        </Button>
      </div>

      {/* API Keys Table */}
      {apiKeys.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-muted-foreground">
            No API keys configured
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Key Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.map((key) => (
              <TableRow key={key.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getProviderName(key.provider)}
                    {key.isAdminKey && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Lock className="size-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>Admin key (inherited)</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell>{key.keyName}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs">
                    {key.keyMask}
                  </span>
                </TableCell>
                <TableCell>
                  {key.isActive ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                <TableCell className="text-right">
                  {key.isAdminKey ? (
                    <Badge>Admin Key</Badge>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleToggleActive(key)}
                            aria-label="toggle active status"
                          >
                            {key.isActive
                              ? <ToggleRight className="size-4" />
                              : <ToggleLeft className="size-4" />
                            }
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {key.isActive ? 'Deactivate' : 'Activate'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(key)}
                            aria-label="edit key"
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteClick(key)}
                            aria-label="delete key"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Dialogs */}
      <ApiKeyDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        mode="create"
      />

      {editingKey && (
        <ApiKeyDialog
          open={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false)
            setEditingKey(null)
          }}
          mode="edit"
          existingKey={editingKey}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete API Key"
        message={`Are you sure you want to delete the API key "${deletingKey?.keyName}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeletingKey(null)
        }}
        loading={deleteApiKey.isPending}
      />
    </div>
  )
}
