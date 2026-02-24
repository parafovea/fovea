/**
 * Project detail page.
 *
 * Shows project metadata, member management, personas, and settings
 * for a single project.
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
  Divider,
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
  Star as StarIcon,
} from '@mui/icons-material'
import {
  useProject,
  useProjectMembers,
  useProjectPersonas,
  useAddProjectMember,
  useUpdateProjectMember,
  useRemoveProjectMember,
  useUpdateProject,
  type ProjectMember,
  type ProjectPersona,
} from '@store/queries/useProjects'
import { useUsers } from '@store/queries/admin/useUsers'
import { useProjectContextStore } from '@store/zustand/projectContextStore'
import { useAuthStore } from '@store/zustand/authStore'

const MANAGER_ROLES = ['project_owner', 'project_manager']
const ASSIGNABLE_ROLES = ['project_manager', 'annotator', 'reviewer', 'viewer']

export default function ProjectDetailPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>()
  const currentUserId = useAuthStore((s) => s.currentUser?.id)
  const setActiveProject = useProjectContextStore((s) => s.setActiveProject)

  const { data: project, isLoading: projectLoading, error: projectError } = useProject(projectId)
  const { data: members = [], isLoading: membersLoading } = useProjectMembers(projectId)
  const { data: personas = [] } = useProjectPersonas(projectId)
  const addMember = useAddProjectMember()
  const updateMember = useUpdateProjectMember()
  const removeMember = useRemoveProjectMember()
  const updateProject = useUpdateProject()
  const { data: allUsers = [] } = useUsers()

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newUserId, setNewUserId] = useState('')
  const [newRole, setNewRole] = useState('annotator')

  const myRole = members.find((m: ProjectMember) => m.userId === currentUserId)?.role
  const isManager = myRole ? MANAGER_ROLES.includes(myRole) : false
  const isOwner = myRole === 'project_owner'

  const handleAddMember = () => {
    if (!projectId) return
    addMember.mutate(
      { projectId, userId: newUserId, role: newRole },
      {
        onSuccess: () => {
          setAddDialogOpen(false)
          setNewUserId('')
          setNewRole('annotator')
        },
      }
    )
  }

  const handleSetActive = () => {
    if (project && myRole) {
      setActiveProject(project.id, project.name, myRole)
    }
  }

  const handleToggleArchive = () => {
    if (!projectId || !project) return
    updateProject.mutate({
      projectId,
      data: { isArchived: !project.isArchived },
    })
  }

  if (projectLoading || membersLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  if (projectError || !project) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 3 }}>
          <Alert severity="error">Failed to load project.</Alert>
          <Button component={RouterLink} to="/projects" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
            Back to Projects
          </Button>
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 3 }}>
        <Button component={RouterLink} to="/projects" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
          Back to Projects
        </Button>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box>
            <Typography variant="h4" component="h1">
              {project.name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Chip
                label={project.isArchived ? 'Archived' : 'Active'}
                size="small"
                color={project.isArchived ? 'warning' : 'success'}
              />
              {myRole && <Chip label={myRole.replace('project_', '')} size="small" color="primary" />}
            </Box>
          </Box>
          <Button variant="outlined" startIcon={<StarIcon />} onClick={handleSetActive}>
            Set as Active Project
          </Button>
        </Box>

        {project.description && (
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            {project.description}
          </Typography>
        )}

        {/* Videos */}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {project.videoAssignmentCount ?? 0} video assignments
        </Typography>

        <Divider sx={{ my: 3 }} />

        {/* Members Section */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Members</Typography>
          {isManager && (
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
                {isManager && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((member: ProjectMember) => (
                <TableRow key={member.id}>
                  <TableCell>{member.user?.displayName || member.userId}</TableCell>
                  <TableCell>
                    {isManager && member.role !== 'project_owner' ? (
                      <Select
                        size="small"
                        value={member.role}
                        onChange={(e) =>
                          projectId &&
                          updateMember.mutate({
                            projectId,
                            userId: member.userId,
                            role: e.target.value,
                          })
                        }
                        sx={{ minWidth: 150 }}
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <MenuItem key={r} value={r}>
                            {r.replace('project_', '')}
                          </MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <Chip label={member.role.replace('project_', '')} size="small" />
                    )}
                  </TableCell>
                  <TableCell>{new Date(member.joinedAt).toLocaleDateString()}</TableCell>
                  {isManager && (
                    <TableCell align="right">
                      {member.role !== 'project_owner' && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() =>
                            projectId && removeMember.mutate({ projectId, userId: member.userId })
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

        {/* Personas Section */}
        <Divider sx={{ my: 3 }} />
        <Typography variant="h6" sx={{ mb: 2 }}>
          Personas
        </Typography>
        {personas.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No personas assigned to this project.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {personas.map((p: ProjectPersona) => (
              <Chip key={p.id} label={`${p.name} (${p.role})`} variant="outlined" />
            ))}
          </Box>
        )}

        {/* Settings (owner only) */}
        {isOwner && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography variant="h6" sx={{ mb: 2 }}>
              Settings
            </Typography>
            <Button
              variant="outlined"
              color={project.isArchived ? 'success' : 'warning'}
              onClick={handleToggleArchive}
              disabled={updateProject.isPending}
            >
              {project.isArchived ? 'Unarchive Project' : 'Archive Project'}
            </Button>
          </>
        )}
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
          <TextField
            label="Role"
            fullWidth
            select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            sx={{ mt: 2 }}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <MenuItem key={r} value={r}>
                {r.replace('project_', '')}
              </MenuItem>
            ))}
          </TextField>
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
