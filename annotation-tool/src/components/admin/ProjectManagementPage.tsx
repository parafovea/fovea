/**
 * Admin project management page.
 * Displays a table of all projects with CRUD operations and member management.
 *
 * @module
 */

import { useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '../shared/ConfirmDialog'

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
export function ProjectManagementPage(): JSX.Element {
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
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load projects: {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-6 items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <Label htmlFor="show-archived">Show archived</Label>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Project
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Members</TableHead>
            <TableHead className="text-right">Videos</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleProjects.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8">
                No projects found
              </TableCell>
            </TableRow>
          ) : (
            visibleProjects.map((project) => (
              <TableRow key={project.id} className={project.archived ? 'opacity-60' : ''}>
                <TableCell>{project.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{project.slug}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={project.ownerType === 'group' ? 'secondary' : 'default'}>
                    {project.ownerName}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{project.members.length}</TableCell>
                <TableCell className="text-right">{project.videoCount}</TableCell>
                <TableCell>
                  {project.archived ? (
                    <Badge variant="outline">Archived</Badge>
                  ) : (
                    <Badge variant="secondary">Active</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(project.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(project)} aria-label="edit project">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleArchive.mutate({ id: project.id, archived: !project.archived })}
                    aria-label={project.archived ? 'unarchive project' : 'archive project'}
                  >
                    {project.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setDeletingProject(project); setDeleteConfirmOpen(true) }}
                    aria-label="delete project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(isOpen) => !isOpen && handleCloseDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Edit Project' : 'Create Project'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name *</Label>
              <Input
                id="project-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-slug">Slug *</Label>
              <Input
                id="project-slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">URL-friendly identifier (e.g. my-project)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-ownerId">Owner ID *</Label>
              <Input
                id="project-ownerId"
                value={formData.ownerId}
                onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                UUID of the {formData.ownerType} that owns this project
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || !formData.slug || !formData.ownerId || createProject.isPending || updateProject.isPending}
            >
              {editingProject ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Project"
        message={`Are you sure you want to delete project "${deletingProject?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={() => { if (deletingProject) deleteProject.mutate(deletingProject.id) }}
        onCancel={() => { setDeleteConfirmOpen(false); setDeletingProject(null) }}
        loading={deleteProject.isPending}
      />
    </div>
  )
}
