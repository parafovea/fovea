/**
 * User settings dialog component.
 * Provides tabs for profile settings, API key management, and preferences.
 */

import { useState, useEffect } from 'react'
import { User, KeyRound, Settings, X } from 'lucide-react'
import { useAuthStore } from '@store/zustand/authStore'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import ProfileTab from './ProfileTab'
import ApiKeyManagementPanel from './ApiKeyManagementPanel'

/**
 * Props for UserSettingsDialog component.
 */
interface UserSettingsDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * User settings dialog.
 * Displays user profile, API keys, and preferences in tabs.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @returns User settings dialog
 */
export default function UserSettingsDialog({ open, onClose }: UserSettingsDialogProps) {
  const mode = useAuthStore(state => state.mode)
  const [activeTab, setActiveTab] = useState('profile')

  // Reset to Profile tab when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab('profile')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>User Settings</DialogTitle>
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line" className="w-full justify-start border-b px-0">
            <TabsTrigger value="profile">
              <User className="size-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="api-keys">
              <KeyRound className="size-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="preferences">
              <Settings className="size-4" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <div className="min-h-[400px]">
            <TabsContent value="profile" className="py-2">
              <ProfileTab showPasswordChange={mode === 'multi-user'} />
            </TabsContent>

            <TabsContent value="api-keys" className="py-2">
              <ApiKeyManagementPanel />
            </TabsContent>

            <TabsContent value="preferences" className="py-2">
              <div className="p-2">
                <p>Preferences settings coming soon.</p>
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
