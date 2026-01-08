/**
 * @file object-annotation-persona.spec.ts
 * @description E2E tests verifying object annotations save without persona ID
 * while type annotations preserve persona ID correctly.
 *
 * Issue: Object annotations (world object links) are persona-agnostic and should
 * have null personaId. Type annotations (persona-scoped ontology assignments)
 * require personaId.
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Object Annotation Persona ID Handling', () => {
  test('object annotation saves with null personaId', async ({
    db,
    testVideo,
    workerSessionToken
  }) => {
    // Create object annotation with null personaId
    const annotation = await db.createAnnotation({
      videoId: testVideo.id,
      personaId: null,
      type: 'object',
      label: 'test-entity'
    }, workerSessionToken)

    // Verify annotation was created
    expect(annotation.id).toBeDefined()
    expect(annotation.type).toBe('object')

    // Verify personaId is null in returned data
    expect(annotation.personaId).toBeNull()

    // Verify by fetching from database
    const annotations = await db.getAnnotations(testVideo.id, workerSessionToken)
    const createdAnnotation = annotations.find(a => a.id === annotation.id)

    expect(createdAnnotation).toBeDefined()
    expect(createdAnnotation?.personaId).toBeNull()

    // Cleanup
    await db.deleteAnnotation(testVideo.id, annotation.id, workerSessionToken)
  })

  test('type annotation saves with personaId', async ({
    db,
    testVideo,
    testPersona,
    workerSessionToken
  }) => {
    // Create type annotation with personaId
    const annotation = await db.createAnnotation({
      videoId: testVideo.id,
      personaId: testPersona.id,
      type: 'type',
      label: 'test-entity-type'
    }, workerSessionToken)

    // Verify annotation was created
    expect(annotation.id).toBeDefined()
    expect(annotation.type).toBe('type')

    // Verify personaId is set correctly
    expect(annotation.personaId).toBe(testPersona.id)

    // Verify by fetching from database
    const annotations = await db.getAnnotations(testVideo.id, workerSessionToken)
    const createdAnnotation = annotations.find(a => a.id === annotation.id)

    expect(createdAnnotation).toBeDefined()
    expect(createdAnnotation?.personaId).toBe(testPersona.id)

    // Cleanup
    await db.deleteAnnotation(testVideo.id, annotation.id, workerSessionToken)
  })

  test('mixed annotations return correct personaId values', async ({
    db,
    testVideo,
    testPersona,
    workerSessionToken
  }) => {
    // Create object annotation (null personaId)
    const objectAnnotation = await db.createAnnotation({
      videoId: testVideo.id,
      personaId: null,
      type: 'object',
      label: 'world-entity'
    }, workerSessionToken)

    // Create type annotation (with personaId)
    const typeAnnotation = await db.createAnnotation({
      videoId: testVideo.id,
      personaId: testPersona.id,
      type: 'type',
      label: 'ontology-type'
    }, workerSessionToken)

    // Fetch all annotations
    const annotations = await db.getAnnotations(testVideo.id, workerSessionToken)

    expect(annotations).toHaveLength(2)

    // Find and verify each annotation
    const fetchedObject = annotations.find(a => a.type === 'object')
    const fetchedType = annotations.find(a => a.type === 'type')

    expect(fetchedObject?.personaId).toBeNull()
    expect(fetchedType?.personaId).toBe(testPersona.id)

    // Cleanup
    await db.deleteAnnotation(testVideo.id, objectAnnotation.id, workerSessionToken)
    await db.deleteAnnotation(testVideo.id, typeAnnotation.id, workerSessionToken)
  })

  test('object annotation with omitted personaId defaults to null', async ({
    db,
    testVideo,
    workerSessionToken
  }) => {
    // Create annotation without personaId field (undefined)
    const annotation = await db.createAnnotation({
      videoId: testVideo.id,
      // personaId intentionally omitted
      type: 'object',
      label: 'test-entity'
    }, workerSessionToken)

    // Verify personaId defaulted to null
    expect(annotation.personaId).toBeNull()

    // Cleanup
    await db.deleteAnnotation(testVideo.id, annotation.id, workerSessionToken)
  })
})
