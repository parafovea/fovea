/**
 * Admin panel component.
 * Provides tabs for user, group, project, video access, permissions, session, and settings management.
 *
 * Render rules:
 *   - An administrator signed in always sees the panel.
 *   - On a deployment that opted into the tour catalogue
 *     (VITE_DEMO_PUBLIC=1 — the same flag that mounts the public
 *     catalogue at `/`), non-admin visitors ALSO see the panel
 *     chrome so the Admin tour can walk them through what an
 *     administrator can do without granting them the role. The
 *     destructive operations the panel exposes (create user, edit
 *     permissions, kill session, change settings) remain gated at
 *     the server-side route layer — every POST / PUT / PATCH /
 *     DELETE requires requireAdmin / system_admin — so a non-admin
 *     visitor can read the layout the tour anchors against but
 *     cannot actually mutate the deployment.
 *   - On a stock production deployment (no catalogue flag) the
 *     route still redirects non-admins to `/` so the panel is not
 *     reachable by direct navigation. The sidebar Admin entry
 *     itself is gated separately on isAdmin in the layout, so a
 *     normal user never sees a link to it either.
 */

import { Navigate } from 'react-router-dom'
import {
  Users,
  Group,
  Folder,
  Video,
  Shield,
  Lock,
  Settings,
  Cpu,
  Sliders,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAuthStore } from '@store/zustand/authStore'
import { UserManagementPage } from './UserManagementPage'
import { SessionManagementPage } from './SessionManagementPage'
import { GroupManagementPage } from './GroupManagementPage'
import { ProjectManagementPage } from './ProjectManagementPage'
import { VideoAssignmentPage } from './VideoAssignmentPage'
import { PermissionsPage } from './PermissionsPage'
import { ModelManagementPage } from './ModelManagementPage'
import { SystemConfigPanel } from './SystemConfigPanel'
import { DemoAdminPanel } from './DemoAdminPanel'

/**
 * Admin panel component.
 * Displays tabs for users, groups, projects, video access, permissions, sessions, and settings.
 * Redirects non-admin users to home page.
 */
export function AdminPanel(): JSX.Element {
  const currentUser = useAuthStore(state => state.currentUser)
  // Stock deployments keep the original redirect for non-admins so a
  // user who reaches /app/admin (or /admin) by typing the URL is
  // sent back to the home page exactly as before. Deployments that
  // mount the public tour catalogue (VITE_DEMO_PUBLIC=1) drop the
  // redirect so the Admin tour can render the panel as a guided
  // preview for any visitor — server-side mutation guards still
  // reject every POST/PUT/PATCH/DELETE from a non-admin so the
  // viewable preview is genuinely read-only.
  const isDemoPublic = import.meta.env.VITE_DEMO_PUBLIC === '1'
  if (!isDemoPublic && !currentUser?.isAdmin) {
    return <Navigate to="/" replace />
  }
  // CRITICAL data-leak prevention: when DEMO_PUBLIC is on but the
  // visitor is NOT an authenticated admin, render an entirely static
  // mock panel instead of the real one. The previous behaviour
  // (dropping the redirect, keeping the real components) mounted
  // UserManagementPage / SessionManagementPage / PermissionsPage etc.,
  // each of which issued its own /api/admin/* fetch — and the DEMO_MODE
  // backend widened the read scope to make those fetches succeed, so a
  // demo visitor could see real admin usernames, real sessions, and
  // real role assignments on the production deployment. Mock panel
  // shares every data-tour-id anchor the Admin tour walks through so
  // the spotlight still lands on the right element. Real admins
  // signing in via /login fall through to the live AdminPanel below
  // because isDemoPublic + !isAdmin is the only branch this catches.
  if (isDemoPublic && !currentUser?.isAdmin) {
    return <DemoAdminPanel />
  }

  return (
    <div className="mx-auto max-w-screen-xl py-8 px-4" data-tour-id="admin-panel">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-1">
          Admin Panel
        </h1>
        <p className="text-muted-foreground">
          Manage users, groups, projects, video access, permissions, sessions, and system settings
        </p>
      </div>

      <div className="rounded-lg border bg-card w-full">
        <Tabs defaultValue="users">
          <TabsList className="w-full justify-start overflow-x-auto border-b rounded-none h-auto p-0">
            <TabsTrigger value="users" data-tour-id="admin-tab-users" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="groups" data-tour-id="admin-tab-groups" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Group className="h-4 w-4" />
              Groups
            </TabsTrigger>
            <TabsTrigger value="projects" data-tour-id="admin-tab-projects" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Folder className="h-4 w-4" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="video-access" data-tour-id="admin-tab-video-access" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Video className="h-4 w-4" />
              Video Access
            </TabsTrigger>
            <TabsTrigger value="permissions" data-tour-id="admin-tab-permissions" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Shield className="h-4 w-4" />
              Permissions
            </TabsTrigger>
            <TabsTrigger value="sessions" data-tour-id="admin-tab-sessions" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Lock className="h-4 w-4" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="models" data-tour-id="admin-tab-models" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Cpu className="h-4 w-4" />
              Models
            </TabsTrigger>
            <TabsTrigger value="system-config" data-tour-id="admin-tab-system-config" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Sliders className="h-4 w-4" />
              System Config
            </TabsTrigger>
            <TabsTrigger value="settings" data-tour-id="admin-tab-settings" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="py-6">
            <UserManagementPage />
          </TabsContent>

          <TabsContent value="groups" className="py-6">
            <GroupManagementPage />
          </TabsContent>

          <TabsContent value="projects" className="py-6">
            <ProjectManagementPage />
          </TabsContent>

          <TabsContent value="video-access" className="py-6">
            <VideoAssignmentPage />
          </TabsContent>

          <TabsContent value="permissions" className="py-6">
            <PermissionsPage />
          </TabsContent>

          <TabsContent value="sessions" className="py-6">
            <SessionManagementPage />
          </TabsContent>

          <TabsContent value="models" className="py-6">
            <ModelManagementPage />
          </TabsContent>

          <TabsContent value="system-config" className="py-6">
            <SystemConfigPanel />
          </TabsContent>

          <TabsContent value="settings" className="py-6">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">
                System Settings
              </h3>
              <p className="text-sm text-muted-foreground">
                Settings panel coming soon.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
