import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'
import VideoSummaryEditor from './VideoSummaryEditor'
import { useSelector } from 'react-redux'
import { RootState } from '../store/store'

interface VideoSummaryDialogProps {
  open: boolean
  onClose: () => void
  videoId: string
  initialPersonaId: string | null
}

export default function VideoSummaryDialog({
  open,
  onClose,
  videoId,
  initialPersonaId,
}: VideoSummaryDialogProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(initialPersonaId)
  const personas = useSelector((state: RootState) => state.persona.personas)

  // Update selected persona when initial persona changes (e.g., when dialog opens)
  useEffect(() => {
    if (open) {
      setSelectedPersonaId(initialPersonaId)
    }
  }, [open, initialPersonaId])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '60vh',
          maxHeight: '80vh',
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Edit Video Summary</Typography>
        <Button
          onClick={onClose}
          startIcon={<CloseIcon />}
          size="small"
          color="inherit"
        >
          Close
        </Button>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="summary-persona-select-label">Select Persona</InputLabel>
            <Select
              labelId="summary-persona-select-label"
              id="summary-persona-select"
              value={selectedPersonaId || ''}
              label="Select Persona"
              onChange={(e) => setSelectedPersonaId(e.target.value || null)}
            >
              <MenuItem value="" disabled>
                <em>Select a persona to create a summary</em>
              </MenuItem>
              {personas.map((persona) => (
                <MenuItem key={persona.id} value={persona.id}>
                  {persona.name} - {persona.role}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          {selectedPersonaId && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Creating summary from {personas.find(p => p.id === selectedPersonaId)?.name}'s perspective
            </Typography>
          )}
        </Box>

        {selectedPersonaId && videoId && (
          <VideoSummaryEditor
            videoId={videoId}
            personaId={selectedPersonaId}
            disabled={!selectedPersonaId}
          />
        )}
        
        {!selectedPersonaId && (
          <Box sx={{ 
            p: 4, 
            textAlign: 'center', 
            bgcolor: 'grey.50',
            borderRadius: 1,
            border: '1px dashed',
            borderColor: 'grey.300'
          }}>
            <Typography variant="body1" color="text.secondary">
              Please select a persona above to create or edit a video summary
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  )
}