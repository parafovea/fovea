/**
 * OpenTelemetry browser SDK setup for distributed tracing.
 * Follows official documentation: https://opentelemetry.io/docs/languages/js/getting-started/browser/
 *
 * Features:
 * - Automatic document load instrumentation
 * - Fetch API instrumentation with trace context propagation
 * - User interaction instrumentation
 * - Batched span export to OTEL Collector
 */

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { ZoneContextManager } from '@opentelemetry/context-zone'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load'
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch'
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'

export interface TracingConfig {
  /** Enable tracing (default: true in production) */
  enabled?: boolean
  /** Trace sample rate 0-1 (default: 0.2 in prod, 1.0 in dev) */
  sampleRate?: number
  /** Service name for trace attribution */
  serviceName?: string
  /** Service version for trace attribution */
  serviceVersion?: string
  /** OTLP endpoint URL (default: /api/telemetry/traces) */
  endpoint?: string
}

const defaultConfig: Required<TracingConfig> = {
  enabled: true,
  sampleRate: 0.2,
  serviceName: 'fovea-frontend',
  serviceVersion: '1.0.0',
  endpoint: '/api/telemetry/traces',
}

let tracerProvider: WebTracerProvider | null = null

/**
 * Initialize OpenTelemetry browser tracing.
 * Should be called once at app startup, before React renders.
 */
export function initTracing(config: TracingConfig = {}): void {
  const finalConfig = { ...defaultConfig, ...config }

  if (!finalConfig.enabled) {
    console.debug('[Tracing] Disabled by configuration')
    return
  }

  if (tracerProvider) {
    console.warn('[Tracing] Already initialized, skipping')
    return
  }

  try {
    // Configure trace exporter to send spans to OTEL Collector via backend proxy
    const exporter = new OTLPTraceExporter({
      url: finalConfig.endpoint,
    })

    // Create resource with service metadata
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: finalConfig.serviceName,
      [ATTR_SERVICE_VERSION]: finalConfig.serviceVersion,
    })

    // Create batch processor for efficient span export
    const spanProcessor = new BatchSpanProcessor(exporter, {
      maxQueueSize: 100,
      maxExportBatchSize: 50,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    })

    // Create tracer provider with resource and span processor
    tracerProvider = new WebTracerProvider({
      resource,
      spanProcessors: [spanProcessor],
    })

    // Register provider with Zone.js context manager for async context propagation
    tracerProvider.register({
      contextManager: new ZoneContextManager(),
    })

    // Register automatic instrumentations
    registerInstrumentations({
      instrumentations: [
        new DocumentLoadInstrumentation(),
        new FetchInstrumentation({
          // Propagate trace context to API calls
          propagateTraceHeaderCorsUrls: [/\/api\//],
          // Clear timing data to avoid leaking sensitive info
          clearTimingResources: true,
          // Add request/response hooks for detailed tracing
          applyCustomAttributesOnSpan: (span, request, response) => {
            // Extract URL from request (handles both Request objects and URL strings)
            if (typeof request === 'string') {
              span.setAttribute('http.url', request)
            } else if (request instanceof Request) {
              span.setAttribute('http.url', request.url)
              span.setAttribute('http.method', request.method)
            } else if (request && 'method' in request) {
              span.setAttribute('http.method', request.method ?? 'GET')
            }
            // Handle response
            if (response && 'status' in response && typeof response.status === 'number') {
              span.setAttribute('http.status_code', response.status)
              if (response.status >= 400) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: `HTTP ${response.status}`,
                })
              }
            }
          },
        }),
        new UserInteractionInstrumentation({
          // Only track meaningful interactions
          eventNames: ['click', 'submit'],
        }),
      ],
    })

    console.debug(`[Tracing] Initialized with sample rate ${finalConfig.sampleRate}`)
  } catch (error) {
    console.error('[Tracing] Failed to initialize:', error)
  }
}

/**
 * Shutdown tracing and flush pending spans.
 * Call this before page unload if needed.
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown()
    tracerProvider = null
    console.debug('[Tracing] Shutdown complete')
  }
}

/**
 * Get the global tracer for manual span creation.
 * @param name - Optional tracer name (defaults to service name)
 */
export function getTracer(name = 'fovea-frontend') {
  return trace.getTracer(name)
}

/**
 * Create a span for manual instrumentation.
 * Useful for tracking custom operations.
 *
 * @example
 * ```ts
 * await withSpan('process-video', { videoId }, async (span) => {
 *   // Your code here
 *   span.setAttribute('frames_processed', 100)
 * })
 * ```
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean> = {},
  fn: (span: ReturnType<ReturnType<typeof trace.getTracer>['startSpan']>) => Promise<T>
): Promise<T> {
  const tracer = getTracer()
  const span = tracer.startSpan(name, { attributes })

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      if (error instanceof Error) {
        span.recordException(error)
      }
      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Get the current trace ID for correlation with backend logs.
 * Returns undefined if no active trace.
 */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan()
  if (span) {
    return span.spanContext().traceId
  }
  return undefined
}
