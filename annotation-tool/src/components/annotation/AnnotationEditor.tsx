import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { User, CalendarDays, MapPin, Folder, X } from 'lucide-react'
import { usePersonas, usePersonaOntology, useWorld, useUpdateAnnotation } from '@store/queries'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'
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
  const worldReferenceAnchor = useTourAnchor('annotation-world-reference')
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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Edit Annotation {persona && `(${persona.name})`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-4">
          {/* Type Assignment or Object Linking */}
          <p className="text-sm font-medium">Annotation Target</p>

          {/* Show linked object if present */}
          {(formData.linkedEntityId || formData.linkedEventId || formData.linkedLocationId || formData.linkedCollectionId) && (
            <Alert ref={worldReferenceAnchor} className="mb-4">
              <AlertDescription>
                <div className="flex flex-col gap-2">
                  <p className="text-sm">Linked Object:</p>
                  {formData.linkedEntityId && (
                    <Badge variant="outline" className="w-fit">
                      <User className="size-3 mr-1" />
                      {entities.find(e => e.id === formData.linkedEntityId)?.name || 'Unknown Entity'}
                      <button onClick={() => setFormData({ ...formData, linkedEntityId: '' })} className="ml-1">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  )}
                  {formData.linkedEventId && (
                    <Badge variant="outline" className="w-fit">
                      <CalendarDays className="size-3 mr-1" />
                      {events.find(e => e.id === formData.linkedEventId)?.name || 'Unknown Event'}
                      <button onClick={() => setFormData({ ...formData, linkedEventId: '' })} className="ml-1">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  )}
                  {formData.linkedLocationId && (
                    <Badge variant="outline" className="w-fit">
                      <MapPin className="size-3 mr-1" />
                      {entities.find(e => e.id === formData.linkedLocationId)?.name || 'Unknown Location'}
                      <button onClick={() => setFormData({ ...formData, linkedLocationId: '' })} className="ml-1">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  )}
                  {formData.linkedCollectionId && (
                    <Badge variant="outline" className="w-fit">
                      <Folder className="size-3 mr-1" />
                      {formData.linkedCollectionType === 'entity'
                        ? entityCollections.find(c => c.id === formData.linkedCollectionId)?.name || 'Unknown Collection'
                        : eventCollections.find(c => c.id === formData.linkedCollectionId)?.name || 'Unknown Collection'}
                      <button onClick={() => setFormData({ ...formData, linkedCollectionId: '', linkedCollectionType: '' })} className="ml-1">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Object picker buttons */}
          {!formData.linkedEntityId && !formData.linkedEventId && !formData.linkedLocationId && !formData.linkedCollectionId && (
            <div className="flex flex-row gap-2">
              <Button variant="outline" size="sm" onClick={() => { setObjectPickerType('entity'); setObjectPickerOpen(true) }}>
                <User className="size-4 mr-1" /> Link Entity
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setObjectPickerType('event'); setObjectPickerOpen(true) }}>
                <CalendarDays className="size-4 mr-1" /> Link Event
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setObjectPickerType('location'); setObjectPickerOpen(true) }}>
                <MapPin className="size-4 mr-1" /> Link Location
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setObjectPickerType('collection'); setObjectPickerOpen(true) }}>
                <Folder className="size-4 mr-1" /> Link Collection
              </Button>
            </div>
          )}

          <div className="relative flex items-center">
            <Separator className="flex-1" />
            <span className="px-3 text-xs text-muted-foreground">OR</span>
            <Separator className="flex-1" />
          </div>

          {/* Type Assignment (only if persona present) */}
          {persona && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type Category</Label>
                <Select
                  value={formData.typeCategory}
                  onValueChange={(val) => setFormData({
                    ...formData,
                    typeCategory: val as 'entity' | 'role' | 'event',
                    typeId: '' // Reset type when category changes
                  })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entity">Entity</SelectItem>
                    <SelectItem value="role">Role</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={formData.typeId}
                  onValueChange={(val) => setFormData({ ...formData, typeId: val ?? '' })}
                >
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {getAvailableTypes().map(type => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <p className="text-sm font-medium mt-4">Time Span</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Time (seconds)</Label>
              <Input
                type="number"
                value={formData.startTime}
                onChange={(e) => setFormData({
                  ...formData,
                  startTime: parseFloat(e.target.value)
                })}
                step={0.001}
                min={0}
              />
              <p className="text-xs text-muted-foreground mt-1">{formatTime(formData.startTime)}</p>
            </div>
            <div>
              <Label>End Time (seconds)</Label>
              <Input
                type="number"
                value={formData.endTime}
                onChange={(e) => setFormData({
                  ...formData,
                  endTime: parseFloat(e.target.value)
                })}
                step={0.001}
                min={0}
              />
              <p className="text-xs text-muted-foreground mt-1">{formatTime(formData.endTime)}</p>
            </div>
          </div>

          <p className="text-sm font-medium mt-4">Bounding Box</p>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label>X</Label>
              <Input
                type="number"
                value={formData.x}
                onChange={(e) => setFormData({ ...formData, x: parseFloat(e.target.value) })}
                step={1}
                min={0}
              />
            </div>
            <div>
              <Label>Y</Label>
              <Input
                type="number"
                value={formData.y}
                onChange={(e) => setFormData({ ...formData, y: parseFloat(e.target.value) })}
                step={1}
                min={0}
              />
            </div>
            <div>
              <Label>Width</Label>
              <Input
                type="number"
                value={formData.width}
                onChange={(e) => setFormData({ ...formData, width: parseFloat(e.target.value) })}
                step={1}
                min={1}
              />
            </div>
            <div>
              <Label>Height</Label>
              <Input
                type="number"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: parseFloat(e.target.value) })}
                step={1}
                min={1}
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Optional notes about this annotation"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
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
        </DialogFooter>
      </DialogContent>

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
