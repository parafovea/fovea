import { describe, it, expect } from 'vitest'
import { z } from 'zod'

import { getPanproto, loadLayersSchema, loadFoveaSchema } from '../panproto-registry.js'

/** A FOVEA video-annotation view-model shape: flat per-keyframe boxes, canonical scalars. */
const VideoAnnotationSource = z.object({
  id: z.string(),
  label: z.string().optional(),
  confidence: z.number().int(),
  temporalSpan: z.object({ start: z.number().int(), ending: z.number().int() }),
  keyframes: z.array(
    z.object({
      timeMs: z.number().int(),
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int(),
      height: z.number().int(),
    }),
  ),
})

describe('panproto registry', () => {
  it('loads the pub.layers.annotation.annotationLayer record with its cross-file refs resolved', async () => {
    const schema = await loadLayersSchema('annotation/annotationLayer.json', ['annotation/defs.json', 'defs.json'])
    const vertices = Object.keys(schema.vertices)
    expect(vertices.length).toBeGreaterThan(100)
    // the spatioTemporalAnchor geometry resolves into typed vertices, not opaque ref placeholders
    for (const fragment of ['spatioTemporalAnchor', 'boundingBox', 'keyframe']) {
      expect(vertices.some((v) => v.includes(fragment))).toBe(true)
    }
  })

  it('emits a FOVEA view-model source schema from its Zod definition', async () => {
    const source = await loadFoveaSchema(VideoAnnotationSource)
    const vertices = Object.keys(source.vertices)
    expect(vertices.some((v) => v.includes('keyframes'))).toBe(true)
    expect(vertices.some((v) => v.includes('temporalSpan'))).toBe(true)
  })

  it('compiles a bidirectional keyframe regroup lens whose round-trip laws hold', async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(VideoAnnotationSource)

    // Per-keyframe regroup: flat x/y/width/height into a nested boundingBox record.
    const lensDoc = {
      id: 'fovea.video.regroup.v1',
      source: 'fovea.video.annotation',
      target: 'pub.layers.annotation.annotationLayer',
      steps: [
        {
          compute_field: {
            target: 'boundingBox',
            expr: '{ x = x, y = y, width = width, height = height }',
          },
        },
      ],
    }
    const lens = p.compileLensDocument(lensDoc, 'root.keyframes:items').instantiate(source)

    const record = {
      id: 'ann-1',
      label: 'person',
      confidence: 880,
      temporalSpan: { start: 0, ending: 1000 },
      keyframes: [
        { timeMs: 0, x: 10, y: 20, width: 30, height: 40 },
        { timeMs: 1000, x: 15, y: 25, width: 30, height: 40 },
      ],
    }
    const bytes = p.parseJson(source, JSON.stringify(record))._bytes

    expect(lens.checkGetPut(bytes).holds).toBe(true)
    expect(lens.checkPutGet(bytes).holds).toBe(true)
  })
})
