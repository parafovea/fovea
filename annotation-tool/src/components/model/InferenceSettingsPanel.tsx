/**
 * Settings panel exposing per-user inference overrides.
 *
 * Renders tabs for the config groups that have user-tunable runtime knobs
 * (sampling / audio / detection). Each field is initialized from the
 * backend-declared default (via ``useModelDefaults``) and, when changed,
 * persisted as an override through ``useInferencePreferences``. Null means
 * "use default" and is sent as an omitted field in request bodies.
 *
 * Framework selectors are read from ``useModelFrameworks`` so enum lists
 * stay in sync with the Python StrEnum definitions.
 */

import { useMemo } from 'react'
import { Cpu, RotateCcw, Settings2, Sparkles, Volume2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useModelDefaults, useModelFrameworks } from '@/store/queries/useModelConfig'
import { useInferencePreferences } from '@/store/preferences/useInferencePreferences'

interface NumericFieldProps {
  label: string
  description: string
  value: number | null
  defaultValue: number
  min: number
  max: number
  step: number
  onChange: (value: number | null) => void
  format?: (n: number) => string
}

function NumericField({
  label,
  description,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
  format = (n) => String(n),
}: NumericFieldProps) {
  const effective = value ?? defaultValue
  const isOverride = value !== null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-sm ${isOverride ? 'font-semibold' : 'text-muted-foreground'}`}>
            {format(effective)}
          </span>
          {isOverride && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                onChange(null)
              }}
              title="Reset to backend default"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <Slider
        value={[effective]}
        onValueChange={(next) => {
          const v = Array.isArray(next) ? next[0] : next
          if (v === null || v === undefined) return
          onChange(v)
        }}
        min={min}
        max={max}
        step={step}
      />
      {!isOverride && (
        <p className="text-xs text-muted-foreground">
          Using backend default <span className="font-mono">{format(defaultValue)}</span>.
        </p>
      )}
    </div>
  )
}

interface IntegerInputFieldProps {
  label: string
  description: string
  value: number | null
  defaultValue: number
  min: number
  max: number
  onChange: (value: number | null) => void
}

function IntegerInputField({
  label,
  description,
  value,
  defaultValue,
  min,
  max,
  onChange,
}: IntegerInputFieldProps) {
  const isOverride = value !== null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {isOverride && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              onChange(null)
            }}
            title="Reset to backend default"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        )}
      </div>
      <Input
        type="number"
        value={value ?? ''}
        placeholder={String(defaultValue)}
        min={min}
        max={max}
        onChange={(event) => {
          const raw = event.target.value
          if (raw === '') {
            onChange(null)
            return
          }
          const parsed = Number(raw)
          if (Number.isFinite(parsed)) {
            onChange(Math.trunc(parsed))
          }
        }}
      />
    </div>
  )
}

export function InferenceSettingsPanel() {
  const defaultsQuery = useModelDefaults()
  const frameworksQuery = useModelFrameworks()
  const {
    preferences,
    setGeneration,
    setAudio,
    setDetection,
    resetAll,
  } = useInferencePreferences()

  const audioComputeOptions = useMemo(
    () => ['float16', 'float32', 'int8', 'int8_float16'] as const,
    []
  )

  if (defaultsQuery.isLoading || frameworksQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (defaultsQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load inference defaults: {defaultsQuery.error.message}
        </AlertDescription>
      </Alert>
    )
  }

  const defaults = defaultsQuery.data
  if (!defaults) {
    return null
  }

  // frameworksQuery is fetched for parity with the defaults call and so that
  // downstream panels (framework selectors) can read the enum list from the
  // same hook without refetching. Not all current controls consume it.
  void frameworksQuery.data

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Inference parameters</h2>
          <p className="text-sm text-muted-foreground">
            Override the backend defaults for sampling, transcription, and detection. Changes
            persist to this browser and are sent with every inference request.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll} title="Clear all overrides">
          <RotateCcw className="mr-2 size-4" />
          Reset all
        </Button>
      </div>

      <Tabs defaultValue="sampling">
        <TabsList className="mb-4">
          <TabsTrigger value="sampling">
            <Sparkles className="size-4" />
            Sampling
          </TabsTrigger>
          <TabsTrigger value="audio">
            <Volume2 className="size-4" />
            Audio
          </TabsTrigger>
          <TabsTrigger value="detection">
            <Cpu className="size-4" />
            Detection
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Settings2 className="size-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sampling" className="space-y-6">
          <NumericField
            label="Temperature"
            description="Lower is more deterministic; higher is more creative."
            value={preferences.generation.temperature}
            defaultValue={defaults.generation.temperature}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => {
              setGeneration({ temperature: v })
            }}
            format={(n) => n.toFixed(2)}
          />
          <NumericField
            label="Top-p"
            description="Nucleus sampling: keep tokens covering this cumulative probability."
            value={preferences.generation.topP}
            defaultValue={defaults.generation.topP}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setGeneration({ topP: v })
            }}
            format={(n) => n.toFixed(2)}
          />
          <IntegerInputField
            label="Max tokens"
            description="Hard cap on generated tokens per request."
            value={preferences.generation.maxTokens}
            defaultValue={defaults.generation.maxTokens}
            min={1}
            max={32768}
            onChange={(v) => {
              setGeneration({ maxTokens: v })
            }}
          />
        </TabsContent>

        <TabsContent value="audio" className="space-y-6">
          <IntegerInputField
            label="Beam size"
            description="Decoder beam width; higher is slower but can improve accuracy."
            value={preferences.audio.beamSize}
            defaultValue={defaults.transcription.beamSize}
            min={1}
            max={10}
            onChange={(v) => {
              setAudio({ beamSize: v })
            }}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Compute precision</Label>
                <p className="text-xs text-muted-foreground">
                  Trade accuracy for throughput. Backend default:{' '}
                  <span className="font-mono">{defaults.transcription.computeType}</span>.
                </p>
              </div>
              {preferences.audio.computeType !== null && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setAudio({ computeType: null })
                  }}
                  title="Reset to backend default"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              )}
            </div>
            <Select
              value={preferences.audio.computeType ?? ''}
              onValueChange={(value) => {
                setAudio({
                  computeType: value as 'float16' | 'float32' | 'int8' | 'int8_float16',
                })
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Default (${defaults.transcription.computeType})`} />
              </SelectTrigger>
              <SelectContent>
                {audioComputeOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <NumericField
            label="VAD threshold"
            description="Voice-activity probability threshold; higher filters out more noise."
            value={preferences.audio.vadThreshold}
            defaultValue={defaults.vad.threshold}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setAudio({ vadThreshold: v })
            }}
            format={(n) => n.toFixed(2)}
          />

          <Separator />

          <h3 className="text-sm font-semibold">Diarization</h3>
          <IntegerInputField
            label="Exact speaker count"
            description={`Leave blank to auto-detect. Backend range ${defaults.diarization.minSpeakers}–${defaults.diarization.maxSpeakers}.`}
            value={preferences.audio.numSpeakers}
            defaultValue={defaults.diarization.numSpeakers ?? 0}
            min={1}
            max={20}
            onChange={(v) => {
              setAudio({ numSpeakers: v })
            }}
          />
          <div className="grid grid-cols-2 gap-4">
            <IntegerInputField
              label="Min speakers"
              description="Lower bound for auto-detect."
              value={preferences.audio.minSpeakers}
              defaultValue={defaults.diarization.minSpeakers}
              min={1}
              max={20}
              onChange={(v) => {
                setAudio({ minSpeakers: v })
              }}
            />
            <IntegerInputField
              label="Max speakers"
              description="Upper bound for auto-detect."
              value={preferences.audio.maxSpeakers}
              defaultValue={defaults.diarization.maxSpeakers}
              min={1}
              max={20}
              onChange={(v) => {
                setAudio({ maxSpeakers: v })
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="detection" className="space-y-6">
          <NumericField
            label="Confidence threshold"
            description="Minimum score required to keep a detection."
            value={preferences.detection.confidenceThreshold}
            defaultValue={defaults.detection.confidenceThreshold}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setDetection({ confidenceThreshold: v })
            }}
            format={(n) => n.toFixed(2)}
          />
          <Alert>
            <AlertDescription>
              The framework ({defaults.detection.framework}) and device (
              {defaults.detection.device}) are selected alongside the model on the Models tab.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Alert>
            <AlertDescription>
              These values are read-only views into the currently active backend config. Override
              them per-request from the Summarize or Detect dialogs.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold">LLM</p>
              <p className="text-muted-foreground">
                Framework: <span className="font-mono">{defaults.llm.framework}</span>
              </p>
              <p className="text-muted-foreground">
                Quantization: <span className="font-mono">{defaults.llm.quantization}</span>
              </p>
              <p className="text-muted-foreground">
                Context length: <span className="font-mono">{defaults.llm.contextLength}</span>
              </p>
            </div>
            <div>
              <p className="font-semibold">VLM</p>
              <p className="text-muted-foreground">
                Framework: <span className="font-mono">{defaults.vlm.framework}</span>
              </p>
              <p className="text-muted-foreground">
                Quantization: <span className="font-mono">{defaults.vlm.quantization}</span>
              </p>
              <p className="text-muted-foreground">
                Trust remote code:{' '}
                <span className="font-mono">{String(defaults.vlm.trustRemoteCode)}</span>
              </p>
            </div>
            <div>
              <p className="font-semibold">Tracking</p>
              <p className="text-muted-foreground">
                Framework: <span className="font-mono">{defaults.tracking.framework}</span>
              </p>
              <p className="text-muted-foreground">
                Device: <span className="font-mono">{defaults.tracking.device}</span>
              </p>
            </div>
            <div>
              <p className="font-semibold">Transcription</p>
              <p className="text-muted-foreground">
                Framework: <span className="font-mono">{defaults.transcription.framework}</span>
              </p>
              <p className="text-muted-foreground">
                Task: <span className="font-mono">{defaults.transcription.task}</span>
              </p>
              <p className="text-muted-foreground">
                Device: <span className="font-mono">{defaults.transcription.device}</span>
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
