/**
 * Model settings dialog component.
 * Provides tabs for model configuration and status monitoring.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Box,
  IconButton,
  Alert,
} from '@mui/material'
import {
  Settings as SettingsIcon,
  Dashboard as DashboardIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import { ModelSettingsPanel } from '../ModelSettingsPanel.js'
import { ModelStatusDashboard } from '../ModelStatusDashboard.js'

/**
 * Tab panel component.
 * Displays content for the selected tab.
 *
 * @param children - Tab content
 * @param value - Current tab value
 * @param index - Tab index
 * @returns Tab panel content
 */
interface TabPanelProps {
  children?: React.ReactNode
  value: number
  index: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  )
}

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
  const [currentTab, setCurrentTab] = useState(0)
  const [notification, setNotification] = useState<{
    message: string
    severity: 'success' | 'error'
  } | null>(null)

  /**
   * Handles tab change.
   *
   * @param _ - Change event (unused)
   * @param newValue - New tab index
   */
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue)
    setNotification(null)
  }

  /**
   * Resets dialog state on close.
   */
  const handleClose = () => {
    setCurrentTab(0)
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
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Model Settings
          <IconButton
            aria-label="close"
            onClick={handleClose}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      {notification && (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert
            severity={notification.severity}
            onClose={() => setNotification(null)}
          >
            {notification.message}
          </Alert>
        </Box>
      )}

      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        aria-label="model settings tabs"
        sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}
      >
        <Tab
          icon={<SettingsIcon />}
          iconPosition="start"
          label="Configuration"
          id="model-settings-tab-0"
          aria-controls="model-settings-tabpanel-0"
        />
        <Tab
          icon={<DashboardIcon />}
          iconPosition="start"
          label="Status"
          id="model-settings-tab-1"
          aria-controls="model-settings-tabpanel-1"
        />
      </Tabs>

      <DialogContent sx={{ minHeight: 500 }}>
        <TabPanel value={currentTab} index={0}>
          <ModelSettingsPanel
            onSaveSuccess={handleSaveSuccess}
            onSaveError={handleSaveError}
          />
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          <ModelStatusDashboard
            refreshInterval={15000}
            showRefreshButton={true}
            showAutoRefreshToggle={true}
          />
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
