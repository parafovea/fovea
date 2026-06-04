/**
 * Configuration panel for audio processing options during video summarization.
 * Allows users to enable audio transcription, speaker diarization, and select fusion strategy.
 */

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AudioConfig, FusionStrategy } from './types'

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
  const handleEnableAudioChange = (checked: boolean) => {
    onChange({
      ...config,
      enableAudio: checked,
      enableSpeakerDiarization: checked ? config.enableSpeakerDiarization : false,
    })
  }

  const handleEnableDiarizationChange = (checked: boolean) => {
    onChange({
      ...config,
      enableSpeakerDiarization: checked,
    })
  }

  const handleFusionStrategyChange = (value: string) => {
    onChange({
      ...config,
      fusionStrategy: value as FusionStrategy,
    })
  }

  const handleLanguageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim()
    onChange({
      ...config,
      audioLanguage: value || undefined,
    })
  }

  const selectedStrategy = FUSION_STRATEGIES.find((s) => s.value === config.fusionStrategy)

  return (
    <div className="flex flex-col gap-4" data-tour-id="audio-config-panel">
      <p className="text-sm font-medium text-muted-foreground">
        Audio Processing Options
      </p>

      <Label className="flex items-center gap-2">
        <Checkbox
          checked={config.enableAudio}
          onCheckedChange={handleEnableAudioChange}
          disabled={disabled}
        />
        Enable Audio Transcription
      </Label>

      <Label className="ml-6 flex items-center gap-2">
        <Checkbox
          checked={config.enableSpeakerDiarization}
          onCheckedChange={handleEnableDiarizationChange}
          disabled={disabled || !config.enableAudio}
        />
        Enable Speaker Diarization
      </Label>

      <div className="flex flex-col gap-1">
        <Label htmlFor="fusion-strategy">Fusion Strategy</Label>
        <Select
          value={config.fusionStrategy}
          onValueChange={(v) => v && handleFusionStrategyChange(v)}
          disabled={disabled || !config.enableAudio}
        >
          <SelectTrigger className="w-full" id="fusion-strategy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FUSION_STRATEGIES.map((strategy) => (
              <SelectItem key={strategy.value} value={strategy.value}>
                {strategy.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedStrategy && (
          <p className="text-xs text-muted-foreground">{selectedStrategy.description}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="audio-language">Audio Language (optional)</Label>
        <Input
          id="audio-language"
          value={config.audioLanguage || ''}
          onChange={handleLanguageChange}
          disabled={disabled || !config.enableAudio}
          placeholder="en"
        />
        <p className="text-xs text-muted-foreground">
          ISO language code (e.g., 'en', 'es', 'fr'). Leave empty for auto-detection.
        </p>
      </div>
    </div>
  )
}
