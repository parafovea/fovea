/**
 * Admin-only settings panel for the SystemConfig key-value store.
 *
 * Renders one sub-tab per config key (``storagePaths``, ``runtime``,
 * ``externalApis``). Each tab is a small form wired to the
 * ``useUpdateSystemConfig`` mutation — submission posts to
 * ``PUT /api/admin/config/:key`` which propagates to the model-service
 * before acknowledging.
 *
 * Non-admin users never see this panel; Settings.tsx mounts it inside an
 * admin-gated tab.
 */

import { useEffect, useMemo, useState } from 'react'
import { HardDrive, Cpu, Globe, RefreshCw, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SystemConfigRow, SystemConfigRowStored } from '@/api/client'
import {
  useReplaySystemConfig,
  useSystemConfig,
  useUpdateSystemConfig,
} from '@/store/queries/useSystemConfig'

function findRow<K extends SystemConfigRow['key']>(
  rows: SystemConfigRowStored[],
  key: K
): Extract<SystemConfigRowStored, { key: K }> | undefined {
  return rows.find((row): row is Extract<SystemConfigRowStored, { key: K }> => row.key === key)
}

function StoragePathsForm({
  initial,
}: {
  initial: Extract<SystemConfigRowStored, { key: 'storagePaths' }>
}) {
  const [videoRoot, setVideoRoot] = useState(initial.value.videoDataRoot)
  const [thumbRoot, setThumbRoot] = useState(initial.value.thumbnailOutputRoot)
  const [audioRoot, setAudioRoot] = useState(initial.value.audioOutputRoot)

  useEffect(() => {
    setVideoRoot(initial.value.videoDataRoot)
    setThumbRoot(initial.value.thumbnailOutputRoot)
    setAudioRoot(initial.value.audioOutputRoot)
  }, [initial])

  const update = useUpdateSystemConfig({
    onSuccess: () => {
      toast.success('Storage paths applied to the model-service')
    },
    onError: (err) => {
      toast.error(`Could not apply storage paths: ${err.message}`)
    },
  })

  const dirty =
    videoRoot !== initial.value.videoDataRoot ||
    thumbRoot !== initial.value.thumbnailOutputRoot ||
    audioRoot !== initial.value.audioOutputRoot

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        update.mutate({
          key: 'storagePaths',
          value: {
            videoDataRoot: videoRoot,
            thumbnailOutputRoot: thumbRoot,
            audioOutputRoot: audioRoot,
          },
        })
      }}
    >
      <Alert>
        <AlertDescription>
          These paths must exist inside the model-service container. They are applied via
          ``reconfigure_roots`` without a service restart.
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label htmlFor="video-root">Video data root</Label>
        <Input
          id="video-root"
          value={videoRoot}
          onChange={(event) => {
            setVideoRoot(event.target.value)
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="thumb-root">Thumbnail output root</Label>
        <Input
          id="thumb-root"
          value={thumbRoot}
          onChange={(event) => {
            setThumbRoot(event.target.value)
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="audio-root">Audio output root</Label>
        <Input
          id="audio-root"
          value={audioRoot}
          onChange={(event) => {
            setAudioRoot(event.target.value)
          }}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={!dirty || update.isPending}>
          {update.isPending ? 'Applying...' : 'Apply paths'}
        </Button>
      </div>
    </form>
  )
}

function RuntimeForm({
  initial,
}: {
  initial: Extract<SystemConfigRowStored, { key: 'runtime' }>
}) {
  const [cudaDevice, setCudaDevice] = useState(initial.value.cudaDevice)
  const [warmup, setWarmup] = useState(initial.value.warmupOnStartup)
  const [defaultBatch, setDefaultBatch] = useState(initial.value.defaultBatchSize)
  const [maxBatch, setMaxBatch] = useState(initial.value.maxBatchSize)
  const [offload, setOffload] = useState(initial.value.offloadThreshold)
  const [maxVideoFrames, setMaxVideoFrames] = useState(initial.value.maxVideoFrames)
  const [frameSampleRate, setFrameSampleRate] = useState(initial.value.frameSampleRate)
  const [vlmMaxSummaryTokens, setVlmMaxSummaryTokens] = useState(initial.value.vlmMaxSummaryTokens)
  const [llmMaxClaimsTokens, setLlmMaxClaimsTokens] = useState(initial.value.llmMaxClaimsTokens)
  const [llmMaxSynthesisTokens, setLlmMaxSynthesisTokens] = useState(initial.value.llmMaxSynthesisTokens)
  const [llmMaxOntologyTokens, setLlmMaxOntologyTokens] = useState(initial.value.llmMaxOntologyTokens)

  useEffect(() => {
    setCudaDevice(initial.value.cudaDevice)
    setWarmup(initial.value.warmupOnStartup)
    setDefaultBatch(initial.value.defaultBatchSize)
    setMaxBatch(initial.value.maxBatchSize)
    setOffload(initial.value.offloadThreshold)
    setMaxVideoFrames(initial.value.maxVideoFrames)
    setFrameSampleRate(initial.value.frameSampleRate)
    setVlmMaxSummaryTokens(initial.value.vlmMaxSummaryTokens)
    setLlmMaxClaimsTokens(initial.value.llmMaxClaimsTokens)
    setLlmMaxSynthesisTokens(initial.value.llmMaxSynthesisTokens)
    setLlmMaxOntologyTokens(initial.value.llmMaxOntologyTokens)
  }, [initial])

  const update = useUpdateSystemConfig({
    onSuccess: () => {
      toast.success('Runtime config applied to the model-service')
    },
    onError: (err) => {
      toast.error(`Could not apply runtime config: ${err.message}`)
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        update.mutate({
          key: 'runtime',
          value: {
            cudaDevice,
            warmupOnStartup: warmup,
            defaultBatchSize: defaultBatch,
            maxBatchSize: maxBatch,
            offloadThreshold: offload,
            maxVideoFrames,
            frameSampleRate,
            vlmMaxSummaryTokens,
            llmMaxClaimsTokens,
            llmMaxSynthesisTokens,
            llmMaxOntologyTokens,
          },
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="cuda-device">CUDA device</Label>
        <Input
          id="cuda-device"
          value={cudaDevice}
          onChange={(event) => {
            setCudaDevice(event.target.value)
          }}
          placeholder="cuda, cuda:0, cpu, ..."
        />
        <p className="text-xs text-muted-foreground">
          Applies to models loaded after this change. Already-loaded models stay on their current
          device until unloaded.
        </p>
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="warmup">Warm up on startup</Label>
          <p className="text-xs text-muted-foreground">
            Pre-load selected models when the service boots.
          </p>
        </div>
        <Switch id="warmup" checked={warmup} onCheckedChange={setWarmup} />
      </div>
      <Separator />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="default-batch">Default batch size</Label>
          <Input
            id="default-batch"
            type="number"
            min={1}
            max={128}
            value={defaultBatch}
            onChange={(event) => {
              setDefaultBatch(Number(event.target.value))
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max-batch">Max batch size</Label>
          <Input
            id="max-batch"
            type="number"
            min={1}
            max={128}
            value={maxBatch}
            onChange={(event) => {
              setMaxBatch(Number(event.target.value))
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="offload">Offload threshold</Label>
        <Input
          id="offload"
          type="number"
          step={0.01}
          min={0}
          max={1}
          value={offload}
          onChange={(event) => {
            setOffload(Number(event.target.value))
          }}
        />
        <p className="text-xs text-muted-foreground">
          VRAM usage fraction above which the manager starts offloading idle models (0–1).
        </p>
      </div>
      <Separator />
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Video summarization (VLM)</h3>
          <p className="text-xs text-muted-foreground">
            Per-request budget the VLM summarizer applies. CPU deployments typically run 3-5
            frames per summary; GPU deployments can push to 30+. Lower values trade detail for
            wall-clock latency.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="max-video-frames">Max frames per summary</Label>
            <Input
              id="max-video-frames"
              type="number"
              min={1}
              max={100}
              value={maxVideoFrames}
              onChange={(event) => {
                setMaxVideoFrames(Number(event.target.value))
              }}
            />
            <p className="text-xs text-muted-foreground">
              Hard cap. Even when a client requests more, the model-service downsamples.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="frame-sample-rate">Frame sample rate (fps)</Label>
            <Input
              id="frame-sample-rate"
              type="number"
              min={1}
              max={10}
              value={frameSampleRate}
              onChange={(event) => {
                setFrameSampleRate(Number(event.target.value))
              }}
            />
            <p className="text-xs text-muted-foreground">
              Frames per second the sampler considers before the hard cap applies.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vlm-max-tokens">VLM max summary tokens</Label>
          <Input
            id="vlm-max-tokens"
            type="number"
            min={128}
            max={4096}
            value={vlmMaxSummaryTokens}
            onChange={(event) => {
              setVlmMaxSummaryTokens(Number(event.target.value))
            }}
          />
          <p className="text-xs text-muted-foreground">
            Output cap (generated tokens, not prompt). Minimum 128 ≈ a 1-2 sentence summary;
            ~7 tok/s on CPU for SmolVLM-500M.
          </p>
        </div>
      </div>
      <Separator />
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Text generation (LLM)</h3>
          <p className="text-xs text-muted-foreground">
            Output-token caps for the LLM-driven paths. Each value caps generated tokens only
            (prompt processing is separate). CPU LLMs at ~20-40 tok/s benefit from tight caps
            because small models don't always emit EOS cleanly and otherwise burn the full
            budget — that's the dominant cost.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="llm-claims-tokens">Claim extraction</Label>
            <Input
              id="llm-claims-tokens"
              type="number"
              min={256}
              max={4096}
              value={llmMaxClaimsTokens}
              onChange={(event) => {
                setLlmMaxClaimsTokens(Number(event.target.value))
              }}
            />
            <p className="text-xs text-muted-foreground">
              ~80 tokens per claim. 1024 ≈ 12 claims.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="llm-synthesis-tokens">Summary synthesis</Label>
            <Input
              id="llm-synthesis-tokens"
              type="number"
              min={512}
              max={4096}
              value={llmMaxSynthesisTokens}
              onChange={(event) => {
                setLlmMaxSynthesisTokens(Number(event.target.value))
              }}
            />
            <p className="text-xs text-muted-foreground">
              Fuses claims into a paragraph. 2048 ≈ ~5 paragraphs.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="llm-ontology-tokens">Ontology augment</Label>
            <Input
              id="llm-ontology-tokens"
              type="number"
              min={128}
              max={4096}
              value={llmMaxOntologyTokens}
              onChange={(event) => {
                setLlmMaxOntologyTokens(Number(event.target.value))
              }}
            />
            <p className="text-xs text-muted-foreground">
              ~30-50 tokens per type suggestion. 1024 ≈ 20-30 types.
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Applying...' : 'Apply runtime'}
        </Button>
      </div>
    </form>
  )
}

function ExternalApisForm({
  initial,
}: {
  initial: Extract<SystemConfigRowStored, { key: 'externalApis' }>
}) {
  const [providers, setProviders] = useState(initial.value.providers)

  useEffect(() => {
    setProviders(initial.value.providers)
  }, [initial])

  const update = useUpdateSystemConfig({
    onSuccess: () => {
      toast.success('External API providers applied')
    },
    onError: (err) => {
      toast.error(`Could not apply external API config: ${err.message}`)
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        update.mutate({ key: 'externalApis', value: { providers } })
      }}
    >
      <Alert>
        <AlertDescription>
          API keys themselves are managed separately in the API Keys page. This form configures
          endpoints, timeouts, and retry policy.
        </AlertDescription>
      </Alert>
      {providers.length === 0 && (
        <p className="text-sm text-muted-foreground">No external providers configured.</p>
      )}
      {providers.map((provider, index) => (
        <div key={`${provider.provider}-${index}`} className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold capitalize">{provider.provider}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProviders(providers.filter((_, i) => i !== index))
              }}
            >
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Endpoint</Label>
              <Input
                value={provider.endpoint}
                onChange={(event) => {
                  const next = [...providers]
                  next[index] = { ...provider, endpoint: event.target.value }
                  setProviders(next)
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Timeout (s)</Label>
              <Input
                type="number"
                min={1}
                max={600}
                value={provider.timeoutSeconds}
                onChange={(event) => {
                  const next = [...providers]
                  next[index] = {
                    ...provider,
                    timeoutSeconds: Number(event.target.value),
                  }
                  setProviders(next)
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Max retries</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={provider.maxRetries}
                onChange={(event) => {
                  const next = [...providers]
                  next[index] = {
                    ...provider,
                    maxRetries: Number(event.target.value),
                  }
                  setProviders(next)
                }}
              />
            </div>
          </div>
        </div>
      ))}
      <div className="flex justify-between">
        <div className="flex gap-2">
          {(['anthropic', 'openai', 'google'] as const).map((name) => {
            const already = providers.some((p) => p.provider === name)
            return (
              <Button
                key={name}
                variant="outline"
                size="sm"
                disabled={already}
                onClick={() => {
                  setProviders([
                    ...providers,
                    {
                      provider: name,
                      endpoint: defaultEndpoint(name),
                      timeoutSeconds: 60,
                      maxRetries: 3,
                    },
                  ])
                }}
              >
                Add {name}
              </Button>
            )
          })}
        </div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Applying...' : 'Apply providers'}
        </Button>
      </div>
    </form>
  )
}

function defaultEndpoint(provider: 'anthropic' | 'openai' | 'google'): string {
  if (provider === 'anthropic') return 'https://api.anthropic.com/v1/messages'
  if (provider === 'openai') return 'https://api.openai.com/v1/chat/completions'
  return 'https://generativelanguage.googleapis.com/v1beta/models'
}

export function SystemConfigPanel() {
  const { data, isLoading, error } = useSystemConfig()
  const replay = useReplaySystemConfig({
    onSuccess: (result) => {
      toast.success(`RefreshCwed ${result.replayed.length} rows to the model-service`)
    },
    onError: (err) => {
      toast.error(`RefreshCw failed: ${err.message}`)
    },
  })

  const rows = useMemo(() => data?.rows ?? [], [data])

  if (isLoading) {
    return (
      <div className="space-y-4" data-tour-id="system-config-panel">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div data-tour-id="system-config-panel">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>Failed to load system config: {error.message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const storage = findRow(rows, 'storagePaths')
  const runtime = findRow(rows, 'runtime')
  const externals = findRow(rows, 'externalApis')

  return (
    <div className="space-y-6" data-tour-id="system-config-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">System configuration</h2>
          <p className="text-sm text-muted-foreground">
            Admin-only runtime settings. Changes are persisted and immediately applied to the
            model-service.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            replay.mutate()
          }}
          disabled={replay.isPending}
        >
          <RefreshCw className="mr-2 size-4" />
          {replay.isPending ? 'RefreshCwing...' : 'RefreshCw to model-service'}
        </Button>
      </div>

      <Tabs defaultValue="storage">
        <TabsList className="mb-4">
          <TabsTrigger value="storage">
            <HardDrive className="size-4" />
            Storage paths
          </TabsTrigger>
          <TabsTrigger value="runtime">
            <Cpu className="size-4" />
            Runtime
          </TabsTrigger>
          <TabsTrigger value="externals">
            <Globe className="size-4" />
            External APIs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="storage">
          {storage ? <StoragePathsForm initial={storage} /> : null}
        </TabsContent>
        <TabsContent value="runtime">
          {runtime ? <RuntimeForm initial={runtime} /> : null}
        </TabsContent>
        <TabsContent value="externals">
          {externals ? <ExternalApisForm initial={externals} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
