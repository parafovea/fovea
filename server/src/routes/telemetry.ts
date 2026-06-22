import { FastifyPluginAsync } from 'fastify'
import { Type, Static } from '@sinclair/typebox'
import { config } from '../config.js'
import { recordFrontendError, type ErrorSeverity } from '../lib/errorMetrics.js'

/**
 * Schema for frontend error reports.
 */
const ErrorReportSchema = Type.Object({
  errorType: Type.String({ description: 'Error classification (e.g., runtime-error, network-error)' }),
  message: Type.String({ description: 'Error message' }),
  stack: Type.Optional(Type.String({ description: 'Stack trace' })),
  componentStack: Type.Optional(Type.String({ description: 'React component stack' })),
  component: Type.Optional(Type.String({ description: 'Component where error occurred' })),
  route: Type.Optional(Type.String({ description: 'Route/page where error occurred' })),
  severity: Type.Union([
    Type.Literal('info'),
    Type.Literal('warning'),
    Type.Literal('error'),
    Type.Literal('critical'),
  ], { description: 'Error severity level' }),
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Additional context' })),
  timestamp: Type.String({ format: 'date-time', description: 'ISO timestamp of error' }),
  sessionId: Type.Optional(Type.String({ description: 'Browser session ID' })),
  correlationId: Type.Optional(Type.String({ description: 'Correlation ID for tracking' })),
  browser: Type.Optional(Type.String({ description: 'Browser name/version' })),
  url: Type.Optional(Type.String({ description: 'Page URL where error occurred' })),
})

type ErrorReport = Static<typeof ErrorReportSchema>

/**
 * Schema for batch error reports.
 */
const BatchErrorReportSchema = Type.Object({
  errors: Type.Array(ErrorReportSchema, { maxItems: 100 }),
})

type BatchErrorReport = Static<typeof BatchErrorReportSchema>

/**
 * Response schema for error report acknowledgment.
 */
const ErrorReportResponseSchema = Type.Object({
  received: Type.Boolean(),
  correlationId: Type.Optional(Type.String()),
})

/**
 * Telemetry routes for error reporting and trace forwarding.
 *
 * Endpoints:
 * - POST /api/telemetry/errors - Single error report
 * - POST /api/telemetry/errors/batch - Batch error reports (up to 100)
 * - POST /api/telemetry/traces - Proxy to OTEL Collector
 */
const telemetryRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Report a single frontend error.
   * Records metrics and logs error details.
   *
   * @route POST /api/telemetry/errors
   */
  fastify.post<{ Body: ErrorReport }>(
    '/api/telemetry/errors',
    {
      schema: {
        description: 'Report a frontend error for metrics and logging',
        tags: ['telemetry'],
        body: ErrorReportSchema,
        response: {
          202: ErrorReportResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const error = request.body
      const correlationId = error.correlationId || generateCorrelationId()

      // Record to metrics
      recordFrontendError(
        error.errorType,
        error.component || 'unknown',
        error.route || 'unknown',
        error.severity as ErrorSeverity,
        error.browser
      )

      // Log error with structured context
      request.log.warn({
        errorType: error.errorType,
        message: error.message,
        stack: error.stack,
        componentStack: error.componentStack,
        component: error.component,
        route: error.route,
        severity: error.severity,
        context: error.context,
        sessionId: error.sessionId,
        correlationId,
        browser: error.browser,
        url: error.url,
        timestamp: error.timestamp,
        source: 'frontend',
      }, `Frontend ${error.severity}: ${error.message}`)

      return reply.code(202).send({
        received: true,
        correlationId,
      })
    }
  )

  /**
   * Report multiple frontend errors in a batch.
   * More efficient than individual reports for batched error handling.
   *
   * @route POST /api/telemetry/errors/batch
   */
  fastify.post<{ Body: BatchErrorReport }>(
    '/api/telemetry/errors/batch',
    {
      schema: {
        description: 'Report multiple frontend errors in a batch (max 100)',
        tags: ['telemetry'],
        body: BatchErrorReportSchema,
        response: {
          202: Type.Object({
            received: Type.Boolean(),
            count: Type.Number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { errors } = request.body

      for (const error of errors) {
        // Record each error to metrics
        recordFrontendError(
          error.errorType,
          error.component || 'unknown',
          error.route || 'unknown',
          error.severity as ErrorSeverity,
          error.browser
        )

        // Log each error
        request.log.warn({
          errorType: error.errorType,
          message: error.message,
          component: error.component,
          route: error.route,
          severity: error.severity,
          sessionId: error.sessionId,
          correlationId: error.correlationId,
          timestamp: error.timestamp,
          source: 'frontend',
        }, `Frontend ${error.severity}: ${error.message}`)
      }

      return reply.code(202).send({
        received: true,
        count: errors.length,
      })
    }
  )

  /**
   * Proxy traces to OTEL Collector.
   * Browser sends traces here, and we forward to the collector.
   *
   * @route POST /api/telemetry/traces
   */
  fastify.post(
    '/api/telemetry/traces',
    {
      schema: {
        description: 'Proxy browser traces to OTEL Collector',
        tags: ['telemetry'],
        response: {
          200: Type.Object({ status: Type.String() }),
          502: Type.Object({ error: Type.String() }),
        },
      },
      // Accept raw body for trace data
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      const otelEndpoint = config.otel.exporterEndpoint
      const tracesUrl = `${otelEndpoint}/v1/traces`

      try {
        // Forward the request body to OTEL Collector
        const response = await fetch(tracesUrl, {
          method: 'POST',
          headers: {
            'Content-Type': request.headers['content-type'] || 'application/json',
          },
          body: JSON.stringify(request.body),
        })

        if (!response.ok) {
          request.log.error({
            status: response.status,
            statusText: response.statusText,
            url: tracesUrl,
          }, 'Failed to forward traces to OTEL Collector')

          return reply.code(502).send({
            error: 'Failed to forward traces to collector',
          })
        }

        return reply.code(200).send({ status: 'ok' })
      } catch (error) {
        request.log.error({
          err: error,
          url: tracesUrl,
        }, 'Error forwarding traces to OTEL Collector')

        return reply.code(502).send({
          error: 'Failed to connect to collector',
        })
      }
    }
  )
}

/**
 * Generate a correlation ID for error tracking.
 */
function generateCorrelationId(): string {
  return `err-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`
}

export default telemetryRoutes
