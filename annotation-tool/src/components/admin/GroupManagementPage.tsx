/**
 * Admin group management page.
 * Displays a table of all groups with CRUD operations and member management.
 *
 * @module
 */

import { useState } from 'react'
import {
  Autocomplete,
  Box,
  Button,
  TextField,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useUsers } from '@store/queries/admin/useUsers'
import ConfirmDialog from '../shared/ConfirmDialog'

interface GroupMember {
  userId: string
  username: string
  displayName: string
  role: string
}

interface Group {
  id: string
  name: string
  slug: string
  members: GroupMember[]
  createdBy: string
  createdByUsername: string
  createdAt: string
}

interface GroupFormData {
  name: string
  slug: string
}

const groupKeys = {
  all: ['admin', 'groups'] as const,
  list: () => [...groupKeys.all, 'list'] as const,
}

/**
 * Fetches all groups from the admin API.
 *
 * @returns Array of groups with member details
 */
async function fetchGroups(): Promise<Group[]> {
  const response = await fetch('/api/admin/groups', { credentials: 'include' })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to fetch groups')
  }
  return response.json()
}

/**
 * Admin group management page.
 * Provides interface for viewing, creating, editing, and deleting groups,
 * as well as managing group membership.
 */
export default function GroupManagementPage() {
  const queryClient = useQueryClient()
  const { data: groups = [], isLoading, error } = useQuery({
    queryKey: groupKeys.list(),
    queryFn: fetchGroups,
    staleTime: 2 * 60 * 1000,
  })
  const { data: allUsers = [] } = useUsers()

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [formData, setFormData] = useState<GroupFormData>({ name: '', slug: '' })

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null)

  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addMemberGroupId, setAddMemberGroupId] = useState<string | null>(null)
  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('member')

  const createGroup = useMutation({
    mutationFn: async (data: GroupFormData) => {
      const response = await fetch('/api/admin/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to create group')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.list() })
      handleCloseDialog()
    },
  })

  const updateGroup = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: GroupFormData }) => {
      const response = await fetch(`/api/admin/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to update group')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.list() })
      handleCloseDialog()
    },
  })

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/groups/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to delete group')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.list() })
      setDeleteConfirmOpen(false)
      setDeletingGroup(null)
    },
  })

  const addMember = useMutation({
    mutationFn: async ({ groupId, userId, role }: { groupId: string; userId: string; role: string }) => {
      const response = await fetch(`/api/admin/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, role }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to add member')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.list() })
      setAddMemberOpen(false)
      setNewMemberUserId('')
      setNewMemberRole('member')
    },
  })

  const handleOpenCreate = () => {
    setEditingGroup(null)
    setFormData({ name: '', slug: '' })
    setDialogOpen(true)
  }

  const handleOpenEdit = (group: Group) => {
    setEditingGroup(group)
    setFormData({ name: group.name, slug: group.slug })
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingGroup(null)
    setFormData({ name: '', slug: '' })
  }

  const handleSubmit = () => {
    if (editingGroup) {
      updateGroup.mutate({ id: editingGroup.id, data: formData })
    } else {
      createGroup.mutate(formData)
    }
  }

  const formatDate = (dateString: string): string => {
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
          Failed to load groups: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', gap: 2, mb: 3, justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          Create Group
        </Button>
      </Box>

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell width={40} />
              <TableCell>Name</TableCell>
              <TableCell>Slug</TableCell>
              <TableCell align="right">Members</TableCell>
              <TableCell>Created By</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  No groups found
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group) => (
                <>
                  <TableRow key={group.id} hover>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                        aria-label="expand row"
                      >
                        {expandedGroupId === group.id ? <CollapseIcon /> : <ExpandIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>{group.name}</TableCell>
                    <TableCell>
                      <Chip label={group.slug} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">{group.members.length}</TableCell>
                    <TableCell>{group.createdByUsername}</TableCell>
                    <TableCell>{formatDate(group.createdAt)}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleOpenEdit(group)} aria-label="edit group">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => { setDeletingGroup(group); setDeleteConfirmOpen(true) }}
                        aria-label="delete group"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <TableRow key={`${group.id}-detail`}>
                    <TableCell colSpan={7} sx={{ py: 0, borderBottom: expandedGroupId === group.id ? undefined : 'none' }}>
                      <Collapse in={expandedGroupId === group.id} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, px: 4 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2">Members</Typography>
                            <Button
                              size="small"
                              startIcon={<PersonAddIcon />}
                              onClick={() => { setAddMemberGroupId(group.id); setAddMemberOpen(true) }}
                            >
                              Add Member
                            </Button>
                          </Box>
                          {group.members.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">No members yet.</Typography>
                          ) : (
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Username</TableCell>
                                  <TableCell>Display Name</TableCell>
                                  <TableCell>Role</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {group.members.map((member) => (
                                  <TableRow key={member.userId}>
                                    <TableCell>{member.username}</TableCell>
                                    <TableCell>{member.displayName}</TableCell>
                                    <TableCell>
                                      <Chip label={member.role} size="small" color={member.role === 'admin' ? 'primary' : 'default'} />
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingGroup ? 'Edit Group' : 'Create Group'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              fullWidth
              required
              helperText="URL-friendly identifier (e.g. my-group)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.name || !formData.slug || createGroup.isPending || updateGroup.isPending}
          >
            {editingGroup ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onClose={() => setAddMemberOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Member</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Autocomplete
              options={allUsers}
              getOptionLabel={(option) =>
                typeof option === 'string' ? option : `${option.username} (${option.displayName})`
              }
              freeSolo
              fullWidth
              onChange={(_e, value) => {
                if (value && typeof value !== 'string') {
                  setNewMemberUserId(value.id)
                } else if (typeof value === 'string') {
                  setNewMemberUserId(value)
                } else {
                  setNewMemberUserId('')
                }
              }}
              onInputChange={(_e, value, reason) => {
                if (reason === 'input') {
                  setNewMemberUserId(value)
                }
              }}
              renderInput={(params) => (
                <TextField {...params} label="User" fullWidth required />
              )}
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={newMemberRole}
                label="Role"
                onChange={(e) => setNewMemberRole(e.target.value)}
              >
                <MenuItem value="member">Member</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddMemberOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (addMemberGroupId) {
                addMember.mutate({ groupId: addMemberGroupId, userId: newMemberUserId, role: newMemberRole })
              }
            }}
            variant="contained"
            disabled={!newMemberUserId || addMember.isPending}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Group"
        message={`Are you sure you want to delete group "${deletingGroup?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        onConfirm={() => { if (deletingGroup) deleteGroup.mutate(deletingGroup.id) }}
        onCancel={() => { setDeleteConfirmOpen(false); setDeletingGroup(null) }}
        loading={deleteGroup.isPending}
      />
    </Box>
  )
}
