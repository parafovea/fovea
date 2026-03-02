/**
 * Group detail page.
 *
 * Shows group information, member list with role management, and a link back
 * to the groups listing.
 */

import { useState } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
  PersonAdd as PersonAddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import {
  useGroup,
  useGroupMembers,
  useAddGroupMember,
  useUpdateGroupMember,
  useRemoveGroupMember,
} from '@store/queries/useGroups'
import { useUsers } from '@store/queries/admin/useUsers'
import { useAuthStore } from '@store/zustand/authStore'

const ADMIN_ROLES = ['group_owner', 'group_admin']

export default function GroupDetailPage(): JSX.Element {
  const { groupId } = useParams<{ groupId: string }>()
  const currentUserId = useAuthStore((s) => s.currentUser?.id)

  const { data: group, isLoading: groupLoading, error: groupError } = useGroup(groupId)
  const { data: members = [], isLoading: membersLoading } = useGroupMembers(groupId)
  const addMember = useAddGroupMember()
  const updateMember = useUpdateGroupMember()
  const removeMember = useRemoveGroupMember()
  const { data: allUsers = [] } = useUsers()

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newUserId, setNewUserId] = useState('')
  const [newRole, setNewRole] = useState<string>('group_member')

  const myRole = members.find((m) => m.userId === currentUserId)?.role
  const isAdmin = myRole ? ADMIN_ROLES.includes(myRole) : false

  const handleAddMember = () => {
    if (!groupId) return
    addMember.mutate(
      { groupId, userId: newUserId, role: newRole },
      {
        onSuccess: () => {
          setAddDialogOpen(false)
          setNewUserId('')
          setNewRole('group_member')
        },
      }
    )
  }

  if (groupLoading || membersLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  if (groupError || !group) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 3 }}>
          <Alert severity="error">Failed to load group.</Alert>
          <Button component={RouterLink} to="/groups" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
            Back to Groups
          </Button>
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 3 }}>
        <Button component={RouterLink} to="/groups" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
          Back to Groups
        </Button>

        <Typography variant="h4" component="h1" gutterBottom>
          {group.name}
        </Typography>
        {group.description && (
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            {group.description}
          </Typography>
        )}

        {/* Members */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 4 }}>
          <Typography variant="h6">Members</Typography>
          {isAdmin && (
            <Button size="small" startIcon={<PersonAddIcon />} onClick={() => setAddDialogOpen(true)}>
              Add Member
            </Button>
          )}
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Joined</TableCell>
                {isAdmin && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.user?.displayName ?? member.userId}</TableCell>
                  <TableCell>
                    {isAdmin && member.role !== 'group_owner' ? (
                      <Select
                        size="small"
                        value={member.role}
                        onChange={(e) =>
                          groupId &&
                          updateMember.mutate({ groupId, userId: member.userId, role: e.target.value })
                        }
                        sx={{ minWidth: 140 }}
                      >
                        <MenuItem value="group_admin">Admin</MenuItem>
                        <MenuItem value="group_member">Member</MenuItem>
                      </Select>
                    ) : (
                      <Chip label={member.role.replace('group_', '')} size="small" />
                    )}
                  </TableCell>
                  <TableCell>{new Date(member.joinedAt).toLocaleDateString()}</TableCell>
                  {isAdmin && (
                    <TableCell align="right">
                      {member.role !== 'group_owner' && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() =>
                            groupId && removeMember.mutate({ groupId, userId: member.userId })
                          }
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Add Member Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Member</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={allUsers}
            getOptionLabel={(option) =>
              typeof option === 'string' ? option : `${option.username} (${option.displayName})`
            }
            freeSolo
            fullWidth
            onChange={(_e, value) => {
              if (value && typeof value !== 'string') {
                setNewUserId(value.id)
              } else if (typeof value === 'string') {
                setNewUserId(value)
              } else {
                setNewUserId('')
              }
            }}
            onInputChange={(_e, value, reason) => {
              if (reason === 'input') {
                setNewUserId(value)
              }
            }}
            renderInput={(params) => (
              <TextField {...params} label="User" autoFocus sx={{ mt: 1 }} />
            )}
          />
          <Select
            fullWidth
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            sx={{ mt: 2 }}
          >
            <MenuItem value="group_admin">Admin</MenuItem>
            <MenuItem value="group_member">Member</MenuItem>
          </Select>
          {addMember.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(addMember.error as Error).message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddMember}
            disabled={!newUserId.trim() || addMember.isPending}
          >
            {addMember.isPending ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
