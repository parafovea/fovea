/**
 * Groups listing page.
 *
 * Displays the user's groups as cards with a dialog to create new groups.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
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
  Alert,
  Grid,
  TextField,
  Typography,
} from '@mui/material'
import { Add as AddIcon, Group as GroupIcon } from '@mui/icons-material'
import { useMyGroups, useCreateGroup } from '@store/queries/useGroups'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function GroupsPage(): JSX.Element {
  const navigate = useNavigate()
  const { data: groups, isLoading, error } = useMyGroups()
  const createGroup = useCreateGroup()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name))
    }
  }, [name, slugTouched])

  const handleCreate = () => {
    createGroup.mutate(
      { name, slug, description: description || undefined },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setName('')
          setSlug('')
          setSlugTouched(false)
          setDescription('')
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
          My Groups
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Create Group
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load groups.
        </Alert>
      )}

      {groups && groups.length === 0 && (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <GroupIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            You are not a member of any groups yet.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Create a group to collaborate with other annotators.
          </Typography>
        </Box>
      )}

      <Grid container spacing={2}>
        {(groups ?? []).map((group) => (
          <Grid item xs={12} sm={6} md={4} key={group.id}>
            <Card variant="outlined">
              <CardActionArea onClick={() => navigate(`/groups/${group.id}`)}>
                <CardContent>
                  <Typography variant="h6" noWrap>
                    {group.name}
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
                    {group.description || 'No description'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip label={`${group.memberCount} members`} size="small" variant="outlined" />
                    <Chip label={group.userRole.replace('group_', '')} size="small" color="primary" />
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Group</DialogTitle>
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
          {createGroup.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(createGroup.error as Error).message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!name.trim() || !slug.trim() || createGroup.isPending}
          >
            {createGroup.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
