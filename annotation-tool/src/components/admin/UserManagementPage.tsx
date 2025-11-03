/**
 * User management page component.
 * Displays a table of all users with search, sort, and CRUD operations.
 */

import { useState, useMemo } from 'react'
import {
  Box,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  InputAdornment,
} from '@mui/material'
import {
  PersonAdd as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import { useUsers, useDeleteUser, UserWithStats } from '../../hooks/admin/useUsers.js'
import CreateUserDialog from './CreateUserDialog.js'
import EditUserDialog from './EditUserDialog.js'
import ConfirmDialog from '../shared/ConfirmDialog.js'

type SortField = 'username' | 'displayName' | 'email' | 'createdAt' | 'personaCount' | 'sessionCount'
type SortOrder = 'asc' | 'desc'

/**
 * User management page.
 * Provides interface for viewing, creating, editing, and deleting users.
 */
export default function UserManagementPage() {
  const { data: users = [], isLoading, error } = useUsers()
  const deleteUser = useDeleteUser()

  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('username')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithStats | null>(null)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<UserWithStats | null>(null)

  /**
   * Handles sort column click.
   *
   * @param field - Field to sort by
   */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  /**
   * Filters and sorts users based on search query and sort settings.
   */
  const filteredUsers = useMemo(() => {
    const filtered = users.filter((user) => {
      const query = searchQuery.toLowerCase()
      return (
        user.username.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
      )
    })

    // Sort
    filtered.sort((a, b) => {
      let aValue: string | number | undefined
      let bValue: string | number | undefined

      switch (sortField) {
        case 'username':
          aValue = a.username
          bValue = b.username
          break
        case 'displayName':
          aValue = a.displayName
          bValue = b.displayName
          break
        case 'email':
          aValue = a.email || ''
          bValue = b.email || ''
          break
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime()
          bValue = new Date(b.createdAt).getTime()
          break
        case 'personaCount':
          aValue = a.personaCount || 0
          bValue = b.personaCount || 0
          break
        case 'sessionCount':
          aValue = a.sessionCount || 0
          bValue = b.sessionCount || 0
          break
      }

      if (aValue === undefined) return 1
      if (bValue === undefined) return -1

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [users, searchQuery, sortField, sortOrder])

  /**
   * Opens edit dialog for a user.
   *
   * @param user - User to edit
   */
  const handleEdit = (user: UserWithStats) => {
    setEditingUser(user)
    setEditDialogOpen(true)
  }

  /**
   * Opens delete confirmation dialog.
   *
   * @param user - User to delete
   */
  const handleDeleteClick = (user: UserWithStats) => {
    setDeletingUser(user)
    setDeleteConfirmOpen(true)
  }

  /**
   * Confirms and executes user deletion.
   */
  const handleDeleteConfirm = async () => {
    if (deletingUser) {
      try {
        await deleteUser.mutateAsync(deletingUser.id)
        setDeleteConfirmOpen(false)
        setDeletingUser(null)
      } catch (error) {
        console.error('Failed to delete user:', error)
      }
    }
  }

  /**
   * Formats date for display.
   *
   * @param dateString - ISO date string
   * @returns Formatted date string
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
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
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load users: {error.message}
        </Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
        <TextField
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{ flexGrow: 1, maxWidth: 400 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Add User
        </Button>
      </Box>

      {/* Users Table */}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'username'}
                  direction={sortField === 'username' ? sortOrder : 'asc'}
                  onClick={() => handleSort('username')}
                >
                  Username
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'displayName'}
                  direction={sortField === 'displayName' ? sortOrder : 'asc'}
                  onClick={() => handleSort('displayName')}
                >
                  Display Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'email'}
                  direction={sortField === 'email' ? sortOrder : 'asc'}
                  onClick={() => handleSort('email')}
                >
                  Email
                </TableSortLabel>
              </TableCell>
              <TableCell>Role</TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortField === 'personaCount'}
                  direction={sortField === 'personaCount' ? sortOrder : 'asc'}
                  onClick={() => handleSort('personaCount')}
                >
                  Personas
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortField === 'sessionCount'}
                  direction={sortField === 'sessionCount' ? sortOrder : 'asc'}
                  onClick={() => handleSort('sessionCount')}
                >
                  Sessions
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'createdAt'}
                  direction={sortField === 'createdAt' ? sortOrder : 'asc'}
                  onClick={() => handleSort('createdAt')}
                >
                  Created
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.displayName}</TableCell>
                  <TableCell>{user.email || '—'}</TableCell>
                  <TableCell>
                    {user.isAdmin ? (
                      <Chip label="Admin" color="primary" size="small" />
                    ) : (
                      <Chip label="User" size="small" />
                    )}
                  </TableCell>
                  <TableCell align="right">{user.personaCount || 0}</TableCell>
                  <TableCell align="right">{user.sessionCount || 0}</TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleEdit(user)}
                      aria-label="edit user"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClick(user)}
                      aria-label="delete user"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialogs */}
      <CreateUserDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      {editingUser && (
        <EditUserDialog
          open={editDialogOpen}
          user={editingUser}
          onClose={() => {
            setEditDialogOpen(false)
            setEditingUser(null)
          }}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete User"
        message={`Are you sure you want to delete user "${deletingUser?.username}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeletingUser(null)
        }}
        loading={deleteUser.isPending}
      />
    </Box>
  )
}
