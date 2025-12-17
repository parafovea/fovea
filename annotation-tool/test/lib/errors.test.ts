import { describe, it, expect } from 'vitest'
import { AppError, DuplicateImportError } from '../../src/lib/errors'

describe('AppError', () => {
  it('sets name to constructor name', () => {
    const error = new AppError('TEST_CODE', 'Test message')
    expect(error.name).toBe('AppError')
  })

  it('sets code correctly', () => {
    const error = new AppError('TEST_CODE', 'Test message')
    expect(error.code).toBe('TEST_CODE')
  })

  it('sets message correctly', () => {
    const error = new AppError('TEST_CODE', 'Test message')
    expect(error.message).toBe('Test message')
  })

  it('sets details when provided', () => {
    const details = { field: 'value' }
    const error = new AppError('TEST_CODE', 'Test message', details)
    expect(error.details).toEqual(details)
  })

  it('leaves details undefined when not provided', () => {
    const error = new AppError('TEST_CODE', 'Test message')
    expect(error.details).toBeUndefined()
  })

  it('extends Error', () => {
    const error = new AppError('TEST_CODE', 'Test message')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('DuplicateImportError', () => {
  it('extends AppError', () => {
    const error = new DuplicateImportError('Q12345', 'Test Item', 'entity-type')
    expect(error).toBeInstanceOf(AppError)
    expect(error).toBeInstanceOf(Error)
  })

  it('sets name to DuplicateImportError', () => {
    const error = new DuplicateImportError('Q12345', 'Test Item', 'entity-type')
    expect(error.name).toBe('DuplicateImportError')
  })

  it('sets code to DUPLICATE_IMPORT', () => {
    const error = new DuplicateImportError('Q12345', 'Test Item', 'entity-type')
    expect(error.code).toBe('DUPLICATE_IMPORT')
  })

  it('stores wikidataId, existingItemName, and itemType', () => {
    const error = new DuplicateImportError('Q12345', 'Test Item', 'entity-type')
    expect(error.wikidataId).toBe('Q12345')
    expect(error.existingItemName).toBe('Test Item')
    expect(error.itemType).toBe('entity-type')
  })

  it('formats message correctly for entity-type', () => {
    const error = new DuplicateImportError('Q12345', 'Test Item', 'entity-type')
    expect(error.message).toBe('A entity type with Wikidata ID "Q12345" already exists: "Test Item"')
  })

  it('formats message correctly for role-type', () => {
    const error = new DuplicateImportError('Q67890', 'Test Role', 'role-type')
    expect(error.message).toBe('A role type with Wikidata ID "Q67890" already exists: "Test Role"')
  })

  it('formats message correctly for event-type', () => {
    const error = new DuplicateImportError('Q11111', 'Test Event Type', 'event-type')
    expect(error.message).toBe('A event type with Wikidata ID "Q11111" already exists: "Test Event Type"')
  })

  it('formats message correctly for entity (no hyphen)', () => {
    const error = new DuplicateImportError('Q33333', 'Test Entity', 'entity')
    expect(error.message).toBe('A entity with Wikidata ID "Q33333" already exists: "Test Entity"')
  })

  it('formats message correctly for event (no hyphen)', () => {
    const error = new DuplicateImportError('Q44444', 'Test Event', 'event')
    expect(error.message).toBe('A event with Wikidata ID "Q44444" already exists: "Test Event"')
  })

  it('sets details with error context', () => {
    const error = new DuplicateImportError('Q12345', 'Test Item', 'entity-type')
    expect(error.details).toEqual({
      wikidataId: 'Q12345',
      existingItemName: 'Test Item',
      itemType: 'entity-type',
    })
  })
})
