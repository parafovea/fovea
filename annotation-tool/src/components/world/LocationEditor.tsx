import { useState, useEffect } from 'react'
import {
  MapPin,
  Crosshair,
  Maximize2,
  Trash2,
  Plus,
  Navigation,
  Grid3x3,
  Map,
  Globe,
  Pencil,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAddEntity, useUpdateEntity, usePersonas, useAllPersonaOntologies } from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import { LocationPoint, LocationExtent, GlossItem, EntityTypeAssignment, Entity } from '@models/types'

/** Coordinate system type options */
type CoordinateSystemType = 'GPS' | 'cartesian' | 'relative'
import GlossEditor from '@components/ontology/GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import WikidataImportFlow from '../shared/WikidataImportFlow'
import MapLocationPicker from './MapLocationPicker'
import { useUnsavedChangesPrompt } from '../../hooks/data'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

interface LocationEditorProps {
  open: boolean
  onClose: () => void
  location: LocationPoint | LocationExtent | null
}

interface Coordinate {
  latitude?: number
  longitude?: number
  altitude?: number
  x?: number
  y?: number
  z?: number
}

export default function LocationEditor({ open, onClose, location }: LocationEditorProps) {
  // TanStack Query hooks for personas
  const { data: personas = [] } = usePersonas()
  const personaIds = personas.map((p) => p.id)
  const { data: personaOntologies = [] } = useAllPersonaOntologies(personaIds)

  // Active persona from Zustand store
  const activePersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)

  const { mutateAsync: addEntity } = useAddEntity()
  const { mutateAsync: updateEntity } = useUpdateEntity()
  const mapPickerRef = useTourAnchor('location-map-picker')
  const nameInputRef = useTourAnchor('location-name-input')

  const [importMode, setImportMode] = useState<'manual' | 'wikidata'>('manual')
  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [alternateNamesInput, setAlternateNamesInput] = useState('')
  const [typeAssignments, setTypeAssignments] = useState<EntityTypeAssignment[]>([])
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')

  // Location-specific fields
  const [locationType, setLocationType] = useState<'point' | 'extent'>('point')
  const [coordinateSystem, setCoordinateSystem] = useState<'GPS' | 'cartesian' | 'relative'>('GPS')

  // Point coordinates
  const [pointCoordinates, setPointCoordinates] = useState<Coordinate>({})

  // Extent boundaries
  const [boundaryPoints, setBoundaryPoints] = useState<Coordinate[]>([])
  const [useBoundingBox, setUseBoundingBox] = useState(false)
  const [boundingBox, setBoundingBox] = useState<{
    minLatitude?: number
    maxLatitude?: number
    minLongitude?: number
    maxLongitude?: number
    minAltitude?: number
    maxAltitude?: number
  }>({})

  // For type assignment form
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('')
  const [selectedEntityTypeId, setSelectedEntityTypeId] = useState<string>('')

  // Map interface state
  const [mapOpen, setMapOpen] = useState(false)

  const isDirty = open && (
    location
      ? name !== location.name ||
        alternateNamesInput !== (location.metadata?.alternateNames?.join(', ') || '') ||
        wikidataId !== (location.wikidataId || '') ||
        wikidataUrl !== (location.wikidataUrl || '') ||
        locationType !== location.locationType ||
        coordinateSystem !== (location.coordinateSystem || 'GPS') ||
        JSON.stringify(description) !== JSON.stringify(location.description) ||
        JSON.stringify(typeAssignments) !== JSON.stringify(location.typeAssignments || [])
      : !!name || alternateNamesInput.trim() !== '' || typeAssignments.length > 0 ||
        Object.keys(pointCoordinates).length > 0 || boundaryPoints.length > 0
  )

  const { confirmDiscard } = useUnsavedChangesPrompt({ isDirty })

  useEffect(() => {
    if (location) {
      setName(location.name)
      setDescription(location.description)
      setAlternateNamesInput(location.metadata?.alternateNames?.join(', ') || '')
      setTypeAssignments(location.typeAssignments || [])
      setWikidataId(location.wikidataId || '')
      setWikidataUrl(location.wikidataUrl || '')
      setLocationType(location.locationType)
      setCoordinateSystem(location.coordinateSystem || 'GPS')

      if (location.locationType === 'point') {
        const point = location as LocationPoint
        setPointCoordinates(point.coordinates || {})
      } else {
        const extent = location as LocationExtent
        setBoundaryPoints(extent.boundary || [])
        if (extent.boundingBox) {
          setUseBoundingBox(true)
          setBoundingBox(extent.boundingBox)
        }
      }
    } else {
      setName('')
      setDescription([{ type: 'text', content: '' }])
      setAlternateNamesInput('')
      setTypeAssignments([])
      setLocationType('point')
      setCoordinateSystem('GPS')
      setPointCoordinates({})
      setBoundaryPoints([])
      setUseBoundingBox(false)
      setBoundingBox({})
      setWikidataId('')
      setWikidataUrl('')
    }
  }, [location, open])

  const handleAddBoundaryPoint = () => {
    setBoundaryPoints([...boundaryPoints, {}])
  }

  const handleUpdateBoundaryPoint = (index: number, coord: Coordinate) => {
    const updated = [...boundaryPoints]
    updated[index] = coord
    setBoundaryPoints(updated)
  }

  const handleRemoveBoundaryPoint = (index: number) => {
    setBoundaryPoints(boundaryPoints.filter((_, i) => i !== index))
  }

  const handleAddTypeAssignment = () => {
    if (selectedPersonaId && selectedEntityTypeId) {
      const newAssignment: EntityTypeAssignment = {
        personaId: selectedPersonaId,
        entityTypeId: selectedEntityTypeId,
        confidence: 1.0,
      }

      const filtered = typeAssignments.filter(a => a.personaId !== selectedPersonaId)
      setTypeAssignments([...filtered, newAssignment])

      setSelectedEntityTypeId('')
    }
  }

  const handleRemoveTypeAssignment = (personaId: string) => {
    setTypeAssignments(typeAssignments.filter(a => a.personaId !== personaId))
  }

  const handleOpenMap = () => {
    setMapOpen(true)
  }

  const handleMapSelect = (coordinates: Coordinate | Coordinate[], type: 'point' | 'extent') => {
    if (type === 'point' && !Array.isArray(coordinates)) {
      setLocationType('point')
      setPointCoordinates(coordinates)
    } else if (type === 'extent' && Array.isArray(coordinates)) {
      setLocationType('extent')
      setBoundaryPoints(coordinates)
      if (coordinateSystem === 'GPS' && coordinates.length > 0) {
        const lats = coordinates.map(c => c.latitude).filter((v): v is number => v !== undefined)
        const lngs = coordinates.map(c => c.longitude).filter((v): v is number => v !== undefined)
        if (lats.length > 0 && lngs.length > 0) {
          setBoundingBox({
            minLatitude: Math.min(...lats),
            maxLatitude: Math.max(...lats),
            minLongitude: Math.min(...lngs),
            maxLongitude: Math.max(...lngs),
          })
          setUseBoundingBox(true)
        }
      }
    }
    setMapOpen(false)
  }

  const handleSave = async () => {
    const now = new Date().toISOString()
    const baseEntity = {
      name,
      description,
      typeAssignments,
      wikidataId: wikidataId || undefined,
      wikidataUrl: wikidataUrl || undefined,
      importedFrom: wikidataId ? (location?.importedFrom || 'wikidata') : undefined,
      importedAt: wikidataId ? (location?.importedAt || now) : undefined,
      metadata: {
        alternateNames: alternateNamesInput.split(',').map(s => s.trim()).filter(Boolean),
        externalIds: {},
        properties: {},
      },
    }

    let locationData: Omit<LocationPoint | LocationExtent, 'id' | 'createdAt' | 'updatedAt'>

    if (locationType === 'point') {
      locationData = {
        ...baseEntity,
        locationType: 'point',
        coordinateSystem,
        coordinates: pointCoordinates,
      } as Omit<LocationPoint, 'id' | 'createdAt' | 'updatedAt'>
    } else {
      locationData = {
        ...baseEntity,
        locationType: 'extent',
        coordinateSystem,
        boundary: boundaryPoints,
        boundingBox: useBoundingBox ? boundingBox : undefined,
      } as Omit<LocationExtent, 'id' | 'createdAt' | 'updatedAt'>
    }

    if (location) {
      await updateEntity({ ...location, ...locationData } as Entity)
    } else {
      await addEntity(locationData as Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>)
    }

    onClose()
  }

  const handleCancel = () => {
    if (!confirmDiscard()) return
    onClose()
  }

  const getEntityTypeName = (personaId: string, entityTypeId: string): string => {
    const ontology = personaOntologies.find(o => o.personaId === personaId)
    const entityType = ontology?.entities.find(e => e.id === entityTypeId)
    return entityType?.name || 'Unknown Type'
  }

  const getPersonaName = (personaId: string): string => {
    const persona = personas.find(p => p.id === personaId)
    return persona?.name || 'Unknown Persona'
  }

  const availableEntityTypes = selectedPersonaId
    ? personaOntologies.find(o => o.personaId === selectedPersonaId)?.entities || []
    : []

  const renderCoordinateInputs = (coord: Coordinate, onChange: (coord: Coordinate) => void) => {
    if (coordinateSystem === 'GPS') {
      return (
        <div className="grid grid-cols-3 gap-2">
          <Input
            type="number"
            placeholder="Latitude"
            value={coord.latitude || ''}
            onChange={(e) => onChange({ ...coord, latitude: e.target.value ? parseFloat(e.target.value) : undefined })}
            step={0.000001}
          />
          <Input
            type="number"
            placeholder="Longitude"
            value={coord.longitude || ''}
            onChange={(e) => onChange({ ...coord, longitude: e.target.value ? parseFloat(e.target.value) : undefined })}
            step={0.000001}
          />
          <Input
            type="number"
            placeholder="Altitude (m)"
            value={coord.altitude || ''}
            onChange={(e) => onChange({ ...coord, altitude: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
        </div>
      )
    } else {
      return (
        <div className="grid grid-cols-3 gap-2">
          <Input
            type="number"
            placeholder="X"
            value={coord.x || ''}
            onChange={(e) => onChange({ ...coord, x: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
          <Input
            type="number"
            placeholder="Y"
            value={coord.y || ''}
            onChange={(e) => onChange({ ...coord, y: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
          <Input
            type="number"
            placeholder="Z"
            value={coord.z || ''}
            onChange={(e) => onChange({ ...coord, z: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
        </div>
      )
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent ref={mapPickerRef} className="sm:max-w-3xl max-h-[90vh] !grid-rows-[auto_1fr_auto] !p-0 !gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-secondary" />
            {location ? 'Edit Location' : 'Create Location'}
            <TypeObjectBadge isType={false} />
          </DialogTitle>
        </DialogHeader>
        {/* Scrollable body wrapper. Without this the form fields
            overflow the DialogContent's max-h-[90vh] but the grid
            layout doesn't surface a scrollbar (the rows auto-size to
            content), so the Cancel / Save footer is rendered below the
            viewport and unreachable — visitor can't save the location.
            The grid-rows override above pins the header and footer to
            fixed rows and gives the middle row min-h-0 + overflow-y so
            the form scrolls cleanly. */}
        <div className="flex flex-col gap-4 px-6 py-4 overflow-y-auto min-h-0">
          <Alert>
            <MapPin className="size-4" />
            <AlertDescription>
              A location is a specific place in the world (e.g., "Times Square", "Mount Everest").
              Locations are special types of entities with coordinate information.
            </AlertDescription>
          </Alert>

          {/* Import mode selector */}
          {!location && (
            <ToggleGroup
              value={[importMode]}
              onValueChange={(value) => {
                if (value.length > 0) setImportMode(value[0] as 'manual' | 'wikidata')
              }}
              size="sm"
              className="w-full"
            >
              <ToggleGroupItem value="manual" className="flex flex-1 items-center gap-1">
                <Pencil className="size-4" />
                Manual Entry
              </ToggleGroupItem>
              <ToggleGroupItem value="wikidata" className="flex flex-1 items-center gap-1">
                <Globe className="size-4" />
                Import from Wikidata
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          {/* Wikidata import */}
          {importMode === 'wikidata' && !location && (
            <WikidataImportFlow
              type="location"
              entityType="object"
              objectSubtype="location"
              onSuccess={() => onClose()}
              onCancel={onClose}
            />
          )}

          {/* Show Wikidata link if imported */}
          {wikidataUrl && (
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-muted-foreground" />
                <span className="text-sm">Imported from Wikidata:</span>
                <a
                  href={wikidataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {wikidataId}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          )}

          {/* Basic Entity Fields */}
          <div className="space-y-1">
            <Label htmlFor="location-name">Location Name *</Label>
            <Input
              ref={nameInputRef}
              id="location-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Location name"
            />
            <p className="text-xs text-muted-foreground">The specific name of this location</p>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={activePersonaId}
            />
          </div>

          <div className="space-y-1">
            <Label>Alternate Names</Label>
            <Input
              value={alternateNamesInput}
              onChange={(e) => setAlternateNamesInput(e.target.value)}
              placeholder="Other names (comma-separated)"
            />
            <p className="text-xs text-muted-foreground">Other names for this location (comma-separated)</p>
          </div>

          <Separator />

          {/* Location-Specific Fields */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Location Geometry</h3>

            <div className="flex gap-4 mb-4">
              <ToggleGroup
                value={[locationType]}
                onValueChange={(value) => {
                  if (value.length > 0) setLocationType(value[0] as 'point' | 'extent')
                }}
              >
                <ToggleGroupItem value="point" className="flex items-center gap-1">
                  <Crosshair className="size-4" />
                  Point
                </ToggleGroupItem>
                <ToggleGroupItem value="extent" className="flex items-center gap-1">
                  <Maximize2 className="size-4" />
                  Extent/Region
                </ToggleGroupItem>
              </ToggleGroup>

              <div style={{ minWidth: 150 }}>
                <Select value={coordinateSystem} onValueChange={(value) => setCoordinateSystem(value as CoordinateSystemType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GPS">
                      <span className="flex items-center gap-1">
                        <Navigation className="size-3" />
                        GPS (Lat/Long)
                      </span>
                    </SelectItem>
                    <SelectItem value="cartesian">
                      <span className="flex items-center gap-1">
                        <Grid3x3 className="size-3" />
                        Cartesian (X/Y/Z)
                      </span>
                    </SelectItem>
                    <SelectItem value="relative">Relative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Map button */}
            <Button
              variant="outline"
              onClick={handleOpenMap}
              className="w-full mb-4"
            >
              <Map className="mr-2 size-4" />
              {(locationType === 'point' && (pointCoordinates.latitude || pointCoordinates.x)) ||
               (locationType === 'extent' && boundaryPoints.length > 0)
                ? 'View/Edit on Map'
                : 'Select on Map'
              }
            </Button>

            {/* Point Coordinates */}
            {locationType === 'point' && (
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <Label className="text-sm font-medium">Point Coordinates</Label>
                {renderCoordinateInputs(pointCoordinates, setPointCoordinates)}
              </div>
            )}

            {/* Extent Boundaries */}
            {locationType === 'extent' && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <Label className="text-sm font-medium">Region Boundary</Label>

                {/* Boundary Points */}
                {!useBoundingBox && (
                  <>
                    <ul className="space-y-2">
                      {boundaryPoints.map((point, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <div className="flex-1">
                            {renderCoordinateInputs(point, (coord) => handleUpdateBoundaryPoint(index, coord))}
                          </div>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleRemoveBoundaryPoint(index)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAddBoundaryPoint}
                    >
                      <Plus className="mr-1 size-4" />
                      Add Boundary Point
                    </Button>
                  </>
                )}

                {/* Bounding Box Option */}
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant={useBoundingBox ? "default" : "outline"}
                    onClick={() => setUseBoundingBox(!useBoundingBox)}
                  >
                    {useBoundingBox ? 'Using Bounding Box' : 'Use Bounding Box Instead'}
                  </Button>

                  {useBoundingBox && coordinateSystem === 'GPS' && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <Input
                        type="number"
                        placeholder="Min Latitude"
                        value={boundingBox.minLatitude || ''}
                        onChange={(e) => setBoundingBox({
                          ...boundingBox,
                          minLatitude: e.target.value ? parseFloat(e.target.value) : undefined
                        })}
                      />
                      <Input
                        type="number"
                        placeholder="Max Latitude"
                        value={boundingBox.maxLatitude || ''}
                        onChange={(e) => setBoundingBox({
                          ...boundingBox,
                          maxLatitude: e.target.value ? parseFloat(e.target.value) : undefined
                        })}
                      />
                      <Input
                        type="number"
                        placeholder="Min Longitude"
                        value={boundingBox.minLongitude || ''}
                        onChange={(e) => setBoundingBox({
                          ...boundingBox,
                          minLongitude: e.target.value ? parseFloat(e.target.value) : undefined
                        })}
                      />
                      <Input
                        type="number"
                        placeholder="Max Longitude"
                        value={boundingBox.maxLongitude || ''}
                        onChange={(e) => setBoundingBox({
                          ...boundingBox,
                          maxLongitude: e.target.value ? parseFloat(e.target.value) : undefined
                        })}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Type Assignments */}
          <div>
            <h3 className="text-sm font-semibold mb-1">Type Assignments by Persona</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Different personas can classify this location with different entity types.
            </p>

            {/* Existing assignments */}
            {typeAssignments.length > 0 && (
              <ul className="space-y-2 mb-3">
                {typeAssignments.map((assignment) => (
                  <li key={assignment.personaId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge>{getPersonaName(assignment.personaId)}</Badge>
                      <span className="text-sm">classifies as</span>
                      <Badge variant="outline" className="italic">
                        {getEntityTypeName(assignment.personaId, assignment.entityTypeId)}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveTypeAssignment(assignment.personaId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add new assignment */}
            <div className="flex gap-2 mt-2">
              <div style={{ minWidth: 150 }}>
                <Select value={selectedPersonaId || '_none'} onValueChange={(value) => {
                  setSelectedPersonaId(!value || value === '_none' ? '' : value)
                  setSelectedEntityTypeId('')
                }}>
                  <SelectTrigger className="w-full truncate [&>span]:truncate [&>span]:block [&>span]:overflow-hidden">
                    {/* Explicit child override: base-ui Select renders
                        the controlled `value` prop verbatim (a UUID)
                        when the matching SelectItem hasn't yet mounted
                        (initial paint before the dropdown opens).
                        Resolve the name from the personas list so the
                        trigger never shows a raw id. */}
                    <SelectValue placeholder="Persona">
                      {selectedPersonaId
                        ? personas.find((p) => p.id === selectedPersonaId)?.name ?? null
                        : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Select Persona</SelectItem>
                    {personas.map(persona => (
                      <SelectItem key={persona.id} value={persona.id}>
                        {persona.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPersonaId && (
                <div style={{ minWidth: 150 }}>
                  <Select value={selectedEntityTypeId || '_none'} onValueChange={(value) => setSelectedEntityTypeId(!value || value === '_none' ? '' : value)}>
                    <SelectTrigger className="w-full truncate [&>span]:truncate [&>span]:block [&>span]:overflow-hidden">
                      {/* Explicit child override: base-ui Select renders
                          the controlled `value` prop verbatim (a UUID)
                          when the matching SelectItem hasn't yet
                          mounted (initial paint before the dropdown
                          opens). Resolve the name from the
                          availableEntityTypes list so the trigger never
                          shows a raw id. */}
                      <SelectValue placeholder="Entity Type">
                        {selectedEntityTypeId
                          ? availableEntityTypes.find((t) => t.id === selectedEntityTypeId)?.name ?? null
                          : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Select Type</SelectItem>
                      {availableEntityTypes.map(type => (
                        <SelectItem key={type.id} value={type.id}>
                          <em>{type.name}</em>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleAddTypeAssignment}
                disabled={!selectedPersonaId || !selectedEntityTypeId}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={!name || description.length === 0}
          >
            {location ? 'Update Location' : 'Create Location'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Map Location Picker */}
    {mapOpen && (
      <MapLocationPicker
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        onSelect={handleMapSelect}
        initialCoordinates={
          locationType === 'point' ? pointCoordinates : boundaryPoints
        }
        locationType={locationType}
        coordinateSystem={coordinateSystem}
      />
    )}
  </>
  )
}
