import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material'
import { AppDispatch, RootState } from '../store/store'
import { updateAnnotation } from '../store/annotationSlice'
import { Annotation } from '../models/types'

interface AnnotationEditorProps {
  open: boolean
  onClose: () => void
  annotation: Annotation | null
  videoFps?: number
}

export default function AnnotationEditor({ 
  open, 
  onClose, 
  annotation,
  videoFps = 30 
}: AnnotationEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  
  // Get the persona and its ontology for this annotation
  const persona = useSelector((state: RootState) => {
    if (!annotation?.personaId) return null
    return state.persona.personas.find(p => p.id === annotation.personaId)
  })
  const personaOntology = useSelector((state: RootState) => {
    if (!annotation?.personaId) return null
    return state.persona.personaOntologies[annotation.personaId]
  })
  
  const [formData, setFormData] = useState({
    typeCategory: 'entity' as 'entity' | 'role' | 'event',
    typeId: '',
    startTime: 0,
    endTime: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    notes: '',
  })

  useEffect(() => {
    if (annotation) {
      setFormData({
        typeCategory: annotation.typeCategory,
        typeId: annotation.typeId,
        startTime: annotation.timeSpan.startTime,
        endTime: annotation.timeSpan.endTime,
        x: annotation.boundingBox.x,
        y: annotation.boundingBox.y,
        width: annotation.boundingBox.width,
        height: annotation.boundingBox.height,
        notes: annotation.notes || '',
      })
    }
  }, [annotation])

  const handleSave = () => {
    if (!annotation) return

    const updatedAnnotation: Annotation = {
      ...annotation,
      typeCategory: formData.typeCategory,
      typeId: formData.typeId,
      timeSpan: {
        startTime: formData.startTime,
        endTime: formData.endTime,
        startFrame: Math.floor(formData.startTime * videoFps),
        endFrame: Math.floor(formData.endTime * videoFps),
      },
      boundingBox: {
        x: formData.x,
        y: formData.y,
        width: formData.width,
        height: formData.height,
        frameNumber: Math.floor(formData.startTime * videoFps),
      },
      notes: formData.notes,
      updatedAt: new Date().toISOString(),
    }

    dispatch(updateAnnotation(updatedAnnotation))
    onClose()
  }

  const getAvailableTypes = () => {
    if (!personaOntology) return []
    
    switch (formData.typeCategory) {
      case 'entity':
        return personaOntology.entities.map(e => ({ id: e.id, name: e.name }))
      case 'role':
        return personaOntology.roles.map(r => ({ id: r.id, name: r.name }))
      case 'event':
        return personaOntology.events.map(e => ({ id: e.id, name: e.name }))
      default:
        return []
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit Annotation {persona && `(${persona.name})`}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Type Category</InputLabel>
                <Select
                  value={formData.typeCategory}
                  label="Type Category"
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    typeCategory: e.target.value as 'entity' | 'role' | 'event',
                    typeId: '' // Reset type when category changes
                  })}
                >
                  <MenuItem value="entity">Entity</MenuItem>
                  <MenuItem value="role">Role</MenuItem>
                  <MenuItem value="event">Event</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={formData.typeId}
                  label="Type"
                  onChange={(e) => setFormData({ ...formData, typeId: e.target.value })}
                >
                  {getAvailableTypes().map(type => (
                    <MenuItem key={type.id} value={type.id}>
                      {type.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Typography variant="subtitle1" sx={{ mt: 2 }}>
            Time Span
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                label="Start Time (seconds)"
                type="number"
                value={formData.startTime}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  startTime: parseFloat(e.target.value) 
                })}
                fullWidth
                inputProps={{ step: 0.001, min: 0 }}
                helperText={formatTime(formData.startTime)}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="End Time (seconds)"
                type="number"
                value={formData.endTime}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  endTime: parseFloat(e.target.value) 
                })}
                fullWidth
                inputProps={{ step: 0.001, min: 0 }}
                helperText={formatTime(formData.endTime)}
              />
            </Grid>
          </Grid>

          <Typography variant="subtitle1" sx={{ mt: 2 }}>
            Bounding Box
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={3}>
              <TextField
                label="X"
                type="number"
                value={formData.x}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  x: parseFloat(e.target.value) 
                })}
                fullWidth
                inputProps={{ step: 1, min: 0 }}
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                label="Y"
                type="number"
                value={formData.y}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  y: parseFloat(e.target.value) 
                })}
                fullWidth
                inputProps={{ step: 1, min: 0 }}
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                label="Width"
                type="number"
                value={formData.width}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  width: parseFloat(e.target.value) 
                })}
                fullWidth
                inputProps={{ step: 1, min: 1 }}
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                label="Height"
                type="number"
                value={formData.height}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  height: parseFloat(e.target.value) 
                })}
                fullWidth
                inputProps={{ step: 1, min: 1 }}
              />
            </Grid>
          </Grid>

          <TextField
            label="Notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            fullWidth
            multiline
            rows={3}
            placeholder="Optional notes about this annotation"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained"
          disabled={!formData.typeId}
        >
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  )
}