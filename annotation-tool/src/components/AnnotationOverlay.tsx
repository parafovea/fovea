import { useRef, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Box } from '@mui/material'
import { RootState, AppDispatch } from '../store/store'
import { 
  setTemporaryBox, 
  addAnnotation, 
  clearDrawingState 
} from '../store/annotationSlice'
import { useParams } from 'react-router-dom'

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
  const annotations = useSelector((state: RootState) => {
    const videoAnnotations = state.annotations.annotations[videoId || '']
    // Filter annotations by selected persona if one is selected
    if (selectedPersonaId && videoAnnotations) {
      return videoAnnotations.filter(a => a.personaId === selectedPersonaId)
    }
    return videoAnnotations || []
  })


  const getRelativeCoordinates = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return { x: 0, y: 0 }
    
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * videoWidth,
      y: ((e.clientY - rect.top) / rect.height) * videoHeight,
    }
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingMode) return
    
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
    if (!isDrawing || !drawingMode || !temporaryBox || !videoId || !selectedPersonaId) return
    
    if (temporaryBox.width > 5 && temporaryBox.height > 5) {
      const annotation = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        videoId,
        personaId: selectedPersonaId,
        boundingBox: temporaryBox,
        timeSpan: {
          startTime: currentTime,
          endTime: currentTime + 1,
        },
        typeCategory: drawingMode,
        typeId: 'temp-type',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      
      dispatch(addAnnotation(annotation as any))
    }
    
    setIsDrawing(false)
    dispatch(clearDrawingState())
  }

  const currentAnnotations = annotations.filter(ann => 
    ann.timeSpan.startTime <= currentTime && ann.timeSpan.endTime >= currentTime
  )

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: drawingMode ? 'auto' : 'none',
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          cursor: drawingMode ? 'crosshair' : 'default',
        }}
        viewBox={`0 0 ${videoWidth} ${videoHeight}`}
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {currentAnnotations.map((annotation) => (
          <rect
            key={annotation.id}
            x={annotation.boundingBox.x}
            y={annotation.boundingBox.y}
            width={annotation.boundingBox.width}
            height={annotation.boundingBox.height}
            fill="none"
            stroke={
              annotation.typeCategory === 'entity' ? '#4caf50' :
              annotation.typeCategory === 'role' ? '#2196f3' :
              '#ff9800'
            }
            strokeWidth="2"
            opacity="0.8"
          />
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