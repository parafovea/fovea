/**
 * Configuration panel for audio processing options during video summarization.
 * Allows users to enable audio transcription, speaker diarization, and select fusion strategy.
 */

import {
  Box,
  FormControlLabel,
  Checkbox,
  TextField,
  MenuItem,
  Typography,
} from '@mui/material'
import { AudioConfig, FusionStrategy } from './types.js'

/**
 * Props for AudioConfigPanel component.
 */
export interface AudioConfigPanelProps {
  /** Current audio configuration. */
  config: AudioConfig
  /** Callback invoked when configuration changes. */
  onChange: (config: AudioConfig) => void
  /** Whether the panel is disabled (e.g., during processing). */
  disabled?: boolean
}

const FUSION_STRATEGIES: { value: FusionStrategy; label: string; description: string }[] = [
  {
    value: 'sequential',
    label: 'Sequential',
    description: 'Process audio and visual independently, then concatenate results',
  },
  {
    value: 'timestampAligned',
    label: 'Timestamp Aligned',
    description: 'Synchronize audio and visual events by timestamp for temporal coherence',
  },
  {
    value: 'nativeMultimodal',
    label: 'Native Multimodal',
    description: 'Use multimodal models (Gemini, GPT-4o) for single-pass processing',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'Adaptive selection based on audio density and speaker count',
  },
]

/**
 * Panel for configuring audio processing options.
 * Provides controls for enabling audio transcription, speaker diarization, fusion strategy selection, and language specification.
 *
 * @param props - Component properties
 * @returns AudioConfigPanel component
 *
 * @example
 * ```tsx
 * const [audioConfig, setAudioConfig] = useState<AudioConfig>({
 *   enableAudio: false,
 *   enableSpeakerDiarization: false,
 *   fusionStrategy: 'sequential',
 * })
 *
 * <AudioConfigPanel
 *   config={audioConfig}
 *   onChange={setAudioConfig}
 *   disabled={isProcessing}
 * />
 * ```
 */
export function AudioConfigPanel({ config, onChange, disabled = false }: AudioConfigPanelProps) {
  const handleEnableAudioChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const enableAudio = event.target.checked
    onChange({
      ...config,
      enableAudio,
      enableSpeakerDiarization: enableAudio ? config.enableSpeakerDiarization : false,
    })
  }

  const handleEnableDiarizationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      enableSpeakerDiarization: event.target.checked,
    })
  }

  const handleFusionStrategyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      fusionStrategy: event.target.value as FusionStrategy,
    })
  }

  const handleLanguageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim()
    onChange({
      ...config,
      audioLanguage: value || undefined,
    })
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        Audio Processing Options
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={config.enableAudio}
            onChange={handleEnableAudioChange}
            disabled={disabled}
          />
        }
        label="Enable Audio Transcription"
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={config.enableSpeakerDiarization}
            onChange={handleEnableDiarizationChange}
            disabled={disabled || !config.enableAudio}
          />
        }
        label="Enable Speaker Diarization"
        sx={{ ml: 3 }}
      />

      <TextField
        select
        label="Fusion Strategy"
        value={config.fusionStrategy}
        onChange={handleFusionStrategyChange}
        disabled={disabled || !config.enableAudio}
        helperText={
          FUSION_STRATEGIES.find((s) => s.value === config.fusionStrategy)?.description
        }
        fullWidth
      >
        {FUSION_STRATEGIES.map((strategy) => (
          <MenuItem key={strategy.value} value={strategy.value}>
            {strategy.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label="Audio Language (optional)"
        value={config.audioLanguage || ''}
        onChange={handleLanguageChange}
        disabled={disabled || !config.enableAudio}
        helperText="ISO language code (e.g., 'en', 'es', 'fr'). Leave empty for auto-detection."
        fullWidth
        placeholder="en"
      />
    </Box>
  )
}
