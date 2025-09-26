import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import {
  Edit as EditIcon,
  Language as WikidataIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material'

interface ModeSelectorProps {
  mode: 'manual' | 'copy' | 'wikidata'
  onChange: (newMode: 'manual' | 'copy' | 'wikidata') => void
  showCopy?: boolean
  disabled?: boolean
}

export default function ModeSelector({ mode, onChange, showCopy = true, disabled = false }: ModeSelectorProps) {
  return (
    <ToggleButtonGroup
      value={mode}
      exclusive
      onChange={(_, newMode) => newMode && onChange(newMode)}
      fullWidth
      size="small"
      disabled={disabled}
    >
      <ToggleButton value="manual">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EditIcon fontSize="small" />
          <Typography variant="body2">Manual Entry</Typography>
        </Box>
      </ToggleButton>
      {showCopy && (
        <ToggleButton value="copy">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CopyIcon fontSize="small" />
            <Typography variant="body2">Copy from Existing</Typography>
          </Box>
        </ToggleButton>
      )}
      <ToggleButton value="wikidata">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WikidataIcon fontSize="small" />
          <Typography variant="body2">Import from Wikidata</Typography>
        </Box>
      </ToggleButton>
    </ToggleButtonGroup>
  )
}