/**
 * Admin panel dialog component.
 * Provides tabs for user management, session management, and settings.
 */

import { Users, Lock, Settings, X } from 'lucide-react'
import { UserManagementPage } from '../admin/UserManagementPage'
import { SessionManagementPage } from '../admin/SessionManagementPage'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

/**
 * Props for AdminPanelDialog component.
 */
interface AdminPanelDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Admin panel dialog.
 * Displays user management, session management, and settings tabs.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @returns Admin panel dialog
 */
export default function AdminPanelDialog({ open, onClose }: AdminPanelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-6xl" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Admin Panel</DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="close"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="users">
          <TabsList variant="line" className="w-full justify-start border-b px-0">
            <TabsTrigger value="users">
              <Users className="size-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="sessions">
              <Lock className="size-4" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="size-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <div className="min-h-[500px]">
            <TabsContent value="users">
              <UserManagementPage />
            </TabsContent>

            <TabsContent value="sessions">
              <SessionManagementPage />
            </TabsContent>

            <TabsContent value="settings">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-2">System Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Settings panel coming soon.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
