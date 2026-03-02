/**
 * Admin permissions editor page.
 * Displays the role-permission matrix as a read-only grid.
 *
 * @module
 */

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  CircularProgress,
  Typography,
  Paper,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'

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
 * Returns a MUI color for a given action name.
 *
 * @param action - Action name (e.g. "create", "read", "delete")
 * @returns Chip color corresponding to the action
 */
function actionColor(action: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (action) {
    case 'create':
      return 'success'
    case 'read':
      return 'info'
    case 'update':
      return 'warning'
    case 'delete':
      return 'error'
    default:
      return 'default'
  }
}

/**
 * Admin permissions page.
 * Displays a matrix of roles (rows) and resource types (columns),
 * with each cell showing the permitted actions as colored chips.
 * Currently read-only; editing support can be added later.
 */
export default function PermissionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: permissionKeys.matrix(),
    queryFn: fetchPermissions,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load permissions: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      </Box>
    )
  }

  if (!data || data.roles.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">No permission data available.</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Read-only view of the role-permission matrix. Each cell shows the actions a role can perform on a resource type.
        </Typography>
      </Box>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Role</TableCell>
                {data.resources.map((resource) => (
                  <TableCell key={resource} sx={{ fontWeight: 'bold', minWidth: 140 }}>
                    {resource}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.roles.map((role) => (
                <TableRow key={role} hover>
                  <TableCell>
                    <Chip
                      label={role}
                      size="small"
                      color={role === 'admin' ? 'primary' : role === 'owner' ? 'secondary' : 'default'}
                    />
                  </TableCell>
                  {data.resources.map((resource) => {
                    const actions = getActions(data.permissions, role, resource)
                    return (
                      <TableCell key={`${role}-${resource}`}>
                        {actions.length === 0 ? (
                          <Typography variant="caption" color="text.disabled">
                            none
                          </Typography>
                        ) : (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {actions.map((action) => (
                              <Chip
                                key={action}
                                label={action}
                                size="small"
                                color={actionColor(action)}
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
          Legend:
        </Typography>
        {['create', 'read', 'update', 'delete', 'share'].map((action) => (
          <Chip key={action} label={action} size="small" color={actionColor(action)} variant="outlined" />
        ))}
      </Box>
    </Box>
  )
}
