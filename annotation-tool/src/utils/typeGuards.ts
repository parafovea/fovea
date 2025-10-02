import {
  Time,
  TimeInstant,
  TimeInterval,
  Location,
  LocationPoint,
  LocationExtent,
  Entity,
  Event,
  EntityCollection,
  EventCollection,
  TimeCollection,
  Annotation,
  ObjectAnnotation,
  TypeAnnotation,
} from '../models/types'

// Time type guards
export function isTime(obj: any): obj is Time {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    (obj.type === 'instant' || obj.type === 'interval')
  )
}

export function isTimeInstant(obj: any): obj is TimeInstant {
  return (
    isTime(obj) &&
    obj.type === 'instant' &&
    typeof (obj as TimeInstant).timestamp === 'string'
  )
}

export function isTimeInterval(obj: any): obj is TimeInterval {
  if (!isTime(obj) || obj.type !== 'interval') return false
  const interval = obj as TimeInterval
  return (
    (interval.startTime === undefined || typeof interval.startTime === 'string') &&
    (interval.endTime === undefined || typeof interval.endTime === 'string')
  )
}

// Location type guards
export function isLocation(obj: any): obj is Location {
  return (
    isEntity(obj) &&
    'locationType' in obj &&
    (obj.locationType === 'point' || obj.locationType === 'extent')
  )
}

export function isLocationPoint(obj: any): obj is LocationPoint {
  return (
    isLocation(obj) &&
    obj.locationType === 'point' &&
    'coordinates' in obj &&
    typeof obj.coordinates === 'object'
  )
}

export function isLocationExtent(obj: any): obj is LocationExtent {
  return (
    isLocation(obj) &&
    obj.locationType === 'extent' &&
    ('boundary' in obj || 'boundingBox' in obj)
  )
}

// Entity type guard
export function isEntity(obj: any): obj is Entity {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.description) &&
    Array.isArray(obj.typeAssignments) &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  )
}

// Event type guard
export function isEvent(obj: any): obj is Event {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.description) &&
    Array.isArray(obj.personaInterpretations) &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  )
}

// Collection type guards
export function isEntityCollection(obj: any): obj is EntityCollection {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.entityIds) &&
    typeof obj.collectionType === 'string' &&
    ['group', 'kind', 'functional', 'stage', 'portion', 'variant'].includes(obj.collectionType)
  )
}

export function isEventCollection(obj: any): obj is EventCollection {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.eventIds) &&
    typeof obj.collectionType === 'string' &&
    ['sequence', 'iteration', 'complex', 'alternative', 'group'].includes(obj.collectionType)
  )
}

export function isTimeCollection(obj: any): obj is TimeCollection {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.times) &&
    typeof obj.collectionType === 'string' &&
    ['periodic', 'cyclical', 'calendar', 'irregular', 'anchored'].includes(obj.collectionType)
  )
}

// Annotation type guards
export function isObjectAnnotation(annotation: Annotation): annotation is ObjectAnnotation {
  return annotation.annotationType === 'object'
}

export function isTypeAnnotation(annotation: Annotation): annotation is TypeAnnotation {
  return annotation.annotationType === 'type'
}

// Object annotation validators
export function hasEntityLink(annotation: ObjectAnnotation): boolean {
  return !!annotation.linkedEntityId
}

export function hasEventLink(annotation: ObjectAnnotation): boolean {
  return !!annotation.linkedEventId
}

export function hasTimeLink(annotation: ObjectAnnotation): boolean {
  return !!annotation.linkedTimeId
}

export function hasLocationLink(annotation: ObjectAnnotation): boolean {
  return !!annotation.linkedLocationId
}

export function hasCollectionLink(annotation: ObjectAnnotation): boolean {
  return !!(
    annotation.linkedCollectionId &&
    annotation.linkedCollectionType
  )
}

export function isValidObjectAnnotation(annotation: ObjectAnnotation): boolean {
  // Must have exactly one type of link
  const linkCount = [
    hasEntityLink(annotation),
    hasEventLink(annotation),
    hasTimeLink(annotation),
    hasLocationLink(annotation),
    hasCollectionLink(annotation),
  ].filter(Boolean).length
  
  if (linkCount !== 1) return false
  
  // Must have spatial or temporal information
  const hasSpatial = !!(annotation.boundingBox || annotation.boundingBoxSequence)
  const hasTemporal = !!(annotation.time || annotation.timeSpan)
  
  return hasSpatial || hasTemporal
}

export function isValidTypeAnnotation(annotation: TypeAnnotation): boolean {
  // Must have persona
  if (!annotation.personaId) return false
  
  // Must have type category and ID
  if (!annotation.typeCategory || !annotation.typeId) return false
  
  // Must have spatial or temporal information
  const hasSpatial = !!(annotation.boundingBox || annotation.boundingBoxSequence)
  const hasTemporal = !!(annotation.time || annotation.timeSpan)
  
  return hasSpatial || hasTemporal
}

export function isValidAnnotation(annotation: Annotation): boolean {
  if (isObjectAnnotation(annotation)) {
    return isValidObjectAnnotation(annotation)
  } else if (isTypeAnnotation(annotation)) {
    return isValidTypeAnnotation(annotation)
  }
  return false
}

// UUID validator
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

// Validators for creating new objects
export function validateEntity(entity: Partial<Entity>): string[] {
  const errors: string[] = []
  
  if (!entity.name || entity.name.trim() === '') {
    errors.push('Entity name is required')
  }
  
  if (!entity.description || !Array.isArray(entity.description)) {
    errors.push('Entity description must be an array of GlossItems')
  }
  
  if (entity.id && !isValidUUID(entity.id)) {
    errors.push('Entity ID must be a valid UUID')
  }
  
  return errors
}

export function validateEvent(event: Partial<Event>): string[] {
  const errors: string[] = []
  
  if (!event.name || event.name.trim() === '') {
    errors.push('Event name is required')
  }
  
  if (!event.description || !Array.isArray(event.description)) {
    errors.push('Event description must be an array of GlossItems')
  }
  
  if (event.id && !isValidUUID(event.id)) {
    errors.push('Event ID must be a valid UUID')
  }
  
  if (event.time && !isTime(event.time)) {
    errors.push('Event time must be a valid Time object')
  }
  
  if (event.location && !isLocation(event.location)) {
    errors.push('Event location must be a valid Location object')
  }
  
  return errors
}

export function validateTimeInstant(time: Partial<TimeInstant>): string[] {
  const errors: string[] = []
  
  if (!time.timestamp) {
    errors.push('TimeInstant must have a timestamp')
  } else {
    // Validate ISO 8601 format
    const date = new Date(time.timestamp)
    if (isNaN(date.getTime())) {
      errors.push('TimeInstant timestamp must be a valid ISO 8601 date')
    }
  }
  
  if (time.id && !isValidUUID(time.id)) {
    errors.push('Time ID must be a valid UUID')
  }
  
  return errors
}

export function validateTimeInterval(time: Partial<TimeInterval>): string[] {
  const errors: string[] = []
  
  if (time.startTime) {
    const startDate = new Date(time.startTime)
    if (isNaN(startDate.getTime())) {
      errors.push('TimeInterval startTime must be a valid ISO 8601 date')
    }
  }
  
  if (time.endTime) {
    const endDate = new Date(time.endTime)
    if (isNaN(endDate.getTime())) {
      errors.push('TimeInterval endTime must be a valid ISO 8601 date')
    }
  }
  
  if (time.startTime && time.endTime) {
    const start = new Date(time.startTime)
    const end = new Date(time.endTime)
    if (start > end) {
      errors.push('TimeInterval startTime must be before endTime')
    }
  }
  
  if (time.id && !isValidUUID(time.id)) {
    errors.push('Time ID must be a valid UUID')
  }
  
  return errors
}

// Helper function to check if annotation mode requires persona
export function annotationModeRequiresPersona(mode: string): boolean {
  return mode === 'type-assignment'
}

// Helper function to get annotation link type
export function getAnnotationLinkType(annotation: Annotation): string | null {
  if (isTypeAnnotation(annotation)) {
    return 'type'
  } else if (isObjectAnnotation(annotation)) {
    if (hasEntityLink(annotation)) return 'entity'
    if (hasEventLink(annotation)) return 'event'
    if (hasTimeLink(annotation)) return 'time'
    if (hasLocationLink(annotation)) return 'location'
    if (hasCollectionLink(annotation)) return annotation.linkedCollectionType || 'collection'
  }
  return null
}