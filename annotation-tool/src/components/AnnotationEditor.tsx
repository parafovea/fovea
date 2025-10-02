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
  Chip,
  Stack,
  Alert,
  Divider,
} from '@mui/material'
import {
  Person as EntityIcon,
  Event as EventIcon,
  LocationOn as LocationIcon,
  Folder as CollectionIcon,
} from '@mui/icons-material'
import { AppDispatch, RootState } from '../store/store'
import { updateAnnotation } from '../store/annotationSlice'
import { Annotation } from '../models/types'
import ObjectPicker from './annotation/ObjectPicker'

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
  const [objectPickerOpen, setObjectPickerOpen] = useState(false)
  const [objectPickerType, setObjectPickerType] = useState<'entity' | 'event' | 'location' | 'collection'>('entity')
  
  // Get the persona and its ontology for this annotation
  const persona = useSelector((state: RootState) => {
    if (!annotation || annotation.annotationType !== 'type') return null
    return state.persona.personas.find(p => p.id === annotation.personaId)
  })
  const personaOntology = useSelector((state: RootState) => {
    if (!annotation || annotation.annotationType !== 'type') return null
    return state.persona.personaOntologies.find(o => o.personaId === annotation.personaId)
  })
  
  // Get world objects for linked annotations
  const entities = useSelector((state: RootState) => state.world.entities)
  const events = useSelector((state: RootState) => state.world.events)
  const entityCollections = useSelector((state: RootState) => state.world.entityCollections)
  const eventCollections = useSelector((state: RootState) => state.world.eventCollections)
  
  const [formData, setFormData] = useState({
    typeCategory: 'entity' as 'entity' | 'role' | 'event',
    typeId: '',
    linkedEntityId: '',
    linkedEventId: '',
    linkedLocationId: '',
    linkedCollectionId: '',
    linkedCollectionType: '' as '' | 'entity' | 'event' | 'time',
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
        typeCategory: annotation.annotationType === 'type' ? annotation.typeCategory : 'entity',
        typeId: annotation.annotationType === 'type' ? annotation.typeId : '',
        linkedEntityId: annotation.annotationType === 'object' ? (annotation.linkedEntityId || '') : '',
        linkedEventId: annotation.annotationType === 'object' ? (annotation.linkedEventId || '') : '',
        linkedLocationId: annotation.annotationType === 'object' ? (annotation.linkedLocationId || '') : '',
        linkedCollectionId: annotation.annotationType === 'object' ? (annotation.linkedCollectionId || '') : '',
        linkedCollectionType: annotation.annotationType === 'object' ? (annotation.linkedCollectionType || '') : '',
        startTime: annotation.timeSpan?.startTime || 0,
        endTime: annotation.timeSpan?.endTime || 0,
        x: annotation.boundingBox?.x || 0,
        y: annotation.boundingBox?.y || 0,
        width: annotation.boundingBox?.width || 0,
        height: annotation.boundingBox?.height || 0,
        notes: annotation.notes || '',
      })
    }
  }, [annotation])

  const handleSave = () => {
    if (!annotation) return

    const updatedAnnotation: any = {
      ...annotation,
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
    
    // Clear all type/link fields first
    delete updatedAnnotation.typeCategory
    delete updatedAnnotation.typeId
    delete updatedAnnotation.linkedEntityId
    delete updatedAnnotation.linkedEventId
    delete updatedAnnotation.linkedLocationId
    delete updatedAnnotation.linkedCollectionId
    delete updatedAnnotation.linkedCollectionType
    
    // Add appropriate fields based on what's set
    if (formData.typeCategory && formData.typeId) {
      updatedAnnotation.typeCategory = formData.typeCategory
      updatedAnnotation.typeId = formData.typeId
    } else if (formData.linkedEntityId) {
      updatedAnnotation.linkedEntityId = formData.linkedEntityId
    } else if (formData.linkedEventId) {
      updatedAnnotation.linkedEventId = formData.linkedEventId
    } else if (formData.linkedLocationId) {
      updatedAnnotation.linkedLocationId = formData.linkedLocationId
    } else if (formData.linkedCollectionId) {
      updatedAnnotation.linkedCollectionId = formData.linkedCollectionId
      updatedAnnotation.linkedCollectionType = formData.linkedCollectionType
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
          {/* Type Assignment or Object Linking */}
          <Typography variant="subtitle1">Annotation Target</Typography>
          
          {/* Show linked object if present */}
          {(formData.linkedEntityId || formData.linkedEventId || formData.linkedLocationId || formData.linkedCollectionId) && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Stack spacing={1}>
                <Typography variant="body2">Linked Object:</Typography>
                {formData.linkedEntityId && (
                  <Chip
                    icon={<EntityIcon />}
                    label={entities.find(e => e.id === formData.linkedEntityId)?.name || 'Unknown Entity'}
                    onDelete={() => setFormData({ ...formData, linkedEntityId: '' })}
                  />
                )}
                {formData.linkedEventId && (
                  <Chip
                    icon={<EventIcon />}
                    label={events.find(e => e.id === formData.linkedEventId)?.name || 'Unknown Event'}
                    onDelete={() => setFormData({ ...formData, linkedEventId: '' })}
                  />
                )}
                {formData.linkedLocationId && (
                  <Chip
                    icon={<LocationIcon />}
                    label={entities.find(e => e.id === formData.linkedLocationId)?.name || 'Unknown Location'}
                    onDelete={() => setFormData({ ...formData, linkedLocationId: '' })}
                  />
                )}
                {formData.linkedCollectionId && (
                  <Chip
                    icon={<CollectionIcon />}
                    label={
                      formData.linkedCollectionType === 'entity'
                        ? entityCollections.find(c => c.id === formData.linkedCollectionId)?.name || 'Unknown Collection'
                        : eventCollections.find(c => c.id === formData.linkedCollectionId)?.name || 'Unknown Collection'
                    }
                    onDelete={() => setFormData({ ...formData, linkedCollectionId: '', linkedCollectionType: '' })}
                  />
                )}
              </Stack>
            </Alert>
          )}
          
          {/* Object picker buttons */}
          {!formData.linkedEntityId && !formData.linkedEventId && !formData.linkedLocationId && !formData.linkedCollectionId && (
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<EntityIcon />}
                onClick={() => {
                  setObjectPickerType('entity')
                  setObjectPickerOpen(true)
                }}
              >
                Link Entity
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<EventIcon />}
                onClick={() => {
                  setObjectPickerType('event')
                  setObjectPickerOpen(true)
                }}
              >
                Link Event
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<LocationIcon />}
                onClick={() => {
                  setObjectPickerType('location')
                  setObjectPickerOpen(true)
                }}
              >
                Link Location
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CollectionIcon />}
                onClick={() => {
                  setObjectPickerType('collection')
                  setObjectPickerOpen(true)
                }}
              >
                Link Collection
              </Button>
            </Stack>
          )}
          
          <Divider>OR</Divider>
          
          {/* Type Assignment (only if persona present) */}
          {persona && (
            <>
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
            </>
          )}

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
          disabled={
            !formData.typeId && 
            !formData.linkedEntityId && 
            !formData.linkedEventId && 
            !formData.linkedLocationId && 
            !formData.linkedCollectionId
          }
        >
          Save Changes
        </Button>
      </DialogActions>
      
      <ObjectPicker
        open={objectPickerOpen}
        onClose={() => setObjectPickerOpen(false)}
        onSelect={(object) => {
          // Clear all link fields first
          const clearedFormData = {
            ...formData,
            linkedEntityId: '',
            linkedEventId: '',
            linkedLocationId: '',
            linkedCollectionId: '',
            linkedCollectionType: '' as '' | 'entity' | 'event',
          }
          
          // Set the appropriate field based on object type
          if (object.type === 'entity') {
            setFormData({ ...clearedFormData, linkedEntityId: object.id })
          } else if (object.type === 'event') {
            setFormData({ ...clearedFormData, linkedEventId: object.id })
          } else if (object.type === 'location') {
            setFormData({ ...clearedFormData, linkedLocationId: object.id })
          } else if (object.type === 'entity-collection') {
            setFormData({ ...clearedFormData, linkedCollectionId: object.id, linkedCollectionType: 'entity' })
          } else if (object.type === 'event-collection') {
            setFormData({ ...clearedFormData, linkedCollectionId: object.id, linkedCollectionType: 'event' })
          }
          
          setObjectPickerOpen(false)
        }}
        allowedTypes={[objectPickerType]}
      />
    </Dialog>
  )
}