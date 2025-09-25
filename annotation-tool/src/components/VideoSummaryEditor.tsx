import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useParams } from 'react-router-dom'
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material'
import { Save as SaveIcon } from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import {
  fetchVideoSummaryForPersona,
  saveVideoSummary,
  updateCurrentSummary,
  setCurrentSummary,
} from '../store/videoSummarySlice'
import GlossEditor from './GlossEditor'
import { GlossItem, VideoSummary } from '../models/types'
import { generateId } from '../utils/uuid'
import { debounce } from 'lodash'

interface VideoSummaryEditorProps {
  videoId: string
  personaId: string
  disabled?: boolean
}

export default function VideoSummaryEditor({
  videoId,
  personaId,
  disabled = false,
}: VideoSummaryEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { currentSummary, loading, saving, error } = useSelector(
    (state: RootState) => state.videoSummaries
  )
  const [localSummary, setLocalSummary] = useState<GlossItem[]>([])
  const [hasChanges, setHasChanges] = useState(false)

  // Load summary when component mounts or when video/persona changes
  useEffect(() => {
    if (videoId && personaId) {
      dispatch(fetchVideoSummaryForPersona({ videoId, personaId }))
        .then((result) => {
          if (result.payload) {
            setLocalSummary((result.payload as VideoSummary).summary || [])
          } else {
            // No existing summary, create a new one
            const newSummary: VideoSummary = {
              id: generateId(),
              videoId,
              personaId,
              summary: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
            dispatch(setCurrentSummary(newSummary))
            setLocalSummary([])
          }
        })
    }
  }, [videoId, personaId, dispatch])

  // Debounced save function
  const debouncedSave = debounce(async (summary: GlossItem[]) => {
    if (!currentSummary) {
      // Create new summary
      const newSummary: VideoSummary = {
        id: generateId(),
        videoId,
        personaId,
        summary,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await dispatch(saveVideoSummary(newSummary))
    } else {
      // Update existing summary
      const updatedSummary: VideoSummary = {
        ...currentSummary,
        summary,
        updatedAt: new Date().toISOString(),
      }
      await dispatch(saveVideoSummary(updatedSummary))
    }
    setHasChanges(false)
  }, 1000) // Save after 1 second of no changes

  const handleSummaryChange = (summary: GlossItem[]) => {
    setLocalSummary(summary)
    setHasChanges(true)
    
    // Update Redux state locally (without saving to backend yet)
    if (currentSummary) {
      dispatch(updateCurrentSummary({ summary }))
    }
    
    // Trigger debounced save
    debouncedSave(summary)
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {saving && (
          <>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">
              Saving...
            </Typography>
          </>
        )}
        {!saving && hasChanges && (
          <Typography variant="caption" color="text.secondary">
            Unsaved changes
          </Typography>
        )}
        {!saving && !hasChanges && currentSummary && (
          <Typography variant="caption" color="success.main">
            <SaveIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
            Saved
          </Typography>
        )}
      </Box>
      
      <Paper variant="outlined" sx={{ p: 2 }}>
        <GlossEditor
          gloss={localSummary}
          onChange={handleSummaryChange}
          personaId={personaId}
          videoId={videoId}
          includeAnnotations={true}
          disabled={disabled}
          label="Video Summary"
        />
      </Paper>
    </Box>
  )
}