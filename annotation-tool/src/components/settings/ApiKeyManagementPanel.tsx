/**
 * API key management panel component.
 * Displays user API keys and inherited admin keys with CRUD operations.
 */

import { useState } from 'react'
import { useSelector } from 'react-redux'
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Typography,
  Tooltip,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Lock as LockIcon,
  ToggleOn as ToggleOnIcon,
  ToggleOff as ToggleOffIcon,
} from '@mui/icons-material'
import { RootState } from '../../store/store.js'
import { useAllApiKeys, useDeleteApiKey, useUpdateApiKey, ApiKey } from '../../hooks/useApiKeys.js'
import ApiKeyDialog from './ApiKeyDialog.js'
import ConfirmDialog from '../shared/ConfirmDialog.js'

/**
 * API key management panel.
 * Displays list of user API keys and admin keys with management options.
 */
export default function ApiKeyManagementPanel() {
  const { currentUser } = useSelector((state: RootState) => state.user)
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
    if (!dateString) return '—'
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
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          Failed to load API keys: {error.message}
        </Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Manage your API keys for external services. Admin keys are inherited and cannot be modified.
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          size="small"
        >
          Add Key
        </Button>
      </Box>

      {/* API Keys Table */}
      {apiKeys.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No API keys configured
          </Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Provider</TableCell>
                <TableCell>Key Name</TableCell>
                <TableCell>Key</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {apiKeys.map((key) => (
                <TableRow key={key.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getProviderName(key.provider)}
                      {key.isAdminKey && (
                        <Tooltip title="Admin key (inherited)">
                          <LockIcon fontSize="small" color="action" />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{key.keyName}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {key.keyMask}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {key.isActive ? (
                      <Chip label="Active" color="success" size="small" />
                    ) : (
                      <Chip label="Inactive" size="small" />
                    )}
                  </TableCell>
                  <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                  <TableCell align="right">
                    {key.isAdminKey ? (
                      <Chip label="Admin Key" size="small" color="primary" />
                    ) : (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title={key.isActive ? 'Deactivate' : 'Activate'}>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleActive(key)}
                            aria-label="toggle active status"
                          >
                            {key.isActive ? <ToggleOnIcon fontSize="small" /> : <ToggleOffIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => handleEdit(key)}
                            aria-label="edit key"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteClick(key)}
                            aria-label="delete key"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
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
        confirmColor="error"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeletingKey(null)
        }}
        loading={deleteApiKey.isPending}
      />
    </Box>
  )
}
