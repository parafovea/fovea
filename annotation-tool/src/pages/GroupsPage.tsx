/**
 * Groups listing page.
 *
 * Displays the user's groups as cards with a dialog to create new groups.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
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
      <div className="mx-auto max-w-screen-lg px-4">
        <div className="flex justify-center py-12">
          <Spinner className="size-8" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-screen-lg px-4" data-tour-id="groups-page">
      <div className="flex items-center justify-between py-6">
        <h1 className="text-2xl font-bold">My Groups</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Create Group
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Failed to load groups.</AlertDescription>
        </Alert>
      )}

      {groups && groups.length === 0 && (
        <div className="py-12 text-center">
          <Users className="mx-auto mb-4 size-16 text-muted-foreground" />
          <h2 className="text-lg font-medium text-muted-foreground">
            You are not a member of any groups yet.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a group to collaborate with other annotators.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {(groups ?? []).map((group) => (
          <Card
            key={group.id}
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={() => navigate(`/groups/${group.id}`)}
          >
            <CardContent>
              <h3 className="truncate text-base font-semibold">{group.name}</h3>
              <p className="mt-1 mb-3 line-clamp-2 min-h-[40px] text-sm text-muted-foreground">
                {group.description || 'No description'}
              </p>
              <div className="flex gap-2">
                <Badge variant="outline">{group.memberCount} members</Badge>
                <Badge>{group.userRole.replace('group_', '')}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(isOpen) => { if (!isOpen) setDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-slug">Slug</Label>
              <Input
                id="group-slug"
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
              <Label htmlFor="group-description">Description</Label>
              <Textarea
                id="group-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {createGroup.isError && (
              <Alert variant="destructive">
                <AlertDescription>{(createGroup.error as Error).message}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !slug.trim() || createGroup.isPending}
            >
              {createGroup.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
