/**
 * Settings page component with tabbed interface for application configuration.
 * Provides access to model configuration, status monitoring, and application information.
 */

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Settings as SettingsIcon, LayoutDashboard, Info, Sliders, Shield } from 'lucide-react'
import { Alert, AlertDescription, AlertAction } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SystemConfigPanel } from '@/components/admin/SystemConfigPanel'
import { useCurrentUser } from '@/hooks/auth/useCurrentUser'
import { InferenceSettingsPanel } from '@components/model/InferenceSettingsPanel'
import { ModelSettingsPanel } from '@components/model/ModelSettingsPanel'
import { ModelStatusDashboard } from '@components/model/ModelStatusDashboard'

/**
 * Settings page component with tabbed interface.
 * Provides configuration panels for models, status monitoring, and application information.
 *
 * Tabs:
 * - Models: Configure model selection per task type with VRAM budget visualization
 * - Status: Monitor loaded models with real-time VRAM usage and performance metrics
 * - About: Application version, documentation links, and system information
 *
 * @returns Settings page component
 *
 * @example
 * ```tsx
 * // In App.tsx routing
 * <Route path="settings" element={<Settings />} />
 * ```
 */
export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAdmin } = useCurrentUser()
  type TabName = 'models' | 'inference' | 'status' | 'system' | 'about'
  const tabNames: readonly TabName[] = useMemo(
    () =>
      isAdmin
        ? (['models', 'inference', 'status', 'system', 'about'] as const)
        : (['models', 'inference', 'status', 'about'] as const),
    [isAdmin]
  )
  const [activeTab, setActiveTab] = useState<TabName>('models')
  const [notification, setNotification] = useState<{
    message: string
    severity: 'success' | 'error'
  } | null>(null)

  // Initialize tab from URL parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && tabNames.includes(tabParam as TabName)) {
      setActiveTab(tabParam as TabName)
    }
  }, [searchParams, tabNames])

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabName)
    setNotification(null)
    setSearchParams({ tab: value })
  }

  const handleSaveSuccess = () => {
    setNotification({
      message: 'Model configuration saved successfully',
      severity: 'success',
    })
  }

  const handleSaveError = (error: string) => {
    setNotification({
      message: error,
      severity: 'error',
    })
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure model selection, monitor system status, and manage application preferences.
        </p>
      </div>

      {notification && (
        <Alert
          variant={notification.severity === 'error' ? 'destructive' : 'default'}
          className="mb-4"
        >
          <AlertDescription>{notification.message}</AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="icon-sm" onClick={() => setNotification(null)}>
              &times;
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div className="rounded-xl border bg-card">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList variant="line" className="w-full justify-start border-b px-4">
            <TabsTrigger value="models">
              <SettingsIcon className="size-4" />
              Models
            </TabsTrigger>
            <TabsTrigger value="inference">
              <Sliders className="size-4" />
              Inference
            </TabsTrigger>
            <TabsTrigger value="status">
              <LayoutDashboard className="size-4" />
              Status
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="system">
                <Shield className="size-4" />
                System
              </TabsTrigger>
            )}
            <TabsTrigger value="about">
              <Info className="size-4" />
              About
            </TabsTrigger>
          </TabsList>

          <div className="p-6">
            <TabsContent value="models">
              <ModelSettingsPanel
                onSaveSuccess={handleSaveSuccess}
                onSaveError={handleSaveError}
              />
            </TabsContent>

            <TabsContent value="inference">
              <InferenceSettingsPanel />
            </TabsContent>

            <TabsContent value="status">
              <ModelStatusDashboard
                refreshInterval={15000}
                showRefreshButton={true}
                showAutoRefreshToggle={true}
              />
            </TabsContent>

            {isAdmin && (
              <TabsContent value="system">
                <SystemConfigPanel />
              </TabsContent>
            )}

            <TabsContent value="about">
              <div>
                <h2 className="mb-2 text-xl font-semibold">About FOVEA</h2>
                <p className="mb-4">
                  FOVEA (Flexible Ontology Visual Event Analyzer) is a web-based video annotation tool designed for tactically-oriented analysts developing annotation ontologies.
                </p>
                <p className="mb-4 text-sm text-muted-foreground">
                  FOVEA uses a persona-based approach where different analysts can assign different semantic types to the same real-world objects, enabling collaborative ontology development with multiple perspectives. The tool maintains a clean separation between type definitions (EntityType, EventType, RoleType) and actual world instances (Entity, Event, Location), supporting rich temporal modeling, spatial relationships, and semantic collections.
                </p>

                <Separator className="my-6" />

                <h3 className="mb-2 text-lg font-semibold">Key Features</h3>
                <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
                  <li>
                    <strong>Persona-Based Ontologies:</strong> Multiple analysts maintain their own type systems and interpretations
                  </li>
                  <li>
                    <strong>World Model:</strong> Shared instances of entities, events, locations, and temporal objects
                  </li>
                  <li>
                    <strong>Rich Temporal Model:</strong> Support for vague times, deictic references, and temporal patterns
                  </li>
                  <li>
                    <strong>Wikidata Integration:</strong> Auto-populate entities and locations from Wikidata
                  </li>
                  <li>
                    <strong>Interactive Mapping:</strong> Leaflet-based location visualization and selection
                  </li>
                </ul>

                <Separator className="my-6" />

                <h3 className="mb-2 text-lg font-semibold">AI-Powered Analysis</h3>
                <p className="mb-2 text-sm">
                  FOVEA integrates with a GPU-accelerated model service for automated video analysis:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
                  <li>
                    <strong>Video Summarization:</strong> Generate persona-specific narrative summaries using vision-language models
                  </li>
                  <li>
                    <strong>Object Detection:</strong> Detect and localize objects with customizable queries
                  </li>
                  <li>
                    <strong>Video Tracking:</strong> Track objects across multiple frames with motion-aware segmentation
                  </li>
                  <li>
                    <strong>Ontology Augmentation:</strong> AI-assisted expansion of type definitions
                  </li>
                </ul>
                <p className="mt-2 text-sm text-muted-foreground">
                  Configure models in the Models tab and monitor performance in the Status tab.
                </p>

                <Separator className="my-6" />

                <h3 className="mb-2 text-lg font-semibold">Technology Stack</h3>
                <p className="text-sm">Frontend: React 18 + TypeScript + Vite + shadcn/ui + Zustand</p>
                <p className="text-sm">Backend: Node.js + Fastify + TypeScript</p>
                <p className="text-sm">Model Service: Python + FastAPI + PyTorch + Transformers</p>
                <p className="text-sm">Video Player: video.js v8 with custom annotation overlay</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
