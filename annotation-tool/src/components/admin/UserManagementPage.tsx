/**
 * User management page component.
 * Displays a table of all users with search, sort, and CRUD operations.
 */

import { useState, useMemo } from 'react'
import { UserPlus, Pencil, Trash2, Search, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUsers, useDeleteUser, UserWithStats } from '@store/queries/admin/useUsers'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'
import { CreateUserDialog } from './CreateUserDialog'
import { EditUserDialog } from './EditUserDialog'
import { ConfirmDialog } from '../shared/ConfirmDialog'

type SortField = 'username' | 'displayName' | 'email' | 'createdAt' | 'personaCount' | 'sessionCount'
type SortOrder = 'asc' | 'desc'

/**
 * User management page.
 * Provides interface for viewing, creating, editing, and deleting users.
 */
export function UserManagementPage(): JSX.Element {
  const pageAnchor = useTourAnchor('user-management-page')
  const { data: users = [], isLoading, error } = useUsers()
  const deleteUser = useDeleteUser()

  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('username')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithStats | null>(null)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<UserWithStats | null>(null)

  /**
   * Handles sort column click.
   *
   * @param field - Field to sort by
   */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  /**
   * Filters and sorts users based on search query and sort settings.
   */
  const filteredUsers = useMemo(() => {
    const filtered = users.filter((user) => {
      const query = searchQuery.toLowerCase()
      return (
        user.username.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
      )
    })

    // Sort
    filtered.sort((a, b) => {
      let aValue: string | number | undefined
      let bValue: string | number | undefined

      switch (sortField) {
        case 'username':
          aValue = a.username
          bValue = b.username
          break
        case 'displayName':
          aValue = a.displayName
          bValue = b.displayName
          break
        case 'email':
          aValue = a.email || ''
          bValue = b.email || ''
          break
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime()
          bValue = new Date(b.createdAt).getTime()
          break
        case 'personaCount':
          aValue = a.personaCount || 0
          bValue = b.personaCount || 0
          break
        case 'sessionCount':
          aValue = a.sessionCount || 0
          bValue = b.sessionCount || 0
          break
      }

      if (aValue === undefined) return 1
      if (bValue === undefined) return -1

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [users, searchQuery, sortField, sortOrder])

  /**
   * Opens edit dialog for a user.
   *
   * @param user - User to edit
   */
  const handleEdit = (user: UserWithStats) => {
    setEditingUser(user)
    setEditDialogOpen(true)
  }

  /**
   * Opens delete confirmation dialog.
   *
   * @param user - User to delete
   */
  const handleDeleteClick = (user: UserWithStats) => {
    setDeletingUser(user)
    setDeleteConfirmOpen(true)
  }

  /**
   * Confirms and executes user deletion.
   */
  const handleDeleteConfirm = async () => {
    if (deletingUser) {
      try {
        await deleteUser.mutateAsync(deletingUser.id)
        setDeleteConfirmOpen(false)
        setDeletingUser(null)
      } catch (error) {
        console.error('Failed to delete user:', error)
      }
    }
  }

  /**
   * Formats date for display.
   *
   * @param dateString - ISO date string
   * @returns Formatted date string
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-8" ref={pageAnchor}>
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6" ref={pageAnchor}>
        <Alert variant="destructive">
          <AlertDescription>Failed to load users: {error.message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6" ref={pageAnchor}>
      {/* Toolbar */}
      <div className="flex gap-4 mb-6 items-center">
        <div className="relative flex-grow max-w-[400px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Users Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('username')}>
                Username
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('displayName')}>
                Display Name
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('email')}>
                Email
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">
              <Button variant="ghost" size="sm" className="-mr-3 h-8" onClick={() => handleSort('personaCount')}>
                Personas
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button variant="ghost" size="sm" className="-mr-3 h-8" onClick={() => handleSort('sessionCount')}>
                Sessions
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('createdAt')}>
                Created
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredUsers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8">
                No users found
              </TableCell>
            </TableRow>
          ) : (
            filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.displayName}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>
                  {user.isAdmin ? (
                    <Badge>Admin</Badge>
                  ) : (
                    <Badge variant="secondary">User</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{user.personaCount || 0}</TableCell>
                <TableCell className="text-right">{user.sessionCount || 0}</TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(user)}
                    aria-label="edit user"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(user)}
                    aria-label="delete user"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Dialogs */}
      <CreateUserDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      {editingUser && (
        <EditUserDialog
          open={editDialogOpen}
          user={editingUser}
          onClose={() => {
            setEditDialogOpen(false)
            setEditingUser(null)
          }}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete User"
        message={`Are you sure you want to delete user "${deletingUser?.username}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeletingUser(null)
        }}
        loading={deleteUser.isPending}
      />
    </div>
  )
}
