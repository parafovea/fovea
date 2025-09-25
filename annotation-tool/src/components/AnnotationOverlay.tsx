import { useRef, useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Box, Tooltip, Chip } from '@mui/material'
import { RootState, AppDispatch } from '../store/store'
import { generateId } from '../utils/uuid'
import { 
  setTemporaryBox, 
  addAnnotation, 
  clearDrawingState,
  selectAnnotation 
} from '../store/annotationSlice'
import { useParams } from 'react-router-dom'
import InteractiveBoundingBox from './annotation/InteractiveBoundingBox'

interface AnnotationOverlayProps {
  videoElement: HTMLVideoElement | null
  currentTime: number
  videoWidth: number
  videoHeight: number
}

export default function AnnotationOverlay({
  videoElement,
  currentTime,
  videoWidth,
  videoHeight,
}: AnnotationOverlayProps) {
  const { videoId } = useParams()
  const dispatch = useDispatch<AppDispatch>()
  const svgRef = useRef<SVGSVGElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })

  const drawingMode = useSelector((state: RootState) => state.annotations.drawingMode)
  const temporaryBox = useSelector((state: RootState) => state.annotations.temporaryBox)
  const selectedPersonaId = useSelector((state: RootState) => state.annotations.selectedPersonaId)
  const selectedTypeId = useSelector((state: RootState) => state.annotations.selectedTypeId)
  const annotationMode = useSelector((state: RootState) => state.annotations.annotationMode)
  const linkTargetId = useSelector((state: RootState) => state.annotations.linkTargetId)
  const linkTargetType = useSelector((state: RootState) => state.annotations.linkTargetType)
  const selectedAnnotation = useSelector((state: RootState) => state.annotations.selectedAnnotation)
  const annotations = useSelector((state: RootState) => {
    const videoAnnotations = state.annotations.annotations[videoId || '']
    // Filter annotations by selected persona if one is selected and in type mode
    if (selectedPersonaId && videoAnnotations && annotationMode === 'type') {
      return videoAnnotations.filter(a => a.personaId === selectedPersonaId)
    }
    return videoAnnotations || []
  })
  
  // Get world objects for linked annotations
  const entities = useSelector((state: RootState) => state.world.entities)
  const events = useSelector((state: RootState) => state.world.events)
  const entityCollections = useSelector((state: RootState) => state.world.entityCollections)
  const eventCollections = useSelector((state: RootState) => state.world.eventCollections)
  const personas = useSelector((state: RootState) => state.persona.personas)


  const getRelativeCoordinates = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return { x: 0, y: 0 }
    
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * videoWidth,
      y: ((e.clientY - rect.top) / rect.height) * videoHeight,
    }
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Check if we're clicking on an existing annotation (not the SVG background)
    if (e.target !== e.currentTarget) return
    
    // In type mode, need both drawing mode and persona
    if (annotationMode === 'type' && (!drawingMode || !selectedPersonaId)) return
    // In object mode, need a link target
    if (annotationMode === 'object' && !linkTargetId) return
    
    const coords = getRelativeCoordinates(e)
    setIsDrawing(true)
    setStartPoint(coords)
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return
    
    const coords = getRelativeCoordinates(e)
    
    const box = {
      x: Math.min(startPoint.x, coords.x),
      y: Math.min(startPoint.y, coords.y),
      width: Math.abs(coords.x - startPoint.x),
      height: Math.abs(coords.y - startPoint.y),
    }
    
    dispatch(setTemporaryBox(box))
  }

  const handleMouseUp = () => {
    if (!isDrawing || !temporaryBox || !videoId) return
    
    // Check requirements based on mode
    if (annotationMode === 'type' && (!drawingMode || !selectedPersonaId)) return
    if (annotationMode === 'object' && !linkTargetId) return
    
    if (temporaryBox.width > 5 && temporaryBox.height > 5) {
      const annotation: any = {
        id: generateId(),
        videoId,
        boundingBox: temporaryBox,
        timeSpan: {
          startTime: currentTime,
          endTime: currentTime + 1,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      
      if (annotationMode === 'type') {
        annotation.personaId = selectedPersonaId
        annotation.typeCategory = drawingMode
        annotation.typeId = selectedTypeId || 'temp-type'
      } else {
        // Object linking mode
        if (linkTargetType === 'entity') {
          annotation.linkedEntityId = linkTargetId
        } else if (linkTargetType === 'event') {
          annotation.linkedEventId = linkTargetId
        } else if (linkTargetType === 'location') {
          annotation.linkedLocationId = linkTargetId
        } else if (linkTargetType?.includes('collection')) {
          annotation.linkedCollectionId = linkTargetId
          annotation.linkedCollectionType = linkTargetType.replace('-collection', '')
        }
      }
      
      dispatch(addAnnotation(annotation))
    }
    
    setIsDrawing(false)
    dispatch(clearDrawingState())
  }

  // Get display info for annotations
  const annotationsWithInfo = useMemo(() => {
    return annotations.filter(ann => 
      ann.timeSpan.startTime <= currentTime && ann.timeSpan.endTime >= currentTime
    ).map(ann => {
      let displayInfo: any = { ...ann }
      
      // Get linked object info
      if (ann.linkedEntityId) {
        const entity = entities.find(e => e.id === ann.linkedEntityId)
        if (entity) {
          displayInfo.linkedObject = entity
          displayInfo.linkedType = 'entity'
        }
      } else if (ann.linkedEventId) {
        const event = events.find(e => e.id === ann.linkedEventId)
        if (event) {
          displayInfo.linkedObject = event
          displayInfo.linkedType = 'event'
        }
      } else if (ann.linkedLocationId) {
        const location = entities.find(e => e.id === ann.linkedLocationId && 'locationType' in e)
        if (location) {
          displayInfo.linkedObject = location
          displayInfo.linkedType = 'location'
        }
      } else if (ann.linkedCollectionId) {
        const collection = ann.linkedCollectionType === 'entity' 
          ? entityCollections.find(c => c.id === ann.linkedCollectionId)
          : eventCollections.find(c => c.id === ann.linkedCollectionId)
        if (collection) {
          displayInfo.linkedObject = collection
          displayInfo.linkedType = `${ann.linkedCollectionType}-collection`
        }
      }
      
      return displayInfo
    })
  }, [annotations, currentTime, entities, events, entityCollections, eventCollections])

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'auto', // Always allow pointer events so existing annotations can be interacted with
        zIndex: 2, // Ensure overlay is above video but allows video to show through
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          cursor: ((annotationMode === 'type' && drawingMode) || 
                   (annotationMode === 'object' && linkTargetId))
                   ? 'crosshair' : 'default',
          backgroundColor: 'transparent',
        }}
        viewBox={`0 0 ${videoWidth} ${videoHeight}`}
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {annotationsWithInfo.map((ann) => (
          <g key={ann.id} style={{ pointerEvents: 'auto' }}>
            <InteractiveBoundingBox
              annotation={ann}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
              isActive={selectedAnnotation?.id === ann.id}
              onSelect={() => dispatch(selectAnnotation(ann))}
            />
          </g>
        ))}
        
        {temporaryBox && (
          <rect
            x={temporaryBox.x}
            y={temporaryBox.y}
            width={temporaryBox.width}
            height={temporaryBox.height}
            fill="none"
            stroke="#f50057"
            strokeWidth="2"
            strokeDasharray="5,5"
            opacity="0.8"
          />
        )}
      </svg>
    </Box>
  )
}