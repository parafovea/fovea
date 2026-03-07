/**
 * Admin permissions editor page.
 * Displays the role-permission matrix as a read-only grid.
 *
 * @module
 */

import { useQuery } from '@tanstack/react-query'
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

interface RolePermission {
  role: string
  resource: string
  actions: string[]
}

interface PermissionMatrix {
  roles: string[]
  resources: string[]
  permissions: RolePermission[]
}

const permissionKeys = {
  all: ['admin', 'permissions'] as const,
  matrix: () => [...permissionKeys.all, 'matrix'] as const,
}

/**
 * Fetches the role-permission matrix from the admin API.
 *
 * @returns Permission matrix with roles, resources, and their associated actions
 */
async function fetchPermissions(): Promise<PermissionMatrix> {
  const response = await fetch('/api/admin/permissions', { credentials: 'include' })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to fetch permissions')
  }
  return response.json()
}

/**
 * Looks up the allowed actions for a given role and resource.
 *
 * @param permissions - Full list of role-permission entries
 * @param role - Role name to look up
 * @param resource - Resource type to look up
 * @returns Array of action strings, or empty array if none found
 */
function getActions(permissions: RolePermission[], role: string, resource: string): string[] {
  const entry = permissions.find((p) => p.role === role && p.resource === resource)
  return entry?.actions ?? []
}

/**
 * Returns a Badge variant for a given action name.
 *
 * @param action - Action name (e.g. "create", "read", "delete")
 * @returns Badge variant corresponding to the action
 */
function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (action) {
    case 'create':
      return 'secondary'
    case 'read':
      return 'outline'
    case 'update':
      return 'outline'
    case 'delete':
      return 'destructive'
    default:
      return 'outline'
  }
}

/**
 * Admin permissions page.
 * Displays a matrix of roles (rows) and resource types (columns),
 * with each cell showing the permitted actions as colored badges.
 * Currently read-only; editing support can be added later.
 */
export function PermissionsPage(): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: permissionKeys.matrix(),
    queryFn: fetchPermissions,
    staleTime: 5 * 60 * 1000,
  })

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
            Failed to load permissions: {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data || data.roles.length === 0) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>No permission data available.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          Read-only view of the role-permission matrix. Each cell shows the actions a role can perform on a resource type.
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-bold min-w-[120px]">Role</TableHead>
              {data.resources.map((resource) => (
                <TableHead key={resource} className="font-bold min-w-[140px]">
                  {resource}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.roles.map((role) => (
              <TableRow key={role}>
                <TableCell>
                  <Badge
                    variant={role === 'admin' ? 'default' : role === 'owner' ? 'secondary' : 'outline'}
                  >
                    {role}
                  </Badge>
                </TableCell>
                {data.resources.map((resource) => {
                  const actions = getActions(data.permissions, role, resource)
                  return (
                    <TableCell key={`${role}-${resource}`}>
                      {actions.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          none
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {actions.map((action) => (
                            <Badge
                              key={action}
                              variant={actionVariant(action)}
                            >
                              {action}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex gap-2 flex-wrap items-center">
        <span className="text-xs text-muted-foreground mr-2">
          Legend:
        </span>
        {['create', 'read', 'update', 'delete', 'share'].map((action) => (
          <Badge key={action} variant={actionVariant(action)}>
            {action}
          </Badge>
        ))}
      </div>
    </div>
  )
}
