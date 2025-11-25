/**
 * Custom metrics for application monitoring.
 *
 * Defines business-specific metrics for tracking API usage, queue operations,
 * and database performance.
 */

import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('fovea-backend')

/**
 * Counter for API requests by endpoint and status.
 */
export const apiRequestCounter = meter.createCounter('api.requests', {
  description: 'Number of API requests',
  unit: '1'
})

/**
 * Histogram for API request duration.
 */
export const apiRequestDuration = meter.createHistogram('api.request.duration', {
  description: 'API request duration in milliseconds',
  unit: 'ms'
})

/**
 * Counter for queue job submissions.
 */
export const queueJobCounter = meter.createCounter('queue.job.submitted', {
  description: 'Number of jobs submitted to queue',
  unit: '1'
})

/**
 * Histogram for queue job processing duration.
 */
export const queueJobDuration = meter.createHistogram('queue.job.duration', {
  description: 'Queue job processing duration in milliseconds',
  unit: 'ms'
})

/**
 * Counter for database queries.
 */
export const dbQueryCounter = meter.createCounter('db.query.count', {
  description: 'Number of database queries',
  unit: '1'
})

/**
 * Histogram for database query duration.
 */
export const dbQueryDuration = meter.createHistogram('db.query.duration', {
  description: 'Database query duration in milliseconds',
  unit: 'ms'
})

/**
 * Counter for model service requests.
 */
export const modelServiceCounter = meter.createCounter('model.service.requests', {
  description: 'Number of requests to model service',
  unit: '1'
})

/**
 * Histogram for model service response time.
 */
export const modelServiceDuration = meter.createHistogram('model.service.duration', {
  description: 'Model service response time in milliseconds',
  unit: 'ms'
})

/**
 * Counter for cache operations (hit/miss/error).
 * Attributes: operation (get, set, del, flush), status (hit, miss, success, error)
 */
export const cacheHitCounter = meter.createCounter('cache.operations', {
  description: 'Number of cache operations by type and status',
  unit: '1'
})

/**
 * Histogram for cache operation duration.
 * Attributes: operation (get, set, del, flush), status (hit, miss, success, error)
 */
export const cacheOperationDuration = meter.createHistogram('cache.operation.duration', {
  description: 'Cache operation duration in milliseconds',
  unit: 'ms'
})
