import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Video,
  Fingerprint,
  Globe,
  Users,
  Folder,
  Share2,
  Save,
  Download,
  Upload,
  Keyboard,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import logo from '@/assets/fovea-logo.svg'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar'

import { usePersonas, useAllPersonaOntologies, useWorld } from '@store/queries'
import { useMyProjects } from '@store/queries/useProjects'
import { useVideoUiStore } from '@store/zustand/videoUiStore'
import { useProjectContextStore } from '@store/zustand/projectContextStore'
import { useClaimsUiStore } from '@store/zustand/claimsUiStore'
import { useDialog } from '@store/zustand/dialogStore'
import { api } from '@services/api'
import { Ontology } from '@models/types'
import { useCommands, useCommandContext } from '@hooks/commands'
import { KeyboardShortcutsDialog } from '@components/shared/KeyboardShortcutsDialog'
import { BreadcrumbNavigation } from '@components/shared/BreadcrumbNavigation'
import { ImportDataDialog } from '@components/data-management/ImportDataDialog'
import { ExportDialog } from '@components/data-management/ExportDialog'
import { UserMenu } from '@components/auth/UserMenu'
import UserSettingsDialog from '@components/settings/UserSettingsDialog'
import ModelSettingsDialog from '@components/settings/ModelSettingsDialog'
import AboutDialog from '@components/settings/AboutDialog'
import AdminPanelDialog from '@components/settings/AdminPanelDialog'

const menuItems = [
  { text: 'Video Browser', icon: Video, path: '/', shortcut: 'Cmd/Ctrl+1' },
  { text: 'Persona Builder', icon: Fingerprint, path: '/ontology', shortcut: 'Cmd/Ctrl+2' },
  { text: 'World Builder', icon: Globe, path: '/objects', shortcut: 'Cmd/Ctrl+3' },
]

const collaborationItems = [
  { text: 'My Groups', icon: Users, path: '/groups' },
  { text: 'My Projects', icon: Folder, path: '/projects' },
  { text: 'Shared', icon: Share2, path: '/shared' },
]

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  // Use Zustand dialogStore for dialog state management
  const exportDialog = useDialog('export')
  const importDialog = useDialog('import')
  const shortcutsDialog = useDialog('keyboardShortcuts')
  const userSettingsDialog = useDialog('userSettings')
  const modelSettingsDialog = useDialog('modelSettings')
  const aboutDialog = useDialog('about')
  const adminPanelDialog = useDialog('adminPanel')

  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const personaIds = personas.map(p => p.id)
  const { data: personaOntologies = [] } = useAllPersonaOntologies(personaIds)
  const { data: world } = useWorld()

  // Zustand stores
  const lastAnnotation = useVideoUiStore((state) => state.lastAnnotation)
  const activeProjectId = useProjectContextStore(state => state.activeProjectId)
  const activeProjectRole = useProjectContextStore(state => state.activeProjectRole)
  const setActiveProject = useProjectContextStore(state => state.setActiveProject)
  const clearProject = useProjectContextStore(state => state.clearProject)
  const draftClaim = useClaimsUiStore((state) => state.draftClaim)
  const clearDraftClaim = useClaimsUiStore((state) => state.clearDraftClaim)

  // Project context selector data
  const { data: myProjects = [] } = useMyProjects()

  const handleProjectChange = useCallback((value: string | null) => {
    if (!value || value === '') {
      clearProject()
    } else {
      const project = myProjects.find(p => p.id === value)
      if (project) {
        setActiveProject(project.id, project.name, project.myRole ?? 'member')
      }
    }
  }, [myProjects, setActiveProject, clearProject])

  // Note: unsavedChanges is no longer tracked; TanStack Query handles mutation state
  const unsavedChanges = false

  // Use ref to avoid stale closure in keyboard shortcut handlers
  const lastAnnotationRef = useRef(lastAnnotation)
  useEffect(() => {
    lastAnnotationRef.current = lastAnnotation
  }, [lastAnnotation])

  // Track the path we came from when toggling to each builder (separate refs for independent toggles)
  const ontologyReturnPathRef = useRef<string | null>(null)
  const objectsReturnPathRef = useRef<string | null>(null)
  const lastVideoPathRef = useRef<string | null>(null)

  // Track the last active video annotation path
  useEffect(() => {
    if (location.pathname.startsWith('/annotate/')) {
      lastVideoPathRef.current = location.pathname
    }
  }, [location.pathname])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const ontology: Ontology = {
        id: `ont_${Date.now()}`,
        version: '1.0.0',
        personas,
        personaOntologies,
        world: {
          entities: world?.entities || [],
          events: world?.events || [],
          times: world?.times || [],
          entityCollections: world?.entityCollections || [],
          eventCollections: world?.eventCollections || [],
          timeCollections: world?.timeCollections || [],
          relations: world?.relations || [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await api.saveOntology(ontology)
      toast.success('Data saved successfully')
    } catch (error) {
      console.error('Failed to save data:', error)
      toast.error('Failed to save data')
    } finally {
      setSaving(false)
    }
  }, [personas, personaOntologies, world])

  const handleExport = useCallback(() => {
    exportDialog.openDialog()
  }, [exportDialog])

  // Setup global keyboard shortcuts
  const getCurrentContext = () => {
    if (location.pathname === '/') return 'videoBrowser'
    if (location.pathname === '/ontology') return 'ontologyWorkspace'
    if (location.pathname === '/objects') return 'objectWorkspace'
    return undefined
  }

  // Set command context for global shortcuts
  // Note: ontologyWorkspaceActive and personaBrowserActive are managed ONLY by OntologyWorkspace
  // We don't set them here to avoid parent effect overriding child effect
  useCommandContext({
    videoBrowserActive: location.pathname === '/',
    objectWorkspaceActive: location.pathname === '/objects',
    annotationWorkspaceActive: location.pathname.startsWith('/annotate'),
    dialogOpen: shortcutsDialog.open || exportDialog.open || importDialog.open || userSettingsDialog.open || modelSettingsDialog.open || aboutDialog.open,
    inputFocused: false, // Updated dynamically by App.tsx
  })

  useCommands({
    'navigate.videoBrowser': () => navigate('/'),
    'navigate.ontologyBuilder': () => navigate('/ontology'),
    'navigate.objectBuilder': () => navigate('/objects'),
    'navigate.toggleOntology': () => {
      const currentPath = window.location.pathname
      // If we're in the persona builder, go back to where we came from
      if (currentPath === '/ontology') {
        const returnPath = ontologyReturnPathRef.current || '/'
        ontologyReturnPathRef.current = null
        navigate(returnPath)
      }
      // Otherwise, store current path and go to persona builder
      else {
        ontologyReturnPathRef.current = currentPath
        navigate('/ontology')
      }
    },
    'navigate.toggleWorld': () => {
      const currentPath = window.location.pathname
      // If we're in the object builder, go back to where we came from
      if (currentPath === '/objects') {
        const returnPath = objectsReturnPathRef.current || '/'
        objectsReturnPathRef.current = null
        navigate(returnPath)
      }
      // Otherwise, store current path and go to object builder
      else {
        objectsReturnPathRef.current = currentPath
        navigate('/objects')
      }
    },
    'navigate.toggleVideo': () => {
      if (lastVideoPathRef.current) {
        navigate(lastVideoPathRef.current)
      }
    },
    'file.save': () => {
      if (!saving) {
        handleSave()
      }
    },
    'file.export': () => handleExport(),
    'help.show': () => shortcutsDialog.openDialog(),
  })

  return (
    <SidebarProvider defaultOpen data-tour-id="app-shell">
      <Sidebar collapsible="icon" side="left" data-tour-id="app-sidebar">
        <SidebarHeader className="p-3">
          <Link to="/" className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <img src={logo} alt="FOVEA Logo" className="h-8 w-8 shrink-0" />
            <span className="font-bold tracking-wide text-lg group-data-[collapsible=icon]:hidden">FOVEA</span>
          </Link>
        </SidebarHeader>
        <Separator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton isActive={location.pathname === item.path} tooltip={item.text} render={<Link to={item.path} />}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.text}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <Separator />
          <SidebarGroup>
            <SidebarGroupLabel>Collaboration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {collaborationItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton isActive={location.pathname.startsWith(item.path)} tooltip={item.text} render={<Link to={item.path} />}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.text}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-50 flex h-14 items-center gap-2 border-b bg-background px-4 overflow-hidden">
          <SidebarTrigger className="-ml-1 shrink-0" />
          <Separator orientation="vertical" className="h-4 shrink-0" />
          <BreadcrumbNavigation />

          <div className="ml-auto flex items-center gap-1 shrink-0">
            {/* Project Context Selector */}
            <Select
              value={activeProjectId ?? ''}
              onValueChange={handleProjectChange}
            >
              <SelectTrigger className="h-8 w-[180px] text-sm" aria-label="Project context">
                <SelectValue placeholder="Personal Workspace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Personal Workspace</SelectItem>
                {myProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeProjectRole && (
              <Badge variant="outline" className="text-xs">
                {activeProjectRole}
              </Badge>
            )}
            {draftClaim && (
              <Badge
                variant="outline"
                className="cursor-pointer border-amber-500 text-amber-600"
                onClick={() => navigate(`/annotate/${draftClaim.videoId}`)}
              >
                Draft Claim
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearDraftClaim()
                  }}
                  className="ml-1 rounded-full hover:bg-muted p-0.5"
                  aria-label="Discard draft claim"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {unsavedChanges && (
              <span className="text-sm text-muted-foreground">
                Unsaved changes
              </span>
            )}
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                  />
                }
              >
                {saving ? <Spinner className="mr-1.5 h-4 w-4" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save
              </TooltipTrigger>
              <TooltipContent>Save (Cmd/Ctrl+S)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExport}
                  />
                }
              >
                <Download className="mr-1.5 h-4 w-4" />
                Export
              </TooltipTrigger>
              <TooltipContent>Export (Cmd/Ctrl+E)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={importDialog.openDialog}
                  />
                }
              >
                <Upload className="mr-1.5 h-4 w-4" />
                Import
              </TooltipTrigger>
              <TooltipContent>Import Data</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={shortcutsDialog.openDialog}
                    aria-label="Keyboard Shortcuts (?)"
                  />
                }
              >
                <Keyboard className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Keyboard Shortcuts (?)</TooltipContent>
            </Tooltip>
            <UserMenu
              onSettingsClick={userSettingsDialog.openDialog}
              onModelSettingsClick={modelSettingsDialog.openDialog}
              onAboutClick={aboutDialog.openDialog}
              onAdminPanelClick={adminPanelDialog.openDialog}
            />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3">
          <Outlet />
        </div>
      </SidebarInset>

      <KeyboardShortcutsDialog
        open={shortcutsDialog.open}
        onClose={shortcutsDialog.close}
        currentContext={getCurrentContext()}
      />

      <ImportDataDialog
        open={importDialog.open}
        onClose={importDialog.close}
        onImportComplete={(result) => {
          console.log('Import completed:', result)
          toast.success(`Import successful: ${result.summary.importedItems.annotations} annotations imported`)
        }}
      />

      <ExportDialog
        open={exportDialog.open}
        onClose={exportDialog.close}
      />

      <UserSettingsDialog
        open={userSettingsDialog.open}
        onClose={userSettingsDialog.close}
      />

      <ModelSettingsDialog
        open={modelSettingsDialog.open}
        onClose={modelSettingsDialog.close}
      />

      <AboutDialog
        open={aboutDialog.open}
        onClose={aboutDialog.close}
      />

      <AdminPanelDialog
        open={adminPanelDialog.open}
        onClose={adminPanelDialog.close}
      />
    </SidebarProvider>
  )
}
