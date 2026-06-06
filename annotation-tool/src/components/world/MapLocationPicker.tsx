import { useState, useEffect } from 'react'
import {
  MapPin,
  Maximize2,
  Crosshair,
  Map,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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

interface MapInteractionProps {
  mode: 'point' | 'extent'
  onPointClick: (latlng: L.LatLng) => void
  onPolygonComplete: (polygon: L.LatLng[]) => void
  pointCoordinate: Coordinate | null
  polygonCoordinates: Coordinate[]
  drawing: boolean
  setDrawing: (drawing: boolean) => void
  setPolygonCoordinates: (coords: Coordinate[]) => void
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
}: MapInteractionProps) {
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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Map className="size-5 text-primary" />
            Select Location on Map
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4" style={{ height: '600px' }}>
          {/* Mode selector and instructions */}
          <div className="flex items-center justify-between">
            <ToggleGroup
              value={[mode]}
              onValueChange={(value) => {
                if (value.length > 0) {
                  setMode(value[0] as 'point' | 'extent')
                  handleClearSelection()
                }
              }}
              size="sm"
            >
              <ToggleGroupItem value="point" className="flex items-center gap-1">
                <MapPin className="size-4" />
                Point
              </ToggleGroupItem>
              <ToggleGroupItem value="extent" className="flex items-center gap-1">
                <Maximize2 className="size-4" />
                Region
              </ToggleGroupItem>
            </ToggleGroup>

            {mode === 'extent' && !drawing && polygonCoordinates.length === 0 && (
              <Button
                size="sm"
                onClick={handleStartDrawing}
              >
                <Maximize2 className="mr-1 size-4" />
                Start Drawing Region
              </Button>
            )}

            {(hasSelection || drawing) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearSelection}
                className="text-destructive"
              >
                Clear Selection
              </Button>
            )}
          </div>

          {/* Instructions */}
          <Alert className="py-1">
            <AlertDescription>
              {mode === 'point' && "Click anywhere on the map to set a point location."}
              {mode === 'extent' && !drawing && polygonCoordinates.length === 0 &&
                "Click 'Start Drawing Region' then click on the map to draw polygon vertices. Double-click to finish."}
              {mode === 'extent' && drawing &&
                "Click on the map to add polygon vertices. Double-click to complete the region."}
              {mode === 'extent' && !drawing && polygonCoordinates.length > 0 &&
                "Region selected. Click 'Clear Selection' to redraw."}
            </AlertDescription>
          </Alert>

          {/* Map */}
          <div className="relative flex-1 rounded-lg border shadow-sm">
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
              <div
                className="absolute bottom-2.5 left-2.5 z-[1000] rounded-md bg-white/90 p-2"
              >
                <span className="text-xs text-muted-foreground">
                  Lat: {hoveredCoordinates.lat.toFixed(6)}, Lng: {hoveredCoordinates.lng.toFixed(6)}
                </span>
              </div>
            )}

            {/* Selection display */}
            {hasSelection && (
              <div
                className="absolute top-2.5 right-2.5 z-[1000] rounded-md bg-white/90 p-2"
              >
                {mode === 'point' && pointCoordinate.latitude && (
                  <Badge>
                    <Crosshair className="mr-1 size-3" />
                    {pointCoordinate.latitude.toFixed(6)}, {pointCoordinate.longitude?.toFixed(6)}
                  </Badge>
                )}
                {mode === 'extent' && polygonCoordinates.length > 0 && (
                  <Badge>
                    <Maximize2 className="mr-1 size-3" />
                    {polygonCoordinates.length} vertices
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!hasSelection}
          >
            Confirm Selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
