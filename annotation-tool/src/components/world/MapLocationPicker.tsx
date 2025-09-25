import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  Chip,
} from '@mui/material'
import {
  Map as MapIcon,
  PinDrop as PointIcon,
  CropFree as ExtentIcon,
  MyLocation as LocationIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import { MapContainer, TileLayer, Marker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default marker icon issue with Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface Coordinate {
  latitude?: number
  longitude?: number
  altitude?: number
  x?: number
  y?: number
  z?: number
}

interface MapLocationPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (coordinates: Coordinate | Coordinate[], type: 'point' | 'extent') => void
  initialCoordinates?: Coordinate | Coordinate[]
  locationType?: 'point' | 'extent'
  coordinateSystem?: 'GPS' | 'cartesian' | 'relative'
}

// Component to handle map interactions
function MapInteraction({ 
  mode, 
  onPointClick, 
  onPolygonComplete,
  pointCoordinate,
  polygonCoordinates,
  drawing,
  setDrawing,
  setPolygonCoordinates,
}: any) {
  const map = useMap()
  const [tempPolygon, setTempPolygon] = useState<L.LatLng[]>([])

  useMapEvents({
    click: (e) => {
      if (mode === 'point') {
        onPointClick(e.latlng)
      } else if (mode === 'extent' && drawing) {
        const newPoint = e.latlng
        const updatedPolygon = [...tempPolygon, newPoint]
        setTempPolygon(updatedPolygon)
        setPolygonCoordinates(updatedPolygon.map(ll => ({ latitude: ll.lat, longitude: ll.lng })))
      }
    },
    dblclick: (e) => {
      if (mode === 'extent' && drawing && tempPolygon.length >= 3) {
        L.DomEvent.stop(e)
        setDrawing(false)
        onPolygonComplete(tempPolygon)
        setTempPolygon([])
      }
    }
  })

  // Center map on initial coordinates if available
  useEffect(() => {
    if (pointCoordinate && pointCoordinate.latitude && pointCoordinate.longitude) {
      map.setView([pointCoordinate.latitude, pointCoordinate.longitude], 13)
    } else if (polygonCoordinates && polygonCoordinates.length > 0) {
      const bounds = L.latLngBounds(
        polygonCoordinates
          .filter((c: Coordinate) => c.latitude && c.longitude)
          .map((c: Coordinate) => [c.latitude!, c.longitude!])
      )
      if (bounds.isValid()) {
        map.fitBounds(bounds)
      }
    }
  }, [map, pointCoordinate, polygonCoordinates])

  return (
    <>
      {/* Show temporary polygon while drawing */}
      {drawing && tempPolygon.length > 0 && (
        <Polyline 
          positions={tempPolygon.map(ll => [ll.lat, ll.lng])}
          pathOptions={{ color: 'blue', dashArray: '10, 10' }}
        />
      )}
    </>
  )
}

export default function MapLocationPicker({
  open,
  onClose,
  onSelect,
  initialCoordinates,
  locationType = 'point',
  coordinateSystem = 'GPS',
}: MapLocationPickerProps) {
  const [mode, setMode] = useState<'point' | 'extent'>(locationType)
  const [pointCoordinate, setPointCoordinate] = useState<Coordinate>({})
  const [polygonCoordinates, setPolygonCoordinates] = useState<Coordinate[]>([])
  const [drawing, setDrawing] = useState(false)
  const [hoveredCoordinates, setHoveredCoordinates] = useState<{ lat: number, lng: number } | null>(null)

  useEffect(() => {
    if (initialCoordinates) {
      if (Array.isArray(initialCoordinates)) {
        setPolygonCoordinates(initialCoordinates)
        setMode('extent')
      } else {
        setPointCoordinate(initialCoordinates)
        setMode('point')
      }
    }
  }, [initialCoordinates])

  const handlePointClick = (latlng: L.LatLng) => {
    const coord: Coordinate = coordinateSystem === 'GPS' 
      ? { latitude: latlng.lat, longitude: latlng.lng }
      : { x: latlng.lng, y: latlng.lat } // Simple conversion for demo
    setPointCoordinate(coord)
  }

  const handlePolygonComplete = (points: L.LatLng[]) => {
    const coords = points.map(p => 
      coordinateSystem === 'GPS'
        ? { latitude: p.lat, longitude: p.lng }
        : { x: p.lng, y: p.lat }
    )
    setPolygonCoordinates(coords)
  }

  const handleStartDrawing = () => {
    setDrawing(true)
    setPolygonCoordinates([])
  }

  const handleClearSelection = () => {
    setPointCoordinate({})
    setPolygonCoordinates([])
    setDrawing(false)
  }

  const handleConfirm = () => {
    if (mode === 'point' && (pointCoordinate.latitude || pointCoordinate.x)) {
      onSelect(pointCoordinate, 'point')
    } else if (mode === 'extent' && polygonCoordinates.length >= 3) {
      onSelect(polygonCoordinates, 'extent')
    }
    onClose()
  }

  const hasSelection = mode === 'point' 
    ? (pointCoordinate.latitude !== undefined || pointCoordinate.x !== undefined)
    : polygonCoordinates.length >= 3

  // Component to track mouse position
  function MouseTracker() {
    useMapEvents({
      mousemove: (e) => {
        setHoveredCoordinates({ lat: e.latlng.lat, lng: e.latlng.lng })
      },
      mouseout: () => {
        setHoveredCoordinates(null)
      }
    })
    return null
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MapIcon color="primary" />
          Select Location on Map
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '600px' }}>
          {/* Mode selector and instructions */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={(_, value) => {
                if (value) {
                  setMode(value)
                  handleClearSelection()
                }
              }}
              size="small"
            >
              <ToggleButton value="point">
                <PointIcon sx={{ mr: 1 }} />
                Point
              </ToggleButton>
              <ToggleButton value="extent">
                <ExtentIcon sx={{ mr: 1 }} />
                Region
              </ToggleButton>
            </ToggleButtonGroup>

            {mode === 'extent' && !drawing && polygonCoordinates.length === 0 && (
              <Button
                variant="contained"
                size="small"
                onClick={handleStartDrawing}
                startIcon={<ExtentIcon />}
              >
                Start Drawing Region
              </Button>
            )}

            {(hasSelection || drawing) && (
              <Button
                variant="outlined"
                size="small"
                onClick={handleClearSelection}
                color="error"
              >
                Clear Selection
              </Button>
            )}
          </Box>

          {/* Instructions */}
          <Alert severity="info" sx={{ py: 0.5 }}>
            {mode === 'point' && "Click anywhere on the map to set a point location."}
            {mode === 'extent' && !drawing && polygonCoordinates.length === 0 && 
              "Click 'Start Drawing Region' then click on the map to draw polygon vertices. Double-click to finish."}
            {mode === 'extent' && drawing && 
              "Click on the map to add polygon vertices. Double-click to complete the region."}
            {mode === 'extent' && !drawing && polygonCoordinates.length > 0 &&
              "Region selected. Click 'Clear Selection' to redraw."}
          </Alert>

          {/* Map */}
          <Paper elevation={2} sx={{ flex: 1, position: 'relative' }}>
            <MapContainer
              center={[20, 0]}
              zoom={2}
              style={{ height: '100%', width: '100%' }}
              doubleClickZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              <MapInteraction
                mode={mode}
                onPointClick={handlePointClick}
                onPolygonComplete={handlePolygonComplete}
                pointCoordinate={pointCoordinate}
                polygonCoordinates={polygonCoordinates}
                drawing={drawing}
                setDrawing={setDrawing}
                setPolygonCoordinates={setPolygonCoordinates}
              />

              <MouseTracker />

              {/* Display selected point */}
              {mode === 'point' && pointCoordinate.latitude && pointCoordinate.longitude && (
                <Marker position={[pointCoordinate.latitude, pointCoordinate.longitude]} />
              )}

              {/* Display selected polygon */}
              {mode === 'extent' && polygonCoordinates.length >= 3 && !drawing && (
                <Polygon 
                  positions={polygonCoordinates
                    .filter(c => c.latitude && c.longitude)
                    .map(c => [c.latitude!, c.longitude!])}
                  pathOptions={{ color: 'blue', fillColor: 'lightblue', fillOpacity: 0.3 }}
                />
              )}
            </MapContainer>

            {/* Coordinate display overlay */}
            {hoveredCoordinates && (
              <Paper
                sx={{
                  position: 'absolute',
                  bottom: 10,
                  left: 10,
                  zIndex: 1000,
                  p: 1,
                  backgroundColor: 'rgba(255,255,255,0.9)',
                }}
              >
                <Typography variant="caption">
                  Lat: {hoveredCoordinates.lat.toFixed(6)}, Lng: {hoveredCoordinates.lng.toFixed(6)}
                </Typography>
              </Paper>
            )}

            {/* Selection display */}
            {hasSelection && (
              <Paper
                sx={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  zIndex: 1000,
                  p: 1,
                  backgroundColor: 'rgba(255,255,255,0.9)',
                }}
              >
                {mode === 'point' && pointCoordinate.latitude && (
                  <Box>
                    <Chip 
                      icon={<LocationIcon />} 
                      label={`${pointCoordinate.latitude.toFixed(6)}, ${pointCoordinate.longitude?.toFixed(6)}`}
                      size="small"
                      color="primary"
                    />
                  </Box>
                )}
                {mode === 'extent' && polygonCoordinates.length > 0 && (
                  <Chip 
                    icon={<ExtentIcon />} 
                    label={`${polygonCoordinates.length} vertices`}
                    size="small"
                    color="primary"
                  />
                )}
              </Paper>
            )}
          </Paper>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained"
          disabled={!hasSelection}
        >
          Confirm Selection
        </Button>
      </DialogActions>
    </Dialog>
  )
}