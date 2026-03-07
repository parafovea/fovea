/**
 * Project detail page.
 *
 * Shows project metadata, member management, personas, and settings
 * for a single project.
 */

import { useState } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import { ArrowLeft, UserPlus, Trash2, Star, ChevronsUpDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
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
  const [userComboboxOpen, setUserComboboxOpen] = useState(false)

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
      <div className="mx-auto max-w-screen-lg px-4">
        <div className="flex justify-center py-12">
          <Spinner className="size-8" />
        </div>
      </div>
    )
  }

  if (projectError || !project) {
    return (
      <div className="mx-auto max-w-screen-lg px-4">
        <div className="py-6">
          <Alert variant="destructive">
            <AlertDescription>Failed to load project.</AlertDescription>
          </Alert>
          <Button variant="ghost" className="mt-4" asChild>
            <RouterLink to="/projects">
              <ArrowLeft className="size-4" />
              Back to Projects
            </RouterLink>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-screen-lg px-4">
      <div className="py-6">
        <Button variant="ghost" className="mb-4" asChild>
          <RouterLink to="/projects">
            <ArrowLeft className="size-4" />
            Back to Projects
          </RouterLink>
        </Button>

        <div className="mb-2 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <div className="mt-2 flex gap-2">
              <Badge variant={project.isArchived ? 'secondary' : 'default'}>
                {project.isArchived ? 'Archived' : 'Active'}
              </Badge>
              {myRole && <Badge>{myRole.replace('project_', '')}</Badge>}
            </div>
          </div>
          <Button variant="outline" onClick={handleSetActive}>
            <Star className="size-4" />
            Set as Active Project
          </Button>
        </div>

        {project.description && (
          <p className="mt-2 mb-6 text-muted-foreground">{project.description}</p>
        )}

        {/* Videos */}
        <p className="mt-4 text-sm text-muted-foreground">
          {project.videoAssignmentCount ?? 0} video assignments
        </p>

        <Separator className="my-6" />

        {/* Members Section */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Members</h2>
          {isManager && (
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="size-4" />
              Add Member
            </Button>
          )}
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {isManager && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member: ProjectMember) => (
                <TableRow key={member.id}>
                  <TableCell>{member.user?.displayName || member.userId}</TableCell>
                  <TableCell>
                    {isManager && member.role !== 'project_owner' ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) =>
                          projectId &&
                          updateMember.mutate({
                            projectId,
                            userId: member.userId,
                            role: value,
                          })
                        }
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r.replace('project_', '')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{member.role.replace('project_', '')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{new Date(member.joinedAt).toLocaleDateString()}</TableCell>
                  {isManager && (
                    <TableCell className="text-right">
                      {member.role !== 'project_owner' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          onClick={() =>
                            projectId && removeMember.mutate({ projectId, userId: member.userId })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Personas Section */}
        <Separator className="my-6" />
        <h2 className="mb-4 text-lg font-semibold">Personas</h2>
        {personas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No personas assigned to this project.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {personas.map((p: ProjectPersona) => (
              <Badge key={p.id} variant="outline">{p.name} ({p.role})</Badge>
            ))}
          </div>
        )}

        {/* Settings (owner only) */}
        {isOwner && (
          <>
            <Separator className="my-6" />
            <h2 className="mb-4 text-lg font-semibold">Settings</h2>
            <Button
              variant="outline"
              onClick={handleToggleArchive}
              disabled={updateProject.isPending}
            >
              {project.isArchived ? 'Unarchive Project' : 'Archive Project'}
            </Button>
          </>
        )}
      </div>

      {/* Add Member Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) setAddDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label>User</Label>
              <Popover open={userComboboxOpen} onOpenChange={setUserComboboxOpen}>
                <PopoverTrigger
                  className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  {newUserId
                    ? allUsers.find((u) => u.id === newUserId)
                      ? `${allUsers.find((u) => u.id === newUserId)!.username} (${allUsers.find((u) => u.id === newUserId)!.displayName})`
                      : newUserId
                    : 'Select user...'}
                  <ChevronsUpDown className="ml-2 size-4 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                  <Command>
                    <CommandInput placeholder="Search users..." />
                    <CommandList>
                      <CommandEmpty>No users found.</CommandEmpty>
                      {allUsers.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={`${user.username} ${user.displayName}`}
                          onSelect={() => {
                            setNewUserId(user.id)
                            setUserComboboxOpen(false)
                          }}
                        >
                          <Check className={cn('size-4', newUserId === user.id ? 'opacity-100' : 'opacity-0')} />
                          {user.username} ({user.displayName})
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(value) => setNewRole(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace('project_', '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {addMember.isError && (
              <Alert variant="destructive">
                <AlertDescription>{(addMember.error as Error).message}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAddMember}
              disabled={!newUserId.trim() || addMember.isPending}
            >
              {addMember.isPending ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
