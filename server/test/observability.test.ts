/**
 * Tests for OpenTelemetry observability integration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { trace, metrics } from '@opentelemetry/api'

describe('Observability Integration', () => {
  describe('Tracing', () => {
    it('should create a tracer', () => {
      const tracer = trace.getTracer('test-tracer')
      expect(tracer).toBeDefined()
    })

    it('should create and end a span', () => {
      const tracer = trace.getTracer('test-tracer')
      const span = tracer.startSpan('test-span')
      expect(span).toBeDefined()
      span.end()
    })
  })

  describe('Metrics', () => {
    it('should create a meter', () => {
      const meter = metrics.getMeter('test-meter')
      expect(meter).toBeDefined()
    })

    it('should create a counter', () => {
      const meter = metrics.getMeter('test-meter')
      const counter = meter.createCounter('test-counter')
      expect(counter).toBeDefined()
      counter.add(1)
    })

    it('should create a histogram', () => {
      const meter = metrics.getMeter('test-meter')
      const histogram = meter.createHistogram('test-histogram')
      expect(histogram).toBeDefined()
      histogram.record(100)
    })
  })
})
