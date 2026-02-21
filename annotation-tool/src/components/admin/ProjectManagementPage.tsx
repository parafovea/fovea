/**
 * Admin project management page.
 * Displays a table of all projects with CRUD operations and member management.
 *
 * @module
 */

import { useState } from 'react'
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
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
} from '@mui/icons-material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ConfirmDialog from '../shared/ConfirmDialog'

interface ProjectMember {
  userId: string
  username: string
  role: string
}

interface Project {
  id: string
  name: string
  slug: string
  ownerType: 'user' | 'group'
  ownerId: string
  ownerName: string
  members: ProjectMember[]
  videoCount: number
  archived: boolean
  createdAt: string
}

interface ProjectFormData {
  name: string
  slug: string
  ownerType: 'user' | 'group'
  ownerId: string
}

const projectKeys = {
  all: ['admin', 'projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
}

/**
 * Fetches all projects from the admin API.
 *
 * @returns Array of projects with member and video counts
 */
async function fetchProjects(): Promise<Project[]> {
  const response = await fetch('/api/admin/projects', { credentials: 'include' })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to fetch projects')
  }
  return response.json()
}

/**
 * Admin project management page.
 * Provides interface for viewing, creating, editing, archiving, and deleting projects.
 */
export default function ProjectManagementPage() {
  const queryClient = useQueryClient()
  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: projectKeys.list(),
    queryFn: fetchProjects,
    staleTime: 2 * 60 * 1000,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    slug: '',
    ownerType: 'user',
    ownerId: '',
  })

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const createProject = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const response = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to create project')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list() })
      handleCloseDialog()
    },
  })

  const updateProject = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProjectFormData }) => {
      const response = await fetch(`/api/admin/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to update project')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list() })
      handleCloseDialog()
    },
  })

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/projects/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to delete project')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list() })
      setDeleteConfirmOpen(false)
      setDeletingProject(null)
    },
  })

  const toggleArchive = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const response = await fetch(`/api/admin/projects/${id}/archive`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ archived }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to update archive status')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })

  const handleOpenCreate = () => {
    setEditingProject(null)
    setFormData({ name: '', slug: '', ownerType: 'user', ownerId: '' })
    setDialogOpen(true)
  }

  const handleOpenEdit = (project: Project) => {
    setEditingProject(project)
    setFormData({
      name: project.name,
      slug: project.slug,
      ownerType: project.ownerType,
      ownerId: project.ownerId,
    })
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingProject(null)
    setFormData({ name: '', slug: '', ownerType: 'user', ownerId: '' })
  }

  const handleSubmit = () => {
    if (editingProject) {
      updateProject.mutate({ id: editingProject.id, data: formData })
    } else {
      createProject.mutate(formData)
    }
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const visibleProjects = showArchived ? projects : projects.filter((p) => !p.archived)

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
          Failed to load projects: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', justifyContent: 'space-between' }}>
        <FormControlLabel
          control={<Switch checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />}
          label="Show archived"
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          Create Project
        </Button>
      </Box>

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Slug</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell align="right">Members</TableCell>
              <TableCell align="right">Videos</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  No projects found
                </TableCell>
              </TableRow>
            ) : (
              visibleProjects.map((project) => (
                <TableRow key={project.id} hover sx={{ opacity: project.archived ? 0.6 : 1 }}>
                  <TableCell>{project.name}</TableCell>
                  <TableCell>
                    <Chip label={project.slug} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={project.ownerName}
                      size="small"
                      color={project.ownerType === 'group' ? 'secondary' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">{project.members.length}</TableCell>
                  <TableCell align="right">{project.videoCount}</TableCell>
                  <TableCell>
                    {project.archived ? (
                      <Chip label="Archived" size="small" color="warning" />
                    ) : (
                      <Chip label="Active" size="small" color="success" />
                    )}
                  </TableCell>
                  <TableCell>{formatDate(project.createdAt)}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleOpenEdit(project)} aria-label="edit project">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => toggleArchive.mutate({ id: project.id, archived: !project.archived })}
                      aria-label={project.archived ? 'unarchive project' : 'archive project'}
                    >
                      {project.archived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => { setDeletingProject(project); setDeleteConfirmOpen(true) }}
                      aria-label="delete project"
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingProject ? 'Edit Project' : 'Create Project'}</DialogTitle>
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
              helperText="URL-friendly identifier (e.g. my-project)"
            />
            <TextField
              label="Owner ID"
              value={formData.ownerId}
              onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
              fullWidth
              required
              helperText={`UUID of the ${formData.ownerType} that owns this project`}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.name || !formData.slug || !formData.ownerId || createProject.isPending || updateProject.isPending}
          >
            {editingProject ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Project"
        message={`Are you sure you want to delete project "${deletingProject?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        onConfirm={() => { if (deletingProject) deleteProject.mutate(deletingProject.id) }}
        onCancel={() => { setDeleteConfirmOpen(false); setDeletingProject(null) }}
        loading={deleteProject.isPending}
      />
    </Box>
  )
}
