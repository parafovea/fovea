/**
 * Projects listing page.
 *
 * Shows personal and group projects in separate sections, with a dialog
 * to create new projects.
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import {
  Add as AddIcon,
  Folder as FolderIcon,
} from '@mui/icons-material'
import { useMyProjects, useCreateProject, type ProjectSummary } from '@store/queries/useProjects'
import { useMyGroups } from '@store/queries/useGroups'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function ProjectsPage(): JSX.Element {
  const navigate = useNavigate()
  const { data: projects, isLoading, error } = useMyProjects('all')
  const { data: groups } = useMyGroups()
  const createProject = useCreateProject()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [ownerGroupId, setOwnerGroupId] = useState('')

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name))
    }
  }, [name, slugTouched])

  const { personal, group: groupProjects } = useMemo(() => {
    const list = projects ?? []
    return {
      personal: list.filter((p) => p.ownerUserId && !p.ownerGroupId),
      group: list.filter((p) => p.ownerGroupId),
    }
  }, [projects])

  const handleCreate = () => {
    createProject.mutate(
      {
        name,
        slug,
        description: description || undefined,
        ownerGroupId: ownerGroupId || undefined,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setName('')
          setSlug('')
          setSlugTouched(false)
          setDescription('')
          setOwnerGroupId('')
        },
      }
    )
  }

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          My Projects
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Create Project
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load projects.
        </Alert>
      )}

      {/* Personal Projects */}
      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
        Personal Projects
      </Typography>
      {personal.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No personal projects yet.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {personal.map((project) => (
            <Grid item xs={12} sm={6} md={4} key={project.id}>
              <ProjectCard project={project} onClick={() => navigate(`/projects/${project.id}`)} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Group Projects */}
      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
        Group Projects
      </Typography>
      {groupProjects.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <FolderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No group projects yet.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {groupProjects.map((project) => (
            <Grid item xs={12} sm={6} md={4} key={project.id}>
              <ProjectCard project={project} onClick={() => navigate(`/projects/${project.id}`)} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Project Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Project</DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mt: 1 }}
            autoFocus
          />
          <TextField
            label="Slug"
            fullWidth
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value)
              setSlugTouched(true)
            }}
            helperText="URL-friendly identifier (lowercase, hyphens only)"
            sx={{ mt: 2 }}
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ mt: 2 }}
          />
          <TextField
            label="Owner Group (optional)"
            fullWidth
            select
            value={ownerGroupId}
            onChange={(e) => setOwnerGroupId(e.target.value)}
            sx={{ mt: 2 }}
            helperText="Leave empty for a personal project"
          >
            <MenuItem value="">Personal (no group)</MenuItem>
            {(groups ?? []).map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
          {createProject.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(createProject.error as Error).message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!name.trim() || !slug.trim() || createProject.isPending}
          >
            {createProject.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}

function ProjectCard({
  project,
  onClick,
}: {
  project: ProjectSummary
  onClick: () => void
}): JSX.Element {
  return (
    <Card variant="outlined">
      <CardActionArea onClick={onClick}>
        <CardContent>
          <Typography variant="h6" noWrap>
            {project.name}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.5,
              mb: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              minHeight: 40,
            }}
          >
            {project.description || 'No description'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip label={`${project._count.members} members`} size="small" variant="outlined" />
            {project.myRole && (
              <Chip label={project.myRole.replace('project_', '')} size="small" color="primary" />
            )}
            {project.isArchived && <Chip label="Archived" size="small" color="warning" />}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
