/**
 * Pure dependency-graph construction and ownership lookup for imports.
 *
 * These functions derive cross-line dependencies from a batch of import
 * lines and answer whether a given id is owned by the importing user. They
 * take their inputs as parameters and touch neither prisma nor the
 * authorization layer.
 *
 * @module
 */

import { DependencyGraph, ExistingData, ImportLine } from '../import-types.js'
import {
  AnnotationData,
  CollectionData,
  EntityData,
  EventData,
  OntologyData,
  PersonaData,
  TimeData
} from './types.js'

/**
 * Record that `dependentId` references `refId` in the dependency graph.
 *
 * @param graph - dependency graph to mutate
 * @param refId - id being referenced
 * @param dependentId - id that depends on `refId`
 */
export function addReference(graph: DependencyGraph, refId: string, dependentId: string): void {
  if (!graph.references.has(refId)) {
    graph.references.set(refId, new Set())
  }
  graph.references.get(refId)!.add(dependentId)
}

/**
 * Build a dependency graph from a batch of import lines.
 *
 * @param lines - array of import lines
 * @returns the dependency graph describing personas, world objects,
 *   annotations, and the references between them
 */
export function buildDependencyGraph(lines: ImportLine[]): DependencyGraph {
  const graph: DependencyGraph = {
    personas: new Set(),
    ontologies: new Map(),
    entities: new Set(),
    events: new Set(),
    times: new Set(),
    collections: new Set(),
    annotations: new Map(),
    references: new Map()
  }

  for (const line of lines) {
    switch (line.type) {
      case 'ontology': {
        const ontologyData = line.data as { personas?: PersonaData[]; personaOntologies?: OntologyData[] }
        // Track personas
        for (const persona of ontologyData.personas || []) {
          graph.personas.add(persona.id)
        }
        // Track ontologies
        for (const ontology of ontologyData.personaOntologies || []) {
          graph.ontologies.set(ontology.id, ontology.personaId)
        }
        break
      }

      case 'entity': {
        const entityData = line.data as EntityData
        graph.entities.add(entityData.id)
        // Track persona references
        for (const assignment of entityData.typeAssignments || []) {
          addReference(graph, assignment.personaId, entityData.id)
        }
        break
      }

      case 'event': {
        const eventData = line.data as EventData
        graph.events.add(eventData.id)
        // Track persona references
        for (const interpretation of eventData.personaInterpretations || []) {
          addReference(graph, interpretation.personaId, eventData.id)
          // Track entity references (participants)
          for (const participant of interpretation.participants || []) {
            addReference(graph, participant.entityId, eventData.id)
          }
        }
        break
      }

      case 'time': {
        const timeData = line.data as TimeData
        graph.times.add(timeData.id)
        break
      }

      case 'entityCollection':
      case 'eventCollection':
      case 'timeCollection': {
        const collectionData = line.data as CollectionData
        graph.collections.add(collectionData.id)
        break
      }

      case 'annotation': {
        const annotationData = line.data as AnnotationData
        const deps: string[] = []

        // Add video dependency
        deps.push(annotationData.videoId)

        // Add persona dependency (for type annotations)
        if (annotationData.personaId) {
          deps.push(annotationData.personaId)
        }

        // Add linked object dependencies
        if (annotationData.linkedEntityId) deps.push(annotationData.linkedEntityId)
        if (annotationData.linkedEventId) deps.push(annotationData.linkedEventId)
        if (annotationData.linkedTimeId) deps.push(annotationData.linkedTimeId)
        if (annotationData.linkedLocationId) deps.push(annotationData.linkedLocationId)
        if (annotationData.linkedCollectionId) deps.push(annotationData.linkedCollectionId)

        graph.annotations.set(annotationData.id, deps)
        break
      }
    }
  }

  return graph
}

/**
 * Determine whether an id is owned by the importing user.
 *
 * @param id - candidate id from an import line
 * @param type - import line type the id belongs to
 * @param existingData - existing database data with ownership sets
 * @returns true when the id is owned by the importing user
 */
export function isOwnedByImporter(id: string, type: string, existingData: ExistingData): boolean {
  switch (type) {
    case 'persona': return existingData.ownedPersonaIds.has(id)
    case 'annotation': return existingData.ownedAnnotationIds.has(id)
    case 'summary': return existingData.ownedSummaryIds.has(id)
    case 'claim': return existingData.ownedClaimIds.has(id)
    case 'claim_relation': return existingData.ownedClaimRelationIds.has(id)
    case 'entity': return existingData.ownedEntityIds.has(id)
    case 'event': return existingData.ownedEventIds.has(id)
    case 'time': return existingData.ownedTimeIds.has(id)
    case 'entity_collection': case 'entityCollection':
    case 'event_collection': case 'eventCollection':
    case 'time_collection': case 'timeCollection':
      return existingData.ownedCollectionIds.has(id)
    case 'relation': return existingData.ownedWorldStateId !== null
    default: return false
  }
}
