/**
 * About dialog component.
 * Displays information about the FOVEA application.
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Divider,
  IconButton,
  Grid,
  Chip,
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'

/**
 * Props for AboutDialog component.
 */
interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * About dialog.
 * Displays application information, features, and technology stack.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @returns About dialog
 */
export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            About FOVEA
            <Chip label="v0.1.0" size="small" sx={{ ml: 2 }} />
          </Box>
          <IconButton
            aria-label="close"
            onClick={onClose}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          FOVEA (Flexible Ontology Visual Event Analyzer) is a web-based video annotation tool for tactically-oriented analysts. It uses a persona-based approach where multiple analysts can assign different semantic types to the same real-world objects, enabling collaborative ontology development with multiple perspectives.
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Grid container spacing={3}>
          <Grid item xs={6}>
            <Typography variant="subtitle2" gutterBottom>
              Core Features
            </Typography>
            <Box component="ul" sx={{ pl: 2, m: 0, fontSize: '0.875rem' }}>
              <li>Persona-based ontologies</li>
              <li>Shared world model (entities, events, locations)</li>
              <li>Rich temporal modeling</li>
              <li>Spatial bounding boxes with keyframe interpolation</li>
              <li>Wikidata integration</li>
              <li>Interactive map-based location selection</li>
              <li>Import/export with conflict resolution</li>
            </Box>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="subtitle2" gutterBottom>
              AI-Powered Analysis
            </Typography>
            <Box component="ul" sx={{ pl: 2, m: 0, fontSize: '0.875rem' }}>
              <li>Video summarization with audio transcription</li>
              <li>Speaker diarization</li>
              <li>Object detection (YOLO, GroundingDINO)</li>
              <li>Multi-object tracking (ByteTrack, BoT-SORT)</li>
              <li>Ontology augmentation</li>
              <li>GPU-accelerated inference</li>
            </Box>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="subtitle2" gutterBottom>
              Annotation Tools
            </Typography>
            <Box component="ul" sx={{ pl: 2, m: 0, fontSize: '0.875rem' }}>
              <li>Keyframe-based bounding boxes</li>
              <li>Multiple interpolation modes</li>
              <li>Visibility toggling</li>
              <li>Ghost box visualization</li>
              <li>Timeline-based editing</li>
              <li>Keyboard shortcuts</li>
            </Box>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="subtitle2" gutterBottom>
              Technology Stack
            </Typography>
            <Box component="ul" sx={{ pl: 2, m: 0, fontSize: '0.875rem' }}>
              <li>React 18 + TypeScript + Vite</li>
              <li>Material-UI v5 + Redux Toolkit</li>
              <li>Node.js + Fastify + PostgreSQL</li>
              <li>Python + FastAPI + PyTorch</li>
              <li>video.js v8 + Leaflet</li>
            </Box>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
