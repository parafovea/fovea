/**
 * Model settings dialog component.
 * Provides tabs for model configuration and status monitoring.
 */

import { useState } from 'react'
import { Settings, LayoutDashboard, X } from 'lucide-react'
import { ModelSettingsPanel } from '@components/model/ModelSettingsPanel'
import { ModelStatusDashboard } from '@components/model/ModelStatusDashboard'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * Props for ModelSettingsDialog component.
 */
interface ModelSettingsDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Model settings dialog.
 * Displays model configuration and status monitoring in tabs.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @returns Model settings dialog
 */
export default function ModelSettingsDialog({ open, onClose }: ModelSettingsDialogProps) {
  const [notification, setNotification] = useState<{
    message: string
    severity: 'success' | 'error'
  } | null>(null)

  /**
   * Resets dialog state on close.
   */
  const handleClose = () => {
    setNotification(null)
    onClose()
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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <DialogContent className="sm:max-w-4xl" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Model Settings</DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="close"
              onClick={handleClose}
            >
              <X />
            </Button>
          </div>
        </DialogHeader>

        {notification && (
          <Alert variant={notification.severity === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{notification.message}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="configuration" onValueChange={() => setNotification(null)}>
          <TabsList variant="line" className="w-full justify-start border-b px-0">
            <TabsTrigger value="configuration">
              <Settings className="size-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="status">
              <LayoutDashboard className="size-4" />
              Status
            </TabsTrigger>
          </TabsList>

          <div className="min-h-[500px]">
            <TabsContent value="configuration" className="py-2">
              <ModelSettingsPanel
                onSaveSuccess={handleSaveSuccess}
                onSaveError={handleSaveError}
              />
            </TabsContent>

            <TabsContent value="status" className="py-2">
              <ModelStatusDashboard
                refreshInterval={15000}
                showRefreshButton={true}
                showAutoRefreshToggle={true}
              />
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
