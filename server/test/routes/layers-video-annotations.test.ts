import { randomUUID } from 'node:crypto'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import {
  annotationLayerId,
  expressionVideoId,
  layersOntologyForPersonaId,
} from '../../src/services/layers-id-map.js'
import type { BoundingBoxSequence } from '../../src/services/layers-conversion-service.js'

/**
 * Integration test for the video-annotation endpoint over the unified layers
 * store (`/api/layers/videos/:videoId/annotations`). Exercises the full CRUD
 * cycle against a real Postgres and asserts that the legacy annotation wire
 * shape round-trips bit-exactly through the server-side conversion to and from
 * the layers rows: a multi-keyframe bounding-box sequence, the type/object
 * discriminant, and the ontology-type / world-object denotation links.
 */
describe('Video annotations over the layers store', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let userId: string
  let sessionToken: string
  let videoId: string
  let personaId: string
  let typeDefId: string
  let graphNodeId: string

  // Ids of the annotations created through the endpoint, shared across the
  // ordered create -> read -> update -> delete steps.
  let typeAnnotationId: string
  let objectAnnotationId: string

  const username = `layers-video-ann-${randomUUID()}`
  const password = 'testpass123'

  /**
   * A multi-keyframe sequence with mixed interpolation, a visibility gap, a
   * string track id, per-box confidence, and box metadata, so the round-trip
   * exercises every branch of the conversion.
   */
  const typeFrames: BoundingBoxSequence = {
    boxes: [
      { x: 10.5, y: 12.25, width: 50.75, height: 60.1, frameNumber: 0, isKeyframe: true, confidence: 0.9 },
      { x: 80, y: 40, width: 55, height: 62, frameNumber: 30, isKeyframe: true, confidence: 0.75 },
      {
        x: 160.333,
        y: 90.667,
        width: 60,
        height: 65,
        frameNumber: 90,
        isKeyframe: true,
        confidence: 0.6,
        metadata: { occlusion: 0.2, pose: { yaw: 12, pitch: -3 } },
      },
    ],
    interpolationSegments: [
      { startFrame: 0, endFrame: 30, type: 'linear' },
      {
        startFrame: 30,
        endFrame: 90,
        type: 'ease-in-out',
        controlPoints: { x: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }] },
      },
    ],
    visibilityRanges: [
      { startFrame: 0, endFrame: 30, visible: true },
      { startFrame: 31, endFrame: 59, visible: false },
      { startFrame: 60, endFrame: 90, visible: true },
    ],
    trackId: 'track-type-1',
    trackingSource: 'sam2',
    trackingConfidence: 0.88,
    totalFrames: 91,
    keyframeCount: 3,
    interpolatedFrameCount: 88,
  }

  const objectFrames: BoundingBoxSequence = {
    boxes: [
      { x: 5, y: 5, width: 20, height: 20, frameNumber: 0, isKeyframe: true },
      { x: 25.5, y: 30.25, width: 22, height: 24, frameNumber: 60, isKeyframe: true, confidence: 0.5 },
    ],
    interpolationSegments: [{ startFrame: 0, endFrame: 60, type: 'linear' }],
    visibilityRanges: [{ startFrame: 0, endFrame: 60, visible: true }],
    totalFrames: 61,
    keyframeCount: 2,
    interpolatedFrameCount: 59,
  }

  /** The moved-keyframe PUT payload: the last keyframe slides 90 -> 120. */
  const movedTypeFrames: BoundingBoxSequence = {
    ...typeFrames,
    boxes: [
      typeFrames.boxes[0],
      typeFrames.boxes[1],
      { ...typeFrames.boxes[2], frameNumber: 120, x: 200.5, y: 100 },
    ],
    interpolationSegments: [
      { startFrame: 0, endFrame: 30, type: 'linear' },
      {
        startFrame: 30,
        endFrame: 120,
        type: 'ease-in-out',
        controlPoints: { x: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }] },
      },
    ],
    visibilityRanges: [
      { startFrame: 0, endFrame: 30, visible: true },
      { startFrame: 31, endFrame: 59, visible: false },
      { startFrame: 60, endFrame: 120, visible: true },
    ],
    totalFrames: 121,
    interpolatedFrameCount: 118,
  }

  /** Projects a returned annotation onto the legacy wire fields the POST sent. */
  const coreOf = (a: Record<string, unknown>) => ({
    id: a.id,
    videoId: a.videoId,
    personaId: a.personaId,
    type: a.type,
    label: a.label,
    linkType: a.linkType,
    frames: a.frames,
    confidence: a.confidence,
    source: a.source,
  })

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
    await seedBaselinePermissions(prisma)

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: { username, email: `${username}@example.com`, passwordHash, displayName: 'Layers Ann User', isAdmin: false },
    })
    userId = user.id

    const video = await prisma.video.create({
      data: {
        filename: `layers-video-ann-${randomUUID()}.mp4`,
        path: '/videos/layers-video-ann.mp4',
        duration: 5,
        frameRate: 30,
        resolution: '1920x1080',
      },
    })
    videoId = video.id

    const persona = await prisma.persona.create({
      data: { userId, name: 'Layers Analyst', role: 'Analyst', informationNeed: 'Track the main entity' },
    })
    personaId = persona.id

    // A LayersOntology at the persona's derived id + one TypeDef, so a type
    // annotation's label references a real ontology type and the grouping layer
    // binds to the ontology.
    const layersOntology = await prisma.layersOntology.create({
      data: {
        id: layersOntologyForPersonaId(persona.id),
        name: 'Layers Test Ontology',
        personaId: persona.id,
        createdByUserId: userId,
      },
    })
    const typeDef = await prisma.typeDef.create({
      data: {
        id: randomUUID(),
        ontologyId: layersOntology.id,
        name: 'Person',
        typeKind: 'entity-type',
        createdByUserId: userId,
      },
    })
    typeDefId = typeDef.id

    // A world graph node the object annotation denotes.
    const graphNode = await prisma.graphNode.create({
      data: { id: randomUUID(), nodeType: 'entity', label: 'Jane Speaker', createdByUserId: userId },
    })
    graphNodeId = graphNode.id

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password },
    })
    sessionToken = login.cookies.find((c) => c.name === 'session_token')!.value
  })

  afterAll(async () => {
    // Reverse foreign-key order, scoped to this test's fixtures. Deleting the
    // video expression cascades to its annotation layers and layers annotations;
    // the graph node / type def / ontology are removed after (the annotation's
    // denotesNode FK is SetNull, but the annotations are already gone).
    await prisma.layersAnnotation.deleteMany({ where: { layer: { expression: { videoId } } } })
    await prisma.annotationLayer.deleteMany({ where: { expression: { videoId } } })
    await prisma.expression.deleteMany({ where: { videoId } })
    await prisma.media.deleteMany({ where: { videoId } })
    await prisma.graphNode.deleteMany({ where: { createdByUserId: userId } })
    await prisma.typeDef.deleteMany({ where: { createdByUserId: userId } })
    await prisma.layersOntology.deleteMany({ where: { createdByUserId: userId } })
    await prisma.annotation.deleteMany({ where: { videoId } })
    await prisma.persona.deleteMany({ where: { userId } })
    await prisma.video.deleteMany({ where: { id: videoId } })
    await prisma.session.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await app.close()
  })

  it('creates a type annotation and an object annotation', async () => {
    typeAnnotationId = randomUUID()
    const typePayload = {
      id: typeAnnotationId,
      videoId,
      personaId,
      type: 'type',
      label: typeDefId,
      linkType: null,
      frames: typeFrames,
      confidence: 0.9,
      source: 'manual',
    }

    const typeResponse = await app.inject({
      method: 'POST',
      url: `/api/layers/videos/${videoId}/annotations`,
      cookies: { session_token: sessionToken },
      payload: typePayload,
    })
    expect(typeResponse.statusCode).toBe(201)
    expect(coreOf(typeResponse.json())).toEqual(typePayload)

    objectAnnotationId = randomUUID()
    const objectPayload = {
      id: objectAnnotationId,
      videoId,
      personaId: null,
      type: 'object',
      label: graphNodeId,
      linkType: 'entity',
      frames: objectFrames,
      confidence: 0.75,
      source: 'manual',
    }

    const objectResponse = await app.inject({
      method: 'POST',
      url: `/api/layers/videos/${videoId}/annotations`,
      cookies: { session_token: sessionToken },
      payload: objectPayload,
    })
    expect(objectResponse.statusCode).toBe(201)
    expect(coreOf(objectResponse.json())).toEqual(objectPayload)

    // The layers rows the mapper produced: a type layer bound to the persona's
    // ontology, and a distinct object layer with a null persona.
    const typeLayer = await prisma.annotationLayer.findUnique({
      where: { id: annotationLayerId(videoId, personaId) },
    })
    expect(typeLayer?.personaId).toBe(personaId)
    expect(typeLayer?.expressionId).toBe(expressionVideoId(videoId))
    expect(typeLayer?.ontologyId).toBe(layersOntologyForPersonaId(personaId))
    expect(typeLayer?.subkind).toBe('ontology-type')

    const objectLayer = await prisma.annotationLayer.findUnique({
      where: { id: annotationLayerId(videoId, null) },
    })
    expect(objectLayer?.personaId).toBeNull()
    expect(objectLayer?.subkind).toBe('world-object')

    // The type annotation soft-references the TypeDef; the object annotation
    // denotes the graph node.
    const typeRow = await prisma.layersAnnotation.findUnique({ where: { id: typeAnnotationId } })
    expect(typeRow?.ontologyTypeRefId).toBe(typeDefId)
    expect(typeRow?.denotesNodeId).toBeNull()
    expect(typeRow?.confidence).toBe(900)

    const objectRow = await prisma.layersAnnotation.findUnique({ where: { id: objectAnnotationId } })
    expect(objectRow?.denotesNodeId).toBe(graphNodeId)
    expect(objectRow?.ontologyTypeRefId).toBeNull()
  })

  it('re-POST with the same client id updates in place (idempotent create)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/layers/videos/${videoId}/annotations`,
      cookies: { session_token: sessionToken },
      payload: {
        id: typeAnnotationId,
        videoId,
        personaId,
        type: 'type',
        label: typeDefId,
        linkType: null,
        frames: typeFrames,
        confidence: 0.9,
        source: 'manual',
      },
    })
    expect(response.statusCode).toBe(200)

    // Still exactly one row per client id: no duplicate minted.
    const count = await prisma.layersAnnotation.count({
      where: { id: { in: [typeAnnotationId, objectAnnotationId] } },
    })
    expect(count).toBe(2)
  })

  it('GET returns both annotations, round-tripping the wire shape bit-exactly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/layers/videos/${videoId}/annotations`,
      cookies: { session_token: sessionToken },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as Array<Record<string, unknown>>
    expect(body).toHaveLength(2)

    const returnedType = body.find((a) => a.id === typeAnnotationId)!
    expect(coreOf(returnedType)).toEqual({
      id: typeAnnotationId,
      videoId,
      personaId,
      type: 'type',
      label: typeDefId,
      linkType: null,
      frames: typeFrames,
      confidence: 0.9,
      source: 'manual',
    })
    // Bit-exact sequence reconstruction.
    expect(returnedType.frames).toEqual(typeFrames)

    const returnedObject = body.find((a) => a.id === objectAnnotationId)!
    expect(coreOf(returnedObject)).toEqual({
      id: objectAnnotationId,
      videoId,
      personaId: null,
      type: 'object',
      label: graphNodeId,
      linkType: 'entity',
      frames: objectFrames,
      confidence: 0.75,
      source: 'manual',
    })
    expect(returnedObject.frames).toEqual(objectFrames)
    // The object annotation resolves its linked object's display name from the
    // denoted graph node; the type annotation has none.
    expect(returnedObject.linkedObjectName).toBe('Jane Speaker')
    expect(returnedType.linkedObjectName).toBeNull()
  })

  it('PUT moves a keyframe and re-GET reflects the new sequence and extent', async () => {
    const putResponse = await app.inject({
      method: 'PUT',
      url: `/api/layers/videos/${videoId}/annotations/${typeAnnotationId}`,
      cookies: { session_token: sessionToken },
      payload: {
        type: 'type',
        label: typeDefId,
        frames: movedTypeFrames,
        confidence: 0.9,
        source: 'manual',
      },
    })
    expect(putResponse.statusCode).toBe(200)
    expect(putResponse.json().frames).toEqual(movedTypeFrames)

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/layers/videos/${videoId}/annotations`,
      cookies: { session_token: sessionToken },
    })
    const body = getResponse.json() as Array<Record<string, unknown>>
    const returnedType = body.find((a) => a.id === typeAnnotationId)!
    expect(returnedType.frames).toEqual(movedTypeFrames)
    // The type/label/persona discriminants survive the frames-only PUT.
    expect(returnedType.type).toBe('type')
    expect(returnedType.personaId).toBe(personaId)
    expect(returnedType.label).toBe(typeDefId)

    // The denormalized extent tracks the moved last keyframe (frame 120 at 30fps).
    const row = await prisma.layersAnnotation.findUnique({ where: { id: typeAnnotationId } })
    expect(row?.startMs).toBe(0)
    expect(row?.endMs).toBe(4000)
  })

  it('DELETE removes an annotation and it no longer appears', async () => {
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/layers/videos/${videoId}/annotations/${objectAnnotationId}`,
      cookies: { session_token: sessionToken },
    })
    expect(deleteResponse.statusCode).toBe(204)

    expect(await prisma.layersAnnotation.findUnique({ where: { id: objectAnnotationId } })).toBeNull()

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/layers/videos/${videoId}/annotations`,
      cookies: { session_token: sessionToken },
    })
    const body = getResponse.json() as Array<Record<string, unknown>>
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(typeAnnotationId)
  })
})
