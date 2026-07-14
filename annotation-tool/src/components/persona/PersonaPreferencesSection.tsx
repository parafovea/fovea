/**
 * Persona-scoped inference preferences section rendered inside
 * :class:`PersonaEditor`. Lets the user pin a handful of inference knobs to
 * a specific persona; unset fields inherit from the user-level document.
 *
 * Shows the three most-common per-persona overrides by default
 * (temperature, max tokens, detection confidence). The full matrix is
 * editable from Settings → Inference so this panel stays compact.
 *
 * Values save on change via the ``usePersonaPreferences`` mutation. A
 * small "Reset overrides" button clears every persona-specific value.
 */

import { useEffect, useState } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import type { PersonaInferenceOverrides } from '@/api/client'
import { useModelDefaults } from '@/store/queries/useModelConfig'
import { usePersonaPreferences } from '@/store/preferences/useInferencePreferences'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

interface Props {
  personaId: string
}

export function PersonaPreferencesSection({ personaId }: Props) {
  const sectionAnchorRef = useTourAnchor('persona-preferences-section')
  const { data: defaults } = useModelDefaults()
  const { overrides, isLoading, setOverrides, resetAll } = usePersonaPreferences(personaId)
  const [expanded, setExpanded] = useState(false)

  const [temperature, setTemperature] = useState<number | null>(null)
  const [maxTokens, setMaxTokens] = useState<number | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)

  useEffect(() => {
    setTemperature(overrides.generation?.temperature ?? null)
    setMaxTokens(overrides.generation?.maxTokens ?? null)
    setConfidence(overrides.detection?.confidenceThreshold ?? null)
  }, [overrides])

  const pinnedCount =
    (overrides.generation?.temperature !== undefined ? 1 : 0) +
    (overrides.generation?.maxTokens !== undefined ? 1 : 0) +
    (overrides.detection?.confidenceThreshold !== undefined ? 1 : 0)

  if (!defaults) return null

  const commit = (next: PersonaInferenceOverrides) => {
    setOverrides(next)
  }

  return (
    <div className="space-y-3" ref={sectionAnchorRef}>
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium select-none"
        onClick={() => {
          setExpanded((prev) => !prev)
        }}
      >
        <SlidersHorizontal className="size-4" />
        Inference overrides {expanded ? '▾' : '▸'}
        {pinnedCount > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {pinnedCount} pinned
          </span>
        )}
      </button>

      {expanded && !isLoading && (
        <div className="space-y-4 rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            Persona overrides win over your user-level preferences and the backend default. Leave
            a field blank to inherit from your user settings.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">
                  {temperature !== null
                    ? temperature.toFixed(2)
                    : `inherit (${defaults.generation.temperature.toFixed(2)})`}
                </span>
                {temperature !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setTemperature(null)
                      commit({
                        ...overrides,
                        generation: { ...(overrides.generation ?? {}), temperature: undefined },
                      })
                    }}
                    title="Clear override"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <Slider
              value={[temperature ?? defaults.generation.temperature]}
              min={0}
              max={2}
              step={0.05}
              onValueChange={(next) => {
                const v = Array.isArray(next) ? next[0] : next
                if (v === undefined) return
                setTemperature(v)
                commit({
                  ...overrides,
                  generation: { ...(overrides.generation ?? {}), temperature: v },
                })
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`max-tokens-${personaId}`}>Max tokens</Label>
              {maxTokens !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setMaxTokens(null)
                    commit({
                      ...overrides,
                      generation: { ...(overrides.generation ?? {}), maxTokens: undefined },
                    })
                  }}
                  title="Clear override"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              )}
            </div>
            <Input
              id={`max-tokens-${personaId}`}
              type="number"
              min={1}
              max={32768}
              placeholder={`inherit (${defaults.generation.maxTokens})`}
              value={maxTokens ?? ''}
              onChange={(event) => {
                const raw = event.target.value
                if (raw === '') {
                  setMaxTokens(null)
                  commit({
                    ...overrides,
                    generation: { ...(overrides.generation ?? {}), maxTokens: undefined },
                  })
                  return
                }
                const parsed = Math.trunc(Number(raw))
                if (Number.isFinite(parsed)) {
                  setMaxTokens(parsed)
                  commit({
                    ...overrides,
                    generation: { ...(overrides.generation ?? {}), maxTokens: parsed },
                  })
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Detection confidence</Label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">
                  {confidence !== null
                    ? confidence.toFixed(2)
                    : `inherit (${defaults.detection.confidenceThreshold.toFixed(2)})`}
                </span>
                {confidence !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setConfidence(null)
                      commit({
                        ...overrides,
                        detection: {
                          ...(overrides.detection ?? {}),
                          confidenceThreshold: undefined,
                        },
                      })
                    }}
                    title="Clear override"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <Slider
              value={[confidence ?? defaults.detection.confidenceThreshold]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={(next) => {
                const v = Array.isArray(next) ? next[0] : next
                if (v === undefined) return
                setConfidence(v)
                commit({
                  ...overrides,
                  detection: {
                    ...(overrides.detection ?? {}),
                    confidenceThreshold: v,
                  },
                })
              }}
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTemperature(null)
                setMaxTokens(null)
                setConfidence(null)
                resetAll()
              }}
              disabled={pinnedCount === 0}
            >
              <RotateCcw className="mr-2 size-3.5" />
              Reset all overrides
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
