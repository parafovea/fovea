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

/**
 * Counter for RBAC permission checks.
 * Attributes: action, resource, result (allowed/denied), role
 */
export const rbacCheckCounter = meter.createCounter('fovea.rbac.checks', {
  description: 'Number of RBAC permission checks',
  unit: '1'
})

/**
 * Histogram for RBAC permission check duration.
 * Attributes: action, resource
 */
export const rbacCheckDuration = meter.createHistogram('fovea.rbac.check.duration', {
  description: 'RBAC permission check duration in milliseconds',
  unit: 'ms'
})

/**
 * Counter for group operations.
 * Attributes: operation (create/update/delete/add_member/remove_member), status
 */
export const groupOperationCounter = meter.createCounter('fovea.group.operations', {
  description: 'Number of group management operations',
  unit: '1'
})

/**
 * Counter for project operations.
 * Attributes: operation (create/update/delete/add_member/remove_member/archive), status
 */
export const projectOperationCounter = meter.createCounter('fovea.project.operations', {
  description: 'Number of project management operations',
  unit: '1'
})

/**
 * Counter for sharing operations.
 * Attributes: operation (share/revoke/fork), resourceType, targetType (user/group)
 */
export const sharingOperationCounter = meter.createCounter('fovea.sharing.operations', {
  description: 'Number of sharing operations',
  unit: '1'
})

/**
 * Counter for video assignment operations.
 * Attributes: operation (assign/unassign/rule_evaluate), source (manual/rule)
 */
export const videoAssignmentCounter = meter.createCounter('fovea.video_assignment.operations', {
  description: 'Number of video assignment operations',
  unit: '1'
})
