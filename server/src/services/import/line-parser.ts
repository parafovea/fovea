/**
 * Pure parsing and validation of JSONL import lines.
 *
 * These functions have no database or authorization dependencies: they turn
 * a raw line into an ImportLine and check its structural validity. The
 * sequence-shape validation is delegated to a SequenceValidator passed in by
 * the caller so this module stays free of class state.
 *
 * @module
 */

import { ValidationError } from '../../lib/errors.js'
import { ImportLine, ValidationResult } from '../import-types.js'
import { SequenceValidator } from '../import-validator.js'
import { BoundingBoxSequenceData } from './types.js'

/**
 * Parse a single line from a JSON Lines file.
 *
 * @param line - raw line string
 * @param lineNumber - line number in the file
 * @returns the parsed import line
 * @throws {ValidationError} when the line is not valid JSON or lacks the
 *   required `type` and `data` fields
 */
export function parseLine(line: string, lineNumber: number): ImportLine {
  try {
    const parsed = JSON.parse(line)

    if (!parsed.type || !parsed.data) {
      throw new ValidationError('Line must have "type" and "data" fields')
    }

    return {
      type: parsed.type,
      data: parsed.data,
      lineNumber
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    throw new ValidationError(`Failed to parse line ${lineNumber}: ${errorMessage}`)
  }
}

/**
 * Validate a parsed import line.
 *
 * @param line - import line to validate
 * @param validator - sequence validator used for annotation bounding boxes
 * @returns the validation result with errors and warnings
 */
export function validateLine(line: ImportLine, validator: SequenceValidator): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate based on line type
  switch (line.type) {
    case 'annotation':
      // Validate annotation structure
      if (!line.data.id) {
        errors.push('Annotation missing required field: id')
      }
      if (!line.data.videoId) {
        errors.push('Annotation missing required field: videoId')
      }
      if (!line.data.boundingBoxSequence) {
        errors.push('Annotation missing required field: boundingBoxSequence')
      } else {
        // Validate sequence - safely cast to the type expected by validator
        const seqValidation = validator.validateSequence(line.data.boundingBoxSequence as BoundingBoxSequenceData)
        errors.push(...seqValidation.errors)
        warnings.push(...seqValidation.warnings)
      }

      // Validate annotation type
      if (line.data.annotationType === 'type') {
        if (!line.data.personaId) {
          errors.push('Type annotation missing required field: personaId')
        }
        if (!line.data.typeId) {
          errors.push('Type annotation missing required field: typeId')
        }
        if (!line.data.typeCategory) {
          errors.push('Type annotation missing required field: typeCategory')
        }
      } else if (line.data.annotationType === 'object') {
        // Object annotation should have at least one linked field
        const hasLink = line.data.linkedEntityId ||
                       line.data.linkedEventId ||
                       line.data.linkedTimeId ||
                       line.data.linkedLocationId ||
                       line.data.linkedCollectionId
        if (!hasLink) {
          warnings.push('Object annotation has no linked object')
        }
      }
      break

    case 'entity':
    case 'event':
    case 'time':
      if (!line.data.id) {
        errors.push(`${line.type} missing required field: id`)
      }
      if (!line.data.name && line.type !== 'time') {
        errors.push(`${line.type} missing required field: name`)
      }
      break

    case 'persona':
      // Validate persona structure
      if (!line.data.id) {
        errors.push('Persona missing required field: id')
      }
      if (!line.data.name) {
        errors.push('Persona missing required field: name')
      }
      if (!line.data.role) {
        errors.push('Persona missing required field: role')
      }
      if (!line.data.informationNeed) {
        errors.push('Persona missing required field: informationNeed')
      }
      break

    case 'ontology':
      // Validate ontology structure - new format uses personaId
      if (!line.data.personaId) {
        // Check for legacy format with personas array
        if (!line.data.personas || !Array.isArray(line.data.personas)) {
          errors.push('Ontology missing required field: personaId')
        }
      }
      break

    case 'summary':
      // Validate summary structure
      if (!line.data.id) {
        errors.push('Summary missing required field: id')
      }
      if (!line.data.videoId) {
        errors.push('Summary missing required field: videoId')
      }
      if (!line.data.personaId) {
        errors.push('Summary missing required field: personaId')
      }
      break

    case 'claim':
      // Validate claim structure
      if (!line.data.id) {
        errors.push('Claim missing required field: id')
      }
      if (!line.data.summaryId) {
        errors.push('Claim missing required field: summaryId')
      }
      if (!line.data.text) {
        errors.push('Claim missing required field: text')
      }
      break

    case 'claim_relation':
      // Validate claim relation structure
      if (!line.data.id) {
        errors.push('ClaimRelation missing required field: id')
      }
      if (!line.data.sourceClaimId) {
        errors.push('ClaimRelation missing required field: sourceClaimId')
      }
      if (!line.data.targetClaimId) {
        errors.push('ClaimRelation missing required field: targetClaimId')
      }
      if (!line.data.relationTypeId) {
        errors.push('ClaimRelation missing required field: relationTypeId')
      }
      break

    case 'video':
      if (!line.data.id) {
        errors.push('Video missing required field: id')
      }
      break

    case 'relation':
      if (!line.data.id) {
        errors.push('Relation missing required field: id')
      }
      break

    case 'entity_collection':
    case 'event_collection':
    case 'time_collection':
      if (!line.data.id) {
        errors.push(`Collection missing required field: id`)
      }
      break

    case 'metadata':
      // Metadata lines are informational only
      break

    default:
      warnings.push(`Unknown line type: ${line.type}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
