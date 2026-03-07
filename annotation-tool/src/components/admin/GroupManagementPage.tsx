/**
 * Admin group management page.
 * Displays a table of all groups with CRUD operations and member management.
 *
 * @module
 */

import { useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  UserPlus,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUsers } from '@store/queries/admin/useUsers'
import { ConfirmDialog } from '../shared/ConfirmDialog'

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
export function GroupManagementPage(): JSX.Element {
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
            Failed to load groups: {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-6 justify-end">
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Group
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead className="text-right">Members</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">
                No groups found
              </TableCell>
            </TableRow>
          ) : (
            groups.map((group) => (
              <>
                <TableRow key={group.id}>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                      aria-label="expand row"
                    >
                      {expandedGroupId === group.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  <TableCell>{group.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{group.slug}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{group.members.length}</TableCell>
                  <TableCell>{group.createdByUsername}</TableCell>
                  <TableCell>{formatDate(group.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(group)} aria-label="edit group">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setDeletingGroup(group); setDeleteConfirmOpen(true) }}
                      aria-label="delete group"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                {expandedGroupId === group.id && (
                  <TableRow key={`${group.id}-detail`}>
                    <TableCell colSpan={7}>
                      <div className="py-4 px-8">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium">Members</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setAddMemberGroupId(group.id); setAddMemberOpen(true) }}
                          >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Add Member
                          </Button>
                        </div>
                        {group.members.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No members yet.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Username</TableHead>
                                <TableHead>Display Name</TableHead>
                                <TableHead>Role</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.members.map((member) => (
                                <TableRow key={member.userId}>
                                  <TableCell>{member.username}</TableCell>
                                  <TableCell>{member.displayName}</TableCell>
                                  <TableCell>
                                    <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                                      {member.role}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))
          )}
        </TableBody>
      </Table>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(isOpen) => !isOpen && handleCloseDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Group' : 'Create Group'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Name *</Label>
              <Input
                id="group-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-slug">Slug *</Label>
              <Input
                id="group-slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">URL-friendly identifier (e.g. my-group)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || !formData.slug || createGroup.isPending || updateGroup.isPending}
            >
              {editingGroup ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={(isOpen) => !isOpen && setAddMemberOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="member-user">User *</Label>
              <Select value={newMemberUserId} onValueChange={(val) => { if (val !== null) setNewMemberUserId(val) }}>
                <SelectTrigger id="member-user">
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {allUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username} ({user.displayName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">Role</Label>
              <Select value={newMemberRole} onValueChange={(val) => { if (val !== null) setNewMemberRole(val) }}>
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (addMemberGroupId) {
                  addMember.mutate({ groupId: addMemberGroupId, userId: newMemberUserId, role: newMemberRole })
                }
              }}
              disabled={!newMemberUserId || addMember.isPending}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Group"
        message={`Are you sure you want to delete group "${deletingGroup?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={() => { if (deletingGroup) deleteGroup.mutate(deletingGroup.id) }}
        onCancel={() => { setDeleteConfirmOpen(false); setDeletingGroup(null) }}
        loading={deleteGroup.isPending}
      />
    </div>
  )
}
