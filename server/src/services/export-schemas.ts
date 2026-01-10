/**
 * Zod schemas for export/import validation.
 *
 * These schemas validate the JSONL export format used for data portability.
 * Each line in an export file is validated against one of these schemas.
 *
 * Design principles:
 * 1. Use type inference (z.infer<typeof schema>) - single source of truth
 * 2. Use safeParse - never throw, return result objects for error handling
 * 3. Schema composition - use .extend(), .pick(), .omit(), .partial() for DRY
 * 4. Discriminated unions - efficient type narrowing via z.discriminatedUnion()
 */
import { z } from 'zod'

// =============================================================================
// BASE SCHEMAS (Reusable building blocks)
// =============================================================================

/**
 * Gloss item schema - rich text with references to types, objects, annotations, and claims.
 */
export const GlossItemSchema = z.object({
  type: z.enum(['text', 'typeRef', 'objectRef', 'annotationRef']),
  content: z.string(),
  refType: z.enum([
    'entity', 'role', 'event', 'relation',
    'entity-object', 'event-object', 'time-object', 'location-object',
    'annotation'
  ]).optional(),
  refPersonaId: z.string().uuid().optional(),
})

/**
 * Type constraint schema for ontology types.
 */
export const TypeConstraintSchema = z.object({
  type: z.enum(['allowedTypes', 'requiredProperties', 'valueRange']),
  value: z.union([
    z.array(z.string()),
    z.record(z.string(), z.unknown()),
    z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }),
  ]),
})

/**
 * Bounding box schema for spatial annotations.
 */
export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  frameNumber: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  isKeyframe: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Interpolation segment schema for bounding box sequences.
 */
export const InterpolationSegmentSchema = z.object({
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().nonnegative(),
  type: z.enum(['linear', 'bezier', 'ease-in', 'ease-out', 'ease-in-out', 'hold', 'parametric']),
  controlPoints: z.unknown().optional(),
  parametric: z.unknown().optional(),
})

/**
 * Visibility range schema for bounding box sequences.
 */
export const VisibilityRangeSchema = z.object({
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().nonnegative(),
  visible: z.boolean(),
})

/**
 * Bounding box sequence schema - complete spatial annotation data.
 * Empty sequences are valid (for ontology-only annotations).
 */
export const BoundingBoxSequenceSchema = z.object({
  boxes: z.array(BoundingBoxSchema),
  interpolationSegments: z.array(InterpolationSegmentSchema),
  visibilityRanges: z.array(VisibilityRangeSchema),
  trackId: z.union([z.string(), z.number()]).optional(),
  trackingSource: z.enum(['manual', 'samurai', 'sam2long', 'sam2', 'yolo11seg']).optional(),
  trackingConfidence: z.number().min(0).max(1).optional(),
  totalFrames: z.number().int().nonnegative(),
  keyframeCount: z.number().int().nonnegative(),
  interpolatedFrameCount: z.number().int().nonnegative(),
})

// =============================================================================
// ONTOLOGY TYPE SCHEMAS
// =============================================================================

/**
 * Entity type schema.
 */
export const EntityTypeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  gloss: z.array(GlossItemSchema),
  constraints: z.array(TypeConstraintSchema).optional(),
  examples: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Event role schema for event types.
 */
export const EventRoleSchema = z.object({
  roleTypeId: z.string(),
  optional: z.boolean(),
  excludes: z.array(z.string()).optional(),
  minOccurrences: z.number().int().nonnegative().optional(),
  maxOccurrences: z.number().int().positive().optional(),
})

/**
 * Event type schema.
 */
export const EventTypeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  gloss: z.array(GlossItemSchema),
  roles: z.array(EventRoleSchema),
  parentEventId: z.string().optional(),
  examples: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Role type schema.
 */
export const RoleTypeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  gloss: z.array(GlossItemSchema),
  allowedFillerTypes: z.array(z.enum(['entity', 'event'])),
  constraints: z.array(TypeConstraintSchema).optional(),
  examples: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Relation type schema.
 */
export const RelationTypeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  gloss: z.array(GlossItemSchema),
  sourceTypes: z.array(z.enum(['entity', 'role', 'event', 'time'])),
  targetTypes: z.array(z.enum(['entity', 'role', 'event', 'time'])),
  constraints: z.array(TypeConstraintSchema).optional(),
  symmetric: z.boolean().optional(),
  transitive: z.boolean().optional(),
  examples: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Ontology relation schema (instance of relation between types).
 */
export const OntologyRelationSchema = z.object({
  id: z.string(),
  relationTypeId: z.string(),
  sourceType: z.enum(['entity', 'role', 'event', 'time']),
  sourceId: z.string(),
  targetType: z.enum(['entity', 'role', 'event', 'time']),
  targetId: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// =============================================================================
// WORLD STATE OBJECT SCHEMAS
// =============================================================================

/**
 * Entity type assignment schema.
 */
export const EntityTypeAssignmentSchema = z.object({
  personaId: z.string(),
  entityTypeId: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  justification: z.string().optional(),
})

/**
 * Entity schema (world object).
 */
export const EntitySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.array(GlossItemSchema),
  typeAssignments: z.array(EntityTypeAssignmentSchema),
  metadata: z.object({
    alternateNames: z.array(z.string()).optional(),
    externalIds: z.record(z.string(), z.string()).optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Time schema (temporal reference).
 */
export const TimeSchema = z.object({
  id: z.string(),
  type: z.enum(['instant', 'interval']),
  timestamp: z.string().optional(), // For instants
  startTime: z.string().optional(), // For intervals
  endTime: z.string().optional(), // For intervals
  videoReferences: z.array(z.object({
    videoId: z.string(),
    frameNumber: z.number().optional(),
    frameRange: z.tuple([z.number(), z.number()]).optional(),
    milliseconds: z.number().optional(),
    millisecondRange: z.tuple([z.number(), z.number()]).optional(),
  })).optional(),
  vagueness: z.object({
    type: z.enum(['approximate', 'bounded', 'fuzzy']),
    description: z.string().optional(),
    bounds: z.object({
      earliest: z.string().optional(),
      latest: z.string().optional(),
      typical: z.string().optional(),
    }).optional(),
    granularity: z.enum(['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year']).optional(),
  }).optional(),
  certainty: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Event interpretation schema.
 */
export const EventInterpretationSchema = z.object({
  personaId: z.string(),
  eventTypeId: z.string(),
  participants: z.array(z.object({
    entityId: z.string(),
    roleTypeId: z.string(),
  })),
  confidence: z.number().min(0).max(1).optional(),
  justification: z.string().optional(),
})

/**
 * Event schema (world object).
 */
export const EventSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.array(GlossItemSchema),
  personaInterpretations: z.array(EventInterpretationSchema),
  time: TimeSchema.optional(),
  location: z.unknown().optional(), // Location can be complex
  metadata: z.object({
    certainty: z.number().min(0).max(1).optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Entity collection schema.
 */
export const EntityCollectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.array(GlossItemSchema),
  entityIds: z.array(z.string()),
  collectionType: z.enum(['group', 'kind', 'functional', 'stage', 'portion', 'variant']),
  typeAssignments: z.array(EntityTypeAssignmentSchema),
  aggregateProperties: z.object({
    homogeneous: z.boolean().optional(),
    ordered: z.boolean().optional(),
    mereological: z.enum(['mass', 'count', 'mixed']).optional(),
  }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Event collection schema.
 */
export const EventCollectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.array(GlossItemSchema),
  eventIds: z.array(z.string()),
  collectionType: z.enum(['sequence', 'iteration', 'complex', 'alternative', 'group']),
  typeAssignments: z.array(z.object({
    personaId: z.string(),
    eventTypeId: z.string(),
    confidence: z.number().min(0).max(1).optional(),
    justification: z.string().optional(),
  })),
  timeCollectionId: z.string().optional(),
  structure: z.unknown().optional(), // Complex recursive structure
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Time collection schema.
 */
export const TimeCollectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  times: z.array(TimeSchema),
  collectionType: z.enum(['periodic', 'calendar', 'irregular', 'anchored', 'habitual']),
  recurrence: z.unknown().optional(), // Complex recurrence rule
  habituality: z.unknown().optional(), // Complex habitual pattern
  cycle: z.unknown().optional(), // Complex cyclical pattern
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// =============================================================================
// ANNOTATION SCHEMAS
// =============================================================================

/**
 * Annotation data schema (the data field inside annotation export line).
 */
export const AnnotationDataSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  annotationType: z.enum(['type', 'object']),
  boundingBoxSequence: BoundingBoxSequenceSchema,
  // Type annotation fields (optional)
  personaId: z.string().optional(),
  typeId: z.string().optional(),
  typeCategory: z.enum(['entity', 'role', 'event']).optional(),
  // Object annotation fields (optional)
  linkedEntityId: z.string().optional(),
  linkedEventId: z.string().optional(),
  linkedTimeId: z.string().optional(),
  linkedLocationId: z.string().optional(),
  linkedCollectionId: z.string().optional(),
  linkedCollectionType: z.enum(['entity', 'event', 'time']).optional(),
  // Common metadata
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// =============================================================================
// SUMMARY AND CLAIM SCHEMAS
// =============================================================================

/**
 * Video summary schema.
 */
export const VideoSummarySchema = z.object({
  id: z.string(),
  videoId: z.string(),
  personaId: z.string(),
  summary: z.array(GlossItemSchema),
  visualAnalysis: z.string().optional(),
  audioTranscript: z.string().optional(),
  keyFrames: z.unknown().optional(),
  confidence: z.number().min(0).max(1).optional(),
  transcriptJson: z.unknown().optional(),
  audioLanguage: z.string().optional(),
  speakerCount: z.number().int().nonnegative().optional(),
  audioModelUsed: z.string().optional(),
  visualModelUsed: z.string().optional(),
  fusionStrategy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().optional(),
})

/**
 * Text span schema for claims.
 */
export const TextSpanSchema = z.object({
  sentenceIndex: z.number().int().nonnegative().optional(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
})

/**
 * Claim schema.
 */
export const ClaimSchema = z.object({
  id: z.string(),
  summaryId: z.string(),
  summaryType: z.enum(['video', 'collection']),
  text: z.string(),
  gloss: z.array(GlossItemSchema),
  parentClaimId: z.string().optional(),
  textSpans: z.array(TextSpanSchema).optional(),
  claimerType: z.enum(['entity', 'entity_type', 'author', 'mixed']).nullable().optional(),
  claimerGloss: z.array(GlossItemSchema).optional(),
  confidence: z.number().min(0).max(1).optional(),
  claimType: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Claim relation schema.
 */
export const ClaimRelationSchema = z.object({
  id: z.string(),
  sourceClaimId: z.string(),
  targetClaimId: z.string(),
  relationTypeId: z.string(),
  sourceSpans: z.array(z.object({
    charStart: z.number().int().nonnegative(),
    charEnd: z.number().int().nonnegative(),
  })).optional(),
  targetSpans: z.array(z.object({
    charStart: z.number().int().nonnegative(),
    charEnd: z.number().int().nonnegative(),
  })).optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// =============================================================================
// PERSONA SCHEMAS
// =============================================================================

/**
 * Persona schema.
 */
export const PersonaSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.string().min(1),
  informationNeed: z.string().min(1),
  details: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Ontology schema (persona's type system).
 */
export const OntologySchema = z.object({
  personaId: z.string(),
  entityTypes: z.array(EntityTypeSchema),
  eventTypes: z.array(EventTypeSchema),
  roleTypes: z.array(RoleTypeSchema),
  relationTypes: z.array(RelationTypeSchema),
  relations: z.array(OntologyRelationSchema).optional(),
})

// =============================================================================
// EXPORT LINE DISCRIMINATED UNION
// =============================================================================

/**
 * Export line schema - discriminated union of all exportable data types.
 * Uses z.discriminatedUnion() for efficient type narrowing.
 */
export const ExportLineSchema = z.discriminatedUnion('type', [
  // Persona
  z.object({
    type: z.literal('persona'),
    data: PersonaSchema,
  }),
  // Ontology (linked to persona)
  z.object({
    type: z.literal('ontology'),
    data: OntologySchema,
  }),
  // Annotation
  z.object({
    type: z.literal('annotation'),
    data: AnnotationDataSchema,
  }),
  // Entity (world object)
  z.object({
    type: z.literal('entity'),
    data: EntitySchema,
  }),
  // Event (world object)
  z.object({
    type: z.literal('event'),
    data: EventSchema,
  }),
  // Time (world object)
  z.object({
    type: z.literal('time'),
    data: TimeSchema,
  }),
  // Entity collection
  z.object({
    type: z.literal('entity_collection'),
    data: EntityCollectionSchema,
  }),
  // Event collection
  z.object({
    type: z.literal('event_collection'),
    data: EventCollectionSchema,
  }),
  // Time collection
  z.object({
    type: z.literal('time_collection'),
    data: TimeCollectionSchema,
  }),
  // Relation (between world objects)
  z.object({
    type: z.literal('relation'),
    data: OntologyRelationSchema,
  }),
  // Video summary
  z.object({
    type: z.literal('summary'),
    data: VideoSummarySchema,
  }),
  // Claim
  z.object({
    type: z.literal('claim'),
    data: ClaimSchema,
  }),
  // Claim relation
  z.object({
    type: z.literal('claim_relation'),
    data: ClaimRelationSchema,
  }),
])

// =============================================================================
// TYPE INFERENCE (Single source of truth)
// =============================================================================

export type ExportLine = z.infer<typeof ExportLineSchema>
export type PersonaExport = z.infer<typeof PersonaSchema>
export type OntologyExport = z.infer<typeof OntologySchema>
export type AnnotationExport = z.infer<typeof AnnotationDataSchema>
export type EntityExport = z.infer<typeof EntitySchema>
export type EventExport = z.infer<typeof EventSchema>
export type TimeExport = z.infer<typeof TimeSchema>
export type SummaryExport = z.infer<typeof VideoSummarySchema>
export type ClaimExport = z.infer<typeof ClaimSchema>
export type ClaimRelationExport = z.infer<typeof ClaimRelationSchema>
export type BoundingBoxSequence = z.infer<typeof BoundingBoxSequenceSchema>

// =============================================================================
// PARSING UTILITIES
// =============================================================================

/**
 * Result of parsing an export line.
 */
export interface ParseResult {
  valid: boolean
  lineNumber: number
  data?: ExportLine
  errors?: string[]
}

/**
 * Safe parsing helper for export lines.
 * Never throws - returns a ParseResult object.
 *
 * @param line - JSON string to parse
 * @param lineNumber - Line number for error reporting
 * @returns ParseResult with either data or errors
 */
export function parseExportLine(line: string, lineNumber: number): ParseResult {
  // Skip empty lines
  if (!line.trim()) {
    return { valid: true, lineNumber }
  }

  try {
    const json = JSON.parse(line)
    const result = ExportLineSchema.safeParse(json)

    if (!result.success) {
      return {
        valid: false,
        lineNumber,
        errors: result.error.issues.map(issue =>
          `${issue.path.join('.')}: ${issue.message}`
        ),
      }
    }

    return { valid: true, lineNumber, data: result.data }
  } catch (error) {
    return {
      valid: false,
      lineNumber,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`],
    }
  }
}

/**
 * Parse multiple export lines from JSONL content.
 *
 * @param content - JSONL content (newline-delimited JSON)
 * @returns Array of ParseResults
 */
export function parseExportContent(content: string): ParseResult[] {
  const lines = content.split('\n')
  return lines.map((line, index) => parseExportLine(line, index + 1))
}

/**
 * Validate and categorize parsed export lines.
 *
 * @param results - Array of ParseResults from parseExportContent
 * @returns Object with valid lines by type and any errors
 */
export function categorizeExportLines(results: ParseResult[]) {
  const valid: ExportLine[] = []
  const errors: Array<{ lineNumber: number; errors: string[] }> = []

  for (const result of results) {
    if (result.valid && result.data) {
      valid.push(result.data)
    } else if (!result.valid && result.errors) {
      errors.push({ lineNumber: result.lineNumber, errors: result.errors })
    }
  }

  // Categorize by type
  const personas = valid.filter((l): l is Extract<ExportLine, { type: 'persona' }> => l.type === 'persona')
  const ontologies = valid.filter((l): l is Extract<ExportLine, { type: 'ontology' }> => l.type === 'ontology')
  const annotations = valid.filter((l): l is Extract<ExportLine, { type: 'annotation' }> => l.type === 'annotation')
  const entities = valid.filter((l): l is Extract<ExportLine, { type: 'entity' }> => l.type === 'entity')
  const events = valid.filter((l): l is Extract<ExportLine, { type: 'event' }> => l.type === 'event')
  const times = valid.filter((l): l is Extract<ExportLine, { type: 'time' }> => l.type === 'time')
  const entityCollections = valid.filter((l): l is Extract<ExportLine, { type: 'entity_collection' }> => l.type === 'entity_collection')
  const eventCollections = valid.filter((l): l is Extract<ExportLine, { type: 'event_collection' }> => l.type === 'event_collection')
  const timeCollections = valid.filter((l): l is Extract<ExportLine, { type: 'time_collection' }> => l.type === 'time_collection')
  const relations = valid.filter((l): l is Extract<ExportLine, { type: 'relation' }> => l.type === 'relation')
  const summaries = valid.filter((l): l is Extract<ExportLine, { type: 'summary' }> => l.type === 'summary')
  const claims = valid.filter((l): l is Extract<ExportLine, { type: 'claim' }> => l.type === 'claim')
  const claimRelations = valid.filter((l): l is Extract<ExportLine, { type: 'claim_relation' }> => l.type === 'claim_relation')

  return {
    personas,
    ontologies,
    annotations,
    entities,
    events,
    times,
    entityCollections,
    eventCollections,
    timeCollections,
    relations,
    summaries,
    claims,
    claimRelations,
    errors,
    totalValid: valid.length,
    totalErrors: errors.length,
  }
}
