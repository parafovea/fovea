/**
 * Group detail page.
 *
 * Shows group information, member list with role management, and a link back
 * to the groups listing.
 */

import { useState } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import { ArrowLeft, UserPlus, Trash2, ChevronsUpDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
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
  const [userComboboxOpen, setUserComboboxOpen] = useState(false)

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
      <div className="mx-auto max-w-screen-lg px-4">
        <div className="flex justify-center py-12">
          <Spinner className="size-8" />
        </div>
      </div>
    )
  }

  if (groupError || !group) {
    return (
      <div className="mx-auto max-w-screen-lg px-4">
        <div className="py-6">
          <Alert variant="destructive">
            <AlertDescription>Failed to load group.</AlertDescription>
          </Alert>
          <Button variant="ghost" className="mt-4" asChild>
            <RouterLink to="/groups">
              <ArrowLeft className="size-4" />
              Back to Groups
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
          <RouterLink to="/groups">
            <ArrowLeft className="size-4" />
            Back to Groups
          </RouterLink>
        </Button>

        <h1 className="text-2xl font-bold">{group.name}</h1>
        {group.description && (
          <p className="mt-1 mb-6 text-muted-foreground">{group.description}</p>
        )}

        {/* Members */}
        <div className="mt-8 mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Members</h2>
          {isAdmin && (
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
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.user?.displayName ?? member.userId}</TableCell>
                  <TableCell>
                    {isAdmin && member.role !== 'group_owner' ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) =>
                          groupId &&
                          updateMember.mutate({ groupId, userId: member.userId, role: value })
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="group_admin">Admin</SelectItem>
                          <SelectItem value="group_member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{member.role.replace('group_', '')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{new Date(member.joinedAt).toLocaleDateString()}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {member.role !== 'group_owner' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          onClick={() =>
                            groupId && removeMember.mutate({ groupId, userId: member.userId })
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
                  <SelectItem value="group_admin">Admin</SelectItem>
                  <SelectItem value="group_member">Member</SelectItem>
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
