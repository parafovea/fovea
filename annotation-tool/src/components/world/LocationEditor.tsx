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
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Grid,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material'
import {
  Place as LocationIcon,
  PinDrop as PointIcon,
  CropFree as ExtentIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  GpsFixed as GPSIcon,
  Grid3x3 as CartesianIcon,
} from '@mui/icons-material'
import { AppDispatch, RootState } from '../../store/store'
import { addEntity, updateEntity } from '../../store/worldSlice'
import { LocationPoint, LocationExtent, GlossItem, EntityTypeAssignment } from '../../models/types'
import GlossEditor from '../GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'

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
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies, activePersonaId } = useSelector((state: RootState) => state.persona)
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [alternateNames, setAlternateNames] = useState<string[]>([])
  const [typeAssignments, setTypeAssignments] = useState<EntityTypeAssignment[]>([])
  
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

  useEffect(() => {
    if (location) {
      setName(location.name)
      setDescription(location.description)
      setAlternateNames(location.metadata?.alternateNames || [])
      setTypeAssignments(location.typeAssignments || [])
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
      // Reset for new location
      setName('')
      setDescription([{ type: 'text', content: '' }])
      setAlternateNames([])
      setTypeAssignments([])
      setLocationType('point')
      setCoordinateSystem('GPS')
      setPointCoordinates({})
      setBoundaryPoints([])
      setUseBoundingBox(false)
      setBoundingBox({})
    }
  }, [location])

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

  const handleSave = () => {
    const baseEntity = {
      name,
      description,
      typeAssignments,
      metadata: {
        alternateNames: alternateNames.filter(Boolean),
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
      dispatch(updateEntity({ ...location, ...locationData } as any))
    } else {
      dispatch(addEntity(locationData as any))
    }
    
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
        <Grid container spacing={1}>
          <Grid item xs={4}>
            <TextField
              label="Latitude"
              type="number"
              size="small"
              value={coord.latitude || ''}
              onChange={(e) => onChange({ ...coord, latitude: e.target.value ? parseFloat(e.target.value) : undefined })}
              fullWidth
              inputProps={{ step: 0.000001 }}
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              label="Longitude"
              type="number"
              size="small"
              value={coord.longitude || ''}
              onChange={(e) => onChange({ ...coord, longitude: e.target.value ? parseFloat(e.target.value) : undefined })}
              fullWidth
              inputProps={{ step: 0.000001 }}
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              label="Altitude (m)"
              type="number"
              size="small"
              value={coord.altitude || ''}
              onChange={(e) => onChange({ ...coord, altitude: e.target.value ? parseFloat(e.target.value) : undefined })}
              fullWidth
            />
          </Grid>
        </Grid>
      )
    } else {
      return (
        <Grid container spacing={1}>
          <Grid item xs={4}>
            <TextField
              label="X"
              type="number"
              size="small"
              value={coord.x || ''}
              onChange={(e) => onChange({ ...coord, x: e.target.value ? parseFloat(e.target.value) : undefined })}
              fullWidth
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              label="Y"
              type="number"
              size="small"
              value={coord.y || ''}
              onChange={(e) => onChange({ ...coord, y: e.target.value ? parseFloat(e.target.value) : undefined })}
              fullWidth
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              label="Z"
              type="number"
              size="small"
              value={coord.z || ''}
              onChange={(e) => onChange({ ...coord, z: e.target.value ? parseFloat(e.target.value) : undefined })}
              fullWidth
            />
          </Grid>
        </Grid>
      )
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocationIcon color="secondary" />
          {location ? 'Edit Location' : 'Create Location'}
          <TypeObjectBadge isType={false} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <Alert severity="info" icon={<LocationIcon />}>
            A location is a specific place in the world (e.g., "Times Square", "Mount Everest").
            Locations are special types of entities with coordinate information.
          </Alert>

          {/* Basic Entity Fields */}
          <TextField
            label="Location Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            helperText="The specific name of this location"
          />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Description
            </Typography>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={activePersonaId} // Use active persona for type references
            />
          </Box>

          <TextField
            label="Alternate Names"
            value={alternateNames.join(', ')}
            onChange={(e) => setAlternateNames(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            fullWidth
            helperText="Other names for this location (comma-separated)"
          />

          <Divider />

          {/* Location-Specific Fields */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Location Geometry
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <ToggleButtonGroup
                value={locationType}
                exclusive
                onChange={(_, value) => value && setLocationType(value)}
              >
                <ToggleButton value="point">
                  <PointIcon sx={{ mr: 1 }} />
                  Point
                </ToggleButton>
                <ToggleButton value="extent">
                  <ExtentIcon sx={{ mr: 1 }} />
                  Extent/Region
                </ToggleButton>
              </ToggleButtonGroup>

              <FormControl sx={{ minWidth: 150 }}>
                <InputLabel>Coordinate System</InputLabel>
                <Select
                  value={coordinateSystem}
                  onChange={(e) => setCoordinateSystem(e.target.value as any)}
                  label="Coordinate System"
                >
                  <MenuItem value="GPS">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <GPSIcon fontSize="small" />
                      GPS (Lat/Long)
                    </Box>
                  </MenuItem>
                  <MenuItem value="cartesian">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CartesianIcon fontSize="small" />
                      Cartesian (X/Y/Z)
                    </Box>
                  </MenuItem>
                  <MenuItem value="relative">Relative</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Point Coordinates */}
            {locationType === 'point' && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Point Coordinates
                </Typography>
                {renderCoordinateInputs(pointCoordinates, setPointCoordinates)}
              </Paper>
            )}

            {/* Extent Boundaries */}
            {locationType === 'extent' && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Region Boundary
                </Typography>
                
                {/* Boundary Points */}
                {!useBoundingBox && (
                  <>
                    <List dense>
                      {boundaryPoints.map((point, index) => (
                        <ListItem key={index}>
                          <Box sx={{ flex: 1 }}>
                            {renderCoordinateInputs(point, (coord) => handleUpdateBoundaryPoint(index, coord))}
                          </Box>
                          <IconButton size="small" onClick={() => handleRemoveBoundaryPoint(index)}>
                            <DeleteIcon />
                          </IconButton>
                        </ListItem>
                      ))}
                    </List>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddBoundaryPoint}
                    >
                      Add Boundary Point
                    </Button>
                  </>
                )}

                {/* Bounding Box Option */}
                <Box sx={{ mt: 2 }}>
                  <Button
                    size="small"
                    variant={useBoundingBox ? "contained" : "outlined"}
                    onClick={() => setUseBoundingBox(!useBoundingBox)}
                  >
                    {useBoundingBox ? 'Using Bounding Box' : 'Use Bounding Box Instead'}
                  </Button>
                  
                  {useBoundingBox && coordinateSystem === 'GPS' && (
                    <Grid container spacing={1} sx={{ mt: 1 }}>
                      <Grid item xs={6}>
                        <TextField
                          label="Min Latitude"
                          type="number"
                          size="small"
                          value={boundingBox.minLatitude || ''}
                          onChange={(e) => setBoundingBox({ 
                            ...boundingBox, 
                            minLatitude: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="Max Latitude"
                          type="number"
                          size="small"
                          value={boundingBox.maxLatitude || ''}
                          onChange={(e) => setBoundingBox({ 
                            ...boundingBox, 
                            maxLatitude: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="Min Longitude"
                          type="number"
                          size="small"
                          value={boundingBox.minLongitude || ''}
                          onChange={(e) => setBoundingBox({ 
                            ...boundingBox, 
                            minLongitude: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="Max Longitude"
                          type="number"
                          size="small"
                          value={boundingBox.maxLongitude || ''}
                          onChange={(e) => setBoundingBox({ 
                            ...boundingBox, 
                            maxLongitude: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                  )}
                </Box>
              </Paper>
            )}
          </Box>

          <Divider />

          {/* Type Assignments */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Type Assignments by Persona
            </Typography>
            <Typography variant="caption" color="text.secondary" paragraph>
              Different personas can classify this location with different entity types.
            </Typography>

            {/* Existing assignments */}
            {typeAssignments.length > 0 && (
              <List dense>
                {typeAssignments.map((assignment) => (
                  <ListItem key={assignment.personaId}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip 
                            label={getPersonaName(assignment.personaId)} 
                            size="small" 
                            color="primary"
                          />
                          <Typography variant="body2">classifies as</Typography>
                          <Chip 
                            label={getEntityTypeName(assignment.personaId, assignment.entityTypeId)}
                            size="small"
                            variant="outlined"
                            color="primary"
                            sx={{ fontStyle: 'italic' }}
                          />
                        </Box>
                      }
                    />
                    <IconButton 
                      size="small"
                      onClick={() => handleRemoveTypeAssignment(assignment.personaId)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItem>
                ))}
              </List>
            )}

            {/* Add new assignment */}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <FormControl sx={{ minWidth: 150 }} size="small">
                <InputLabel>Persona</InputLabel>
                <Select
                  value={selectedPersonaId}
                  onChange={(e) => {
                    setSelectedPersonaId(e.target.value)
                    setSelectedEntityTypeId('')
                  }}
                  label="Persona"
                >
                  {personas.map(persona => (
                    <MenuItem key={persona.id} value={persona.id}>
                      {persona.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {selectedPersonaId && (
                <FormControl sx={{ minWidth: 150 }} size="small">
                  <InputLabel>Entity Type</InputLabel>
                  <Select
                    value={selectedEntityTypeId}
                    onChange={(e) => setSelectedEntityTypeId(e.target.value)}
                    label="Entity Type"
                  >
                    {availableEntityTypes.map(type => (
                      <MenuItem key={type.id} value={type.id}>
                        <em>{type.name}</em>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <Button
                variant="outlined"
                size="small"
                onClick={handleAddTypeAssignment}
                disabled={!selectedPersonaId || !selectedEntityTypeId}
              >
                Add
              </Button>
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained"
          color="secondary"
          disabled={!name || description.length === 0}
        >
          {location ? 'Update' : 'Create'} Location
        </Button>
      </DialogActions>
    </Dialog>
  )
}