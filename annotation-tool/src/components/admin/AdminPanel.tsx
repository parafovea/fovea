/**
 * Admin panel component.
 * Provides tabs for user, group, project, video access, permissions, session, and settings management.
 * Only accessible to users with isAdmin flag set to true.
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
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAuthStore } from '@store/zustand/authStore'
import { UserManagementPage } from './UserManagementPage'
import { SessionManagementPage } from './SessionManagementPage'
import { GroupManagementPage } from './GroupManagementPage'
import { ProjectManagementPage } from './ProjectManagementPage'
import { VideoAssignmentPage } from './VideoAssignmentPage'
import { PermissionsPage } from './PermissionsPage'

/**
 * Admin panel component.
 * Displays tabs for users, groups, projects, video access, permissions, sessions, and settings.
 * Redirects non-admin users to home page.
 */
export function AdminPanel(): JSX.Element {
  const currentUser = useAuthStore(state => state.currentUser)

  // Redirect if not admin
  if (!currentUser?.isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="mx-auto max-w-screen-xl py-8 px-4">
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
            <TabsTrigger value="users" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Group className="h-4 w-4" />
              Groups
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Folder className="h-4 w-4" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="video-access" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Video className="h-4 w-4" />
              Video Access
            </TabsTrigger>
            <TabsTrigger value="permissions" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Shield className="h-4 w-4" />
              Permissions
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Lock className="h-4 w-4" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
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
