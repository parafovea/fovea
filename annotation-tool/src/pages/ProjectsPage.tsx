/**
 * Projects listing page.
 *
 * Shows personal and group projects in separate sections, with a dialog
 * to create new projects.
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { useMyProjects, useCreateProject, type ProjectSummary } from '@store/queries/useProjects'
import { useMyGroups } from '@store/queries/useGroups'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

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

  const pageAnchor = useTourAnchor('projects-page')
  const createButtonAnchor = useTourAnchor('projects-create-button')
  const nameInputAnchor = useTourAnchor('project-name-input')

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
      <div className="mx-auto max-w-screen-lg px-4">
        <div className="flex justify-center py-12">
          <Spinner className="size-8" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-screen-lg px-4" ref={pageAnchor}>
      <div className="flex items-center justify-between py-6">
        <h1 className="text-2xl font-bold">My Projects</h1>
        <Button ref={createButtonAnchor} onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Create Project
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Failed to load projects.</AlertDescription>
        </Alert>
      )}

      {/* Personal Projects */}
      <h2 className="mt-4 mb-2 text-lg font-semibold">Personal Projects</h2>
      {personal.length === 0 ? (
        <div className="py-8 text-center">
          <Folder className="mx-auto mb-2 size-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No personal projects yet.</p>
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {personal.map((project) => (
            <ProjectCard key={project.id} project={project} onClick={() => navigate(`/projects/${project.id}`)} />
          ))}
        </div>
      )}

      {/* Group Projects */}
      <h2 className="mt-4 mb-2 text-lg font-semibold">Group Projects</h2>
      {groupProjects.length === 0 ? (
        <div className="py-8 text-center">
          <Folder className="mx-auto mb-2 size-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No group projects yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {groupProjects.map((project) => (
            <ProjectCard key={project.id} project={project} onClick={() => navigate(`/projects/${project.id}`)} />
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(isOpen) => { if (!isOpen) setDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                ref={nameInputAnchor}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-slug">Slug</Label>
              <Input
                id="project-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setSlugTouched(true)
                }}
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (lowercase, hyphens only)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Owner Group (optional)</Label>
              <Select value={ownerGroupId} onValueChange={(value) => setOwnerGroupId(value ?? '')}>
                <SelectTrigger className="w-full">
                  {/* Explicit child override: base-ui Select otherwise
                      paints the raw value (UUID) before SelectContent
                      first opens, because the trigger label is sourced
                      from a SelectItem ref that only registers when the
                      dropdown mounts. Resolve the group name from the
                      groups list here so the trigger shows 'My Group'
                      on first paint and only falls back to the
                      placeholder when no group is selected. Same pattern
                      as the persona-trigger fix in VideoSummaryDialog
                      and AnnotationWorkspace. */}
                  <SelectValue placeholder="Personal (no group)">
                    {ownerGroupId
                      ? (groups ?? []).find((g) => g.id === ownerGroupId)?.name ?? null
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Personal (no group)</SelectItem>
                  {(groups ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leave empty for a personal project
              </p>
            </div>
            {createProject.isError && (
              <Alert variant="destructive">
                <AlertDescription>{(createProject.error as Error).message}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !slug.trim() || createProject.isPending}
            >
              {createProject.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <CardContent>
        <h3 className="truncate text-base font-semibold">{project.name}</h3>
        <p className="mt-1 mb-3 line-clamp-2 min-h-[40px] text-sm text-muted-foreground">
          {project.description || 'No description'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{project._count.members} members</Badge>
          {project.myRole && (
            <Badge>{project.myRole.replace('project_', '')}</Badge>
          )}
          {project.isArchived && <Badge variant="secondary">Archived</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}
