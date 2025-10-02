/**
 * OpenTelemetry configuration for distributed tracing and metrics.
 *
 * Configures OTLP exporters for traces and metrics, with automatic instrumentation
 * for Node.js libraries including Fastify, HTTP, and database drivers.
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes, defaultResource } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

/**
 * Initializes OpenTelemetry SDK with trace and metric exporters.
 *
 * Exports traces and metrics to OTLP collector over HTTP. Automatically
 * instruments common Node.js libraries for distributed tracing.
 *
 * @returns Configured NodeSDK instance
 */
function initializeOpenTelemetry(): NodeSDK {
  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'fovea-backend',
      [ATTR_SERVICE_VERSION]: '1.0.0'
    })
  );

  // Build full OTLP endpoint URLs
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  const traceUrl = `${otlpEndpoint}/v1/traces`;
  const metricUrl = `${otlpEndpoint}/v1/metrics`;

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: traceUrl
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: metricUrl
      }),
      exportIntervalMillis: 60000
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false
        }
      })
    ]
  })

  sdk.start()

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.error('Error terminating tracing', error))
      .finally(() => process.exit(0))
  })

  return sdk
}

export default initializeOpenTelemetry()
