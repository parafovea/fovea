/**
 * @interface GlossItem
 * @description A segment of rich text that can contain plain text or references
 * to ontology types, world objects, annotations, or claims. Used for glosses,
 * descriptions, and any text that needs to link to other entities.
 */
export interface GlossItem {
  /** The type of content this item represents */
  type: 'text' | 'typeRef' | 'objectRef' | 'annotationRef' | 'claimRef'
  /** The text content or reference ID */
  content: string
  /** For references, the type of entity being referenced */
  refType?: 'entity' | 'role' | 'event' | 'relation' | 'entity-object' | 'event-object' | 'time-object' | 'location-object' | 'annotation' | 'claim'
  /** For type references, the persona whose ontology contains the type */
  refPersonaId?: string | null
  /** For claim references, the UUID of the referenced claim */
  refClaimId?: string
}

/**
 * @description Constraint that limits which types are allowed.
 */
interface AllowedTypesConstraint {
  /** The kind of constraint being applied */
  type: 'allowedTypes'
  /** Array of allowed type IDs */
  value: string[]
}

/**
 * @description Constraint that specifies required properties.
 */
interface RequiredPropertiesConstraint {
  /** The kind of constraint being applied */
  type: 'requiredProperties'
  /** Array of required property names */
  value: string[]
}

/**
 * @description Constraint that defines a valid numeric range.
 */
interface ValueRangeConstraint {
  /** The kind of constraint being applied */
  type: 'valueRange'
  /** The min/max range values */
  value: { min?: number; max?: number }
}

/**
 * @description Defines constraints on ontology types, such as allowed values,
 * required properties, or valid ranges. Uses discriminated union for type safety.
 */
export type TypeConstraint = AllowedTypesConstraint | RequiredPropertiesConstraint | ValueRangeConstraint
