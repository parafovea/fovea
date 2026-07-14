/**
 * A fully static, zero-fetch render of the admin panel for
 * VITE_DEMO_PUBLIC=1 visitors who are not signed-in admins.
 *
 * The live AdminPanel mounts UserManagementPage, SessionManagementPage,
 * PermissionsPage, GroupManagementPage, and so on, each of which issues
 * its own /api/admin/* fetch. Rendering it for a demo visitor would
 * expose real admin usernames, session rows, and role assignments, so
 * AdminPanel renders this component instead whenever DEMO_PUBLIC is on
 * and the visitor is not an authenticated admin. Every tab is a
 * hardcoded synthetic table that registers the same tour anchors the
 * Admin tour expects, so the tour walks through normally while no live
 * data is fetched or displayed.
 *
 * The synthetic content is deliberately schematic; fake names like
 * "Demo Operator" and "Test User" make it visually obvious that the
 * data is mocked.
 */

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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

const SYNTHETIC_USERS = [
  { id: 'demo-u1', name: 'Demo Operator', email: 'operator@demo.example', role: 'admin' },
  { id: 'demo-u2', name: 'Stadium Analyst', email: 'analyst@demo.example', role: 'user' },
  { id: 'demo-u3', name: 'Test User', email: 'tester@demo.example', role: 'user' },
]

const SYNTHETIC_GROUPS = [
  { id: 'demo-g1', name: 'Stadium operations team', members: 4 },
  { id: 'demo-g2', name: 'Maritime safety team', members: 2 },
]

const SYNTHETIC_PROJECTS = [
  { id: 'demo-p1', name: 'Phillies-Marlins incident review', videos: 3, members: 4 },
  { id: 'demo-p2', name: 'Port of Long Beach container audit', videos: 1, members: 2 },
]

const SYNTHETIC_VIDEO_RULES = [
  { id: 'demo-r1', name: 'Round-robin to Stadium ops', strategy: 'round-robin' },
  { id: 'demo-r2', name: 'Sticky by uploader', strategy: 'sticky-uploader' },
]

const SYNTHETIC_PERMISSIONS = [
  { role: 'admin', resource: 'User', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'admin', resource: 'Persona', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'admin', resource: 'Annotation', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'user', resource: 'Persona', actions: ['create', 'read', 'update'] },
  { role: 'user', resource: 'Annotation', actions: ['create', 'read', 'update'] },
  { role: 'user', resource: 'User', actions: ['read'] },
]

const SYNTHETIC_SESSIONS = [
  { id: 'demo-s1', user: 'Demo Operator', ipAddress: '10.0.0.12', expiresIn: '47 minutes' },
  { id: 'demo-s2', user: 'Stadium Analyst', ipAddress: '10.0.0.45', expiresIn: '2 hours' },
]

const SYNTHETIC_TASKS = [
  { task: 'object_detection', model: 'yolo-world', vramGb: 4.2, device: 'gpu' },
  { task: 'video_summarization', model: 'qwen2.5-vl-3b', vramGb: 6.1, device: 'gpu' },
  { task: 'speech_to_text', model: 'whisper-large-v3', vramGb: 3.0, device: 'gpu' },
  { task: 'object_tracking', model: 'sam2', vramGb: 5.4, device: 'gpu' },
]

const TOTAL_VRAM_GB = 24
const VRAM_USED = SYNTHETIC_TASKS.reduce((sum, t) => sum + t.vramGb, 0)
const VRAM_PCT = Math.min(100, Math.round((VRAM_USED / TOTAL_VRAM_GB) * 100))

export function DemoAdminPanel(): JSX.Element {
  const panelAnchor = useTourAnchor('admin-panel')
  const usersTabAnchor = useTourAnchor('admin-tab-users')
  const groupsTabAnchor = useTourAnchor('admin-tab-groups')
  const projectsTabAnchor = useTourAnchor('admin-tab-projects')
  const videoAccessTabAnchor = useTourAnchor('admin-tab-video-access')
  const permissionsTabAnchor = useTourAnchor('admin-tab-permissions')
  const sessionsTabAnchor = useTourAnchor('admin-tab-sessions')
  const modelsTabAnchor = useTourAnchor('admin-tab-models')
  const systemConfigTabAnchor = useTourAnchor('admin-tab-system-config')
  const settingsTabAnchor = useTourAnchor('admin-tab-settings')
  const permissionsPageAnchor = useTourAnchor('permissions-page')
  const modelPageAnchor = useTourAnchor('model-management-page')
  const modelMemoryAnchor = useTourAnchor('model-memory-validation')
  const systemConfigPanelAnchor = useTourAnchor('system-config-panel')
  const userManagementAnchor = useTourAnchor('user-management-page')
  const groupManagementAnchor = useTourAnchor('group-management-page')
  const videoAssignmentAnchor = useTourAnchor('project-video-assignment')
  const sessionManagementAnchor = useTourAnchor('session-management-page')
  return (
    <div className="mx-auto max-w-screen-xl py-8 px-4" ref={panelAnchor}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Admin Panel</h1>
        <p className="text-muted-foreground">
          Manage users, groups, projects, video access, permissions, sessions, and system settings
        </p>
        <p className="mt-3 text-xs text-muted-foreground italic">
          Demo preview. Every row below is synthetic — no live user or session data is being displayed.
        </p>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="users" ref={usersTabAnchor}>
            <Users className="size-4 mr-1" /> Users
          </TabsTrigger>
          <TabsTrigger value="groups" ref={groupsTabAnchor}>
            <Group className="size-4 mr-1" /> Groups
          </TabsTrigger>
          <TabsTrigger value="projects" ref={projectsTabAnchor}>
            <Folder className="size-4 mr-1" /> Projects
          </TabsTrigger>
          <TabsTrigger value="video-access" ref={videoAccessTabAnchor}>
            <Video className="size-4 mr-1" /> Video Access
          </TabsTrigger>
          <TabsTrigger value="permissions" ref={permissionsTabAnchor}>
            <Shield className="size-4 mr-1" /> Permissions
          </TabsTrigger>
          <TabsTrigger value="sessions" ref={sessionsTabAnchor}>
            <Lock className="size-4 mr-1" /> Sessions
          </TabsTrigger>
          <TabsTrigger value="models" ref={modelsTabAnchor}>
            <Cpu className="size-4 mr-1" /> Models
          </TabsTrigger>
          <TabsTrigger value="system-config" ref={systemConfigTabAnchor}>
            <Sliders className="size-4 mr-1" /> System Config
          </TabsTrigger>
          <TabsTrigger value="settings" ref={settingsTabAnchor}>
            <Settings className="size-4 mr-1" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="py-6">
          <Section
            anchorRef={userManagementAnchor}
            title="User management"
            description="Create accounts, assign roles, deactivate, or impersonate."
            rows={SYNTHETIC_USERS.map((u) => ({
              key: u.id,
              left: u.name,
              right: u.email,
              badge: u.role,
            }))}
          />
        </TabsContent>

        <TabsContent value="groups" className="py-6">
          <Section
            anchorRef={groupManagementAnchor}
            title="Groups"
            description="Reusable membership sets that gate project membership and video access."
            rows={SYNTHETIC_GROUPS.map((g) => ({
              key: g.id,
              left: g.name,
              right: `${g.members} members`,
            }))}
          />
        </TabsContent>

        <TabsContent value="projects" className="py-6">
          <Section
            title="Projects"
            description="Bundles of videos, personas, and members under one shared workspace."
            rows={SYNTHETIC_PROJECTS.map((p) => ({
              key: p.id,
              left: p.name,
              right: `${p.videos} videos · ${p.members} members`,
            }))}
          />
        </TabsContent>

        <TabsContent value="video-access" className="py-6">
          <Section
            anchorRef={videoAssignmentAnchor}
            title="Video assignment rules"
            description="Automatically route freshly-uploaded clips to specific annotators based on configurable strategies."
            rows={SYNTHETIC_VIDEO_RULES.map((r) => ({
              key: r.id,
              left: r.name,
              right: r.strategy,
            }))}
          />
        </TabsContent>

        <TabsContent value="permissions" className="py-6">
          <div className="p-6" ref={permissionsPageAnchor}>
            <div className="mb-6">
              <h3 className="text-lg font-semibold">Role permissions</h3>
              <p className="text-sm text-muted-foreground">
                Read-only view of the role-permission matrix. Each cell shows the actions a role can perform on a resource type.
              </p>
            </div>
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-semibold">Role</th>
                    <th className="text-left p-3 font-semibold">Resource</th>
                    <th className="text-left p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {SYNTHETIC_PERMISSIONS.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-3">
                        <Badge variant={row.role === 'admin' ? 'default' : 'outline'}>
                          {row.role}
                        </Badge>
                      </td>
                      <td className="p-3">{row.resource}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {row.actions.map((a) => (
                            <Badge key={a} variant="secondary">{a}</Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="py-6">
          <Section
            anchorRef={sessionManagementAnchor}
            title="Active sessions"
            description="Every active sign-in is listed here. Admins can force-logout from this view."
            rows={SYNTHETIC_SESSIONS.map((s) => ({
              key: s.id,
              left: s.user,
              right: `${s.ipAddress} · expires in ${s.expiresIn}`,
            }))}
          />
        </TabsContent>

        <TabsContent value="models" className="py-6">
          <div className="p-6" ref={modelPageAnchor}>
            <div className="mb-6">
              <h3 className="text-lg font-semibold">Model configuration</h3>
              <p className="text-sm text-muted-foreground">
                Select which detection / tracking / summarization / transcription model handles each task type. VRAM totals roll up across selected models.
              </p>
            </div>
            <div className="rounded-lg border mb-6">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-semibold">Task</th>
                    <th className="text-left p-3 font-semibold">Selected model</th>
                    <th className="text-left p-3 font-semibold">Device</th>
                    <th className="text-left p-3 font-semibold">VRAM (GB)</th>
                  </tr>
                </thead>
                <tbody>
                  {SYNTHETIC_TASKS.map((t) => (
                    <tr key={t.task} className="border-t">
                      <td className="p-3 font-mono text-xs">{t.task}</td>
                      <td className="p-3">{t.model}</td>
                      <td className="p-3">
                        <Badge variant={t.device === 'gpu' ? 'default' : 'outline'}>{t.device}</Badge>
                      </td>
                      <td className="p-3">{t.vramGb.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Card ref={modelMemoryAnchor}>
              <CardHeader>
                <CardTitle className="text-base">VRAM budget</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-2">
                  Selected models require {VRAM_USED.toFixed(1)} GB of {TOTAL_VRAM_GB} GB available
                </div>
                <div className="h-2 w-full rounded bg-muted overflow-hidden">
                  <div
                    className={`h-full ${VRAM_PCT >= 90 ? 'bg-destructive' : VRAM_PCT >= 80 ? 'bg-warning' : 'bg-primary'}`}
                    style={{ width: `${VRAM_PCT}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {VRAM_PCT}% utilization. The admin gets a hard error if a new selection would push past 100%.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="system-config" className="py-6">
          <div className="p-6" ref={systemConfigPanelAnchor}>
            <div className="mb-6">
              <h3 className="text-lg font-semibold">System configuration</h3>
              <p className="text-sm text-muted-foreground">
                Knobs the admin can turn without redeploying: feature flags, default routes, demo gates, storage paths, model-service endpoint overrides.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                { key: 'ALLOW_REGISTRATION', value: 'false', note: 'Public sign-up is closed' },
                { key: 'FOVEA_DEMO_MODE', value: 'true', note: 'Anonymous demo sessions allowed' },
                { key: 'DEFAULT_LANDING_PAGE', value: '/app/videos', note: 'After sign-in' },
                { key: 'MODEL_SERVICE_URL', value: 'http://model-service:8000', note: 'Inference gateway' },
              ].map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <div className="font-mono text-xs">{row.key}</div>
                    <div className="text-xs text-muted-foreground">{row.note}</div>
                  </div>
                  <Badge variant="secondary">{row.value}</Badge>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="py-6">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-2">Settings</h3>
            <p className="text-sm text-muted-foreground">
              Generic deployment knobs live here on a self-hosted Fovea. The synthetic preview keeps this tab intentionally sparse.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface SectionRow {
  key: string
  left: string
  right: string
  badge?: string
}

function Section({
  anchorRef,
  title,
  description,
  rows,
}: {
  anchorRef?: (element: HTMLElement | null) => void
  title: string
  description: string
  rows: SectionRow[]
}) {
  return (
    <div className="p-6" ref={anchorRef}>
      <div className="mb-6">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-lg border">
        {rows.map((row, i) => (
          <div
            key={row.key}
            className={`flex items-center justify-between p-3 ${i > 0 ? 'border-t' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="font-medium">{row.left}</div>
              {row.badge ? <Badge variant="outline">{row.badge}</Badge> : null}
            </div>
            <div className="text-sm text-muted-foreground">{row.right}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
