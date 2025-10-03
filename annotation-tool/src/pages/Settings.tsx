/**
 * Settings page component with tabbed interface for application configuration.
 * Provides access to model configuration, status monitoring, and application information.
 */

import { useState } from 'react'
import {
  Box,
  Container,
  Paper,
  Tabs,
  Tab,
  Typography,
  Divider,
  Alert,
  Link,
} from '@mui/material'
import {
  Settings as SettingsIcon,
  Dashboard as DashboardIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { ModelSettingsPanel } from '../components/ModelSettingsPanel'
import { ModelStatusDashboard } from '../components/ModelStatusDashboard'

/**
 * Tab panel component for Settings page.
 * Conditionally renders children based on active tab index.
 *
 * @param props - Component properties
 * @returns TabPanel component
 */
interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  )
}

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
  const [activeTab, setActiveTab] = useState(0)
  const [notification, setNotification] = useState<{
    message: string
    severity: 'success' | 'error'
  } | null>(null)

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
    setNotification(null)
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
    <Container maxWidth="xl">
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Configure model selection, monitor system status, and manage application preferences.
        </Typography>
      </Box>

      {notification && (
        <Alert
          severity={notification.severity}
          onClose={() => setNotification(null)}
          sx={{ mb: 2 }}
        >
          {notification.message}
        </Alert>
      )}

      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="settings tabs"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            icon={<SettingsIcon />}
            label="Models"
            id="settings-tab-0"
            aria-controls="settings-tabpanel-0"
            iconPosition="start"
          />
          <Tab
            icon={<DashboardIcon />}
            label="Status"
            id="settings-tab-1"
            aria-controls="settings-tabpanel-1"
            iconPosition="start"
          />
          <Tab
            icon={<InfoIcon />}
            label="About"
            id="settings-tab-2"
            aria-controls="settings-tabpanel-2"
            iconPosition="start"
          />
        </Tabs>

        <Box sx={{ p: 3 }}>
          <TabPanel value={activeTab} index={0}>
            <ModelSettingsPanel
              onSaveSuccess={handleSaveSuccess}
              onSaveError={handleSaveError}
            />
          </TabPanel>

          <TabPanel value={activeTab} index={1}>
            <ModelStatusDashboard
              refreshInterval={15000}
              showRefreshButton={true}
              showAutoRefreshToggle={true}
            />
          </TabPanel>

          <TabPanel value={activeTab} index={2}>
            <Box>
              <Typography variant="h5" gutterBottom>
                About FOVEA
              </Typography>
              <Typography variant="body1" paragraph>
                FOVEA (Frame-Oriented Video Event Annotator) is a video annotation tool for developing annotation ontologies.
              </Typography>

              <Divider sx={{ my: 3 }} />

              <Typography variant="h6" gutterBottom>
                Model Service Features
              </Typography>
              <Typography variant="body2" paragraph>
                This application integrates with an AI model service for automated video analysis:
              </Typography>
              <Box component="ul" sx={{ pl: 3, mt: 1 }}>
                <Typography component="li" variant="body2">
                  Video Summarization: Generate narrative summaries using vision language models
                </Typography>
                <Typography component="li" variant="body2">
                  Object Detection: Detect and localize objects in video frames
                </Typography>
                <Typography component="li" variant="body2">
                  Video Tracking: Track objects across multiple frames
                </Typography>
              </Box>

              <Divider sx={{ my: 3 }} />

              <Typography variant="h6" gutterBottom>
                Documentation
              </Typography>
              <Box component="ul" sx={{ pl: 3, mt: 1 }}>
                <Typography component="li" variant="body2">
                  <Link href="https://github.com/anthropics/claude-code" target="_blank" rel="noopener">
                    Claude Code Documentation
                  </Link>
                </Typography>
                <Typography component="li" variant="body2">
                  Use the Models tab to configure which models are loaded for each task
                </Typography>
                <Typography component="li" variant="body2">
                  Use the Status tab to monitor VRAM usage and model performance
                </Typography>
              </Box>

              <Divider sx={{ my: 3 }} />

              <Typography variant="h6" gutterBottom>
                System Information
              </Typography>
              <Typography variant="body2">
                Frontend: React + TypeScript + Vite
              </Typography>
              <Typography variant="body2">
                Backend: Node.js + Fastify
              </Typography>
              <Typography variant="body2">
                Model Service: Python + FastAPI
              </Typography>
            </Box>
          </TabPanel>
        </Box>
      </Paper>
    </Container>
  )
}
