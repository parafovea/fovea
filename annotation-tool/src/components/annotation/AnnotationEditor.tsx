import { useState, useEffect } from 'react'
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
import { usePersonas, usePersonaOntology, useWorld, useUpdateAnnotation } from '@store/queries'
import type { Annotation, ObjectAnnotation, TypeAnnotation, BoundingBoxSequence, BoundingBox, InterpolationSegment } from '@models/types'
import { getAnnotationTimeBounds } from '@models/types'
import ObjectPicker from './ObjectPicker'

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
  const { mutate: updateAnnotationMutation } = useUpdateAnnotation()
  const [objectPickerOpen, setObjectPickerOpen] = useState(false)
  const [objectPickerType, setObjectPickerType] = useState<'entity' | 'event' | 'location' | 'collection'>('entity')

  // Get the personaId from the annotation if it's a type annotation
  const personaId = annotation?.annotationType === 'type' ? annotation.personaId : null

  // Get the persona and its ontology for this annotation
  const { data: personas = [] } = usePersonas()
  const persona = personaId ? personas.find(p => p.id === personaId) : null
  const { data: personaOntology } = usePersonaOntology(personaId)

  // Get world objects for linked annotations
  const { data: worldData } = useWorld()
  const entities = worldData?.entities ?? []
  const events = worldData?.events ?? []
  const entityCollections = worldData?.entityCollections ?? []
  const eventCollections = worldData?.eventCollections ?? []
  
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
      // Get first keyframe from boundingBoxSequence
      const firstBox = annotation.boundingBoxSequence.boxes[0]
      // Derive time bounds from keyframes
      const bounds = getAnnotationTimeBounds(annotation, videoFps)

      setFormData({
        typeCategory: annotation.annotationType === 'type' ? annotation.typeCategory : 'entity',
        typeId: annotation.annotationType === 'type' ? annotation.typeId : '',
        linkedEntityId: annotation.annotationType === 'object' ? (annotation.linkedEntityId || '') : '',
        linkedEventId: annotation.annotationType === 'object' ? (annotation.linkedEventId || '') : '',
        linkedLocationId: annotation.annotationType === 'object' ? (annotation.linkedLocationId || '') : '',
        linkedCollectionId: annotation.annotationType === 'object' ? (annotation.linkedCollectionId || '') : '',
        linkedCollectionType: annotation.annotationType === 'object' ? (annotation.linkedCollectionType || '') : '',
        startTime: bounds?.startTime || 0,
        endTime: bounds?.endTime || 0,
        x: firstBox?.x || 0,
        y: firstBox?.y || 0,
        width: firstBox?.width || 0,
        height: firstBox?.height || 0,
        notes: annotation.notes || '',
      })
    }
  }, [annotation, videoFps])

  const handleSave = () => {
    if (!annotation) return

    const startFrame = Math.floor(formData.startTime * videoFps)
    const endFrame = Math.floor(formData.endTime * videoFps)

    // Build keyframes array - if start and end are different, create two keyframes
    const boxes: BoundingBox[] = startFrame === endFrame
      ? [{
          x: formData.x,
          y: formData.y,
          width: formData.width,
          height: formData.height,
          frameNumber: startFrame,
          isKeyframe: true,
        }]
      : [
          {
            x: formData.x,
            y: formData.y,
            width: formData.width,
            height: formData.height,
            frameNumber: startFrame,
            isKeyframe: true,
          },
          {
            x: formData.x,
            y: formData.y,
            width: formData.width,
            height: formData.height,
            frameNumber: endFrame,
            isKeyframe: true,
          },
        ]

    const interpolationSegments: InterpolationSegment[] = startFrame === endFrame
      ? []
      : [{
          type: 'linear',
          startFrame,
          endFrame,
        }]

    const boundingBoxSequence: BoundingBoxSequence = {
      boxes,
      interpolationSegments,
      visibilityRanges: [{
        startFrame,
        endFrame,
        visible: true,
      }],
      totalFrames: endFrame - startFrame + 1,
      keyframeCount: boxes.length,
      interpolatedFrameCount: Math.max(0, endFrame - startFrame - 1),
    }

    const now = new Date().toISOString()

    // Build the appropriate annotation type based on form data
    let updatedAnnotation: Annotation

    if (formData.typeCategory && formData.typeId && annotation.annotationType === 'type') {
      // TypeAnnotation
      const typeAnnotation: TypeAnnotation = {
        id: annotation.id,
        videoId: annotation.videoId,
        annotationType: 'type',
        personaId: annotation.personaId,
        typeCategory: formData.typeCategory,
        typeId: formData.typeId,
        boundingBoxSequence,
        time: annotation.time,
        confidence: annotation.confidence,
        notes: formData.notes || undefined,
        metadata: annotation.metadata,
        createdBy: annotation.createdBy,
        createdAt: annotation.createdAt,
        updatedAt: now,
        _ui: annotation._ui,
      }
      updatedAnnotation = typeAnnotation
    } else {
      // ObjectAnnotation
      const objectAnnotation: ObjectAnnotation = {
        id: annotation.id,
        videoId: annotation.videoId,
        annotationType: 'object',
        boundingBoxSequence,
        time: annotation.annotationType === 'object' ? annotation.time : undefined,
        confidence: annotation.confidence,
        notes: formData.notes || undefined,
        metadata: annotation.metadata,
        createdBy: annotation.createdBy,
        createdAt: annotation.createdAt,
        updatedAt: now,
        _ui: annotation._ui,
        // Set exactly one link field based on form data
        ...(formData.linkedEntityId && { linkedEntityId: formData.linkedEntityId }),
        ...(formData.linkedEventId && { linkedEventId: formData.linkedEventId }),
        ...(formData.linkedLocationId && { linkedLocationId: formData.linkedLocationId }),
        ...(formData.linkedCollectionId && {
          linkedCollectionId: formData.linkedCollectionId,
          linkedCollectionType: formData.linkedCollectionType as 'entity' | 'event' | 'time' | undefined,
        }),
      }
      updatedAnnotation = objectAnnotation
    }

    updateAnnotationMutation(updatedAnnotation)
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