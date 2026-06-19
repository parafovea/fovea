import axios from 'axios'
import { Ontology, Annotation, VideoMetadata, OntologyExport, TrackingResponse, ExportOptions, ExportStats, ImportOptions, ImportPreview, ImportResult, ImportHistoryItem, BoundingBoxSequence } from '@models/types'

// Configure axios to include credentials (cookies) with all requests
// Required for Safari and other browsers with strict cookie policies
axios.defaults.withCredentials = true

const API_BASE = '/api'

/**
 * @interface TrackingOptions
 * @description Configuration options for object tracking request.
 * @property enableTracking - Whether to enable tracking (vs. detection only)
 * @property trackingModel - Name of tracking model to use
 * @property frameRange - Optional frame range as [start, end] tuple
 * @property confidenceThreshold - Minimum confidence for detections (0-1)
 * @property trackSingleObject - Whether to track only one object vs. all detected
 */
export interface TrackingOptions {
  enableTracking: boolean
  trackingModel: 'samurai' | 'sam2long' | 'sam2' | 'yolo11seg'
  frameRange?: [number, number]
  confidenceThreshold?: number
  trackSingleObject?: boolean
}

/**
 * Backend annotation format (what the database stores).
 */
export interface BackendAnnotation {
  id: string
  videoId: string
  personaId: string | null
  type: string
  label: string
  /// Object-annotation link kind: 'entity' | 'event' | 'time' | 'location'.
  /// NULL for type annotations and for legacy object annotations created
  /// before the column existed (frontend defaults those to entity-linked).
  linkType: 'entity' | 'event' | 'time' | 'location' | null
  frames: BoundingBoxSequence
  confidence: number | null
  source: string
  /// Display name of the linked world object, resolved server-side from the
  /// annotation owner's world. Present only on object annotations the server
  /// could resolve; absent or null otherwise.
  linkedObjectName?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Transforms backend annotation format to frontend format.
 * Backend stores: type, label, frames
 * Frontend expects: annotationType, typeId/linkedEntityId, boundingBoxSequence
 *
 * @param backendAnnotation - Annotation from database API
 * @returns Frontend-formatted annotation
 */
export function transformBackendToFrontend(backendAnnotation: BackendAnnotation): Annotation {
  const base = {
    id: backendAnnotation.id,
    videoId: backendAnnotation.videoId,
    boundingBoxSequence: backendAnnotation.frames,
    confidence: backendAnnotation.confidence ?? undefined,
    // Carry the server-resolved linked object name through so the overlay can
    // fall back to it when the local world lacks the linked object (a reviewer
    // reading another annotator's annotation).
    linkedObjectName: backendAnnotation.linkedObjectName ?? null,
    createdAt: backendAnnotation.createdAt,
    updatedAt: backendAnnotation.updatedAt,
    // Forward the server's source flag through the metadata bag so
    // the workspace can tell hand-authored fixture rows (source:
    // 'demo-fixture:...') from real user annotations. The flag is
    // required for the demo-mode per-video persona switch — it's
    // the signal that says 'this row was seeded for a tour, switch
    // the persona to match it'.
    metadata: { source: backendAnnotation.source },
  }

  if (backendAnnotation.type === 'type' && backendAnnotation.personaId) {
    // Type annotation - requires personaId
    return {
      ...base,
      annotationType: 'type' as const,
      personaId: backendAnnotation.personaId,
      typeId: backendAnnotation.label,
      typeCategory: 'entity', // Default to entity; this could be enhanced with metadata
    }
  } else {
    // Object annotation. Use the backend's linkType to populate the right
    // linked-id field on the frontend object so getObjectName resolves
    // against the correct world list (entities/events/times/locations).
    // NULL linkType is treated as entity-linked for back-compat with
    // annotations created before the column existed.
    const linkType = backendAnnotation.linkType ?? 'entity'
    if (linkType === 'event') {
      return { ...base, annotationType: 'object' as const, linkedEventId: backendAnnotation.label }
    }
    if (linkType === 'time') {
      return { ...base, annotationType: 'object' as const, linkedTimeId: backendAnnotation.label }
    }
    if (linkType === 'location') {
      return { ...base, annotationType: 'object' as const, linkedLocationId: backendAnnotation.label }
    }
    return { ...base, annotationType: 'object' as const, linkedEntityId: backendAnnotation.label }
  }
}

/**
 * Transforms frontend annotation format to backend format for create/update.
 * Frontend has: annotationType, typeId/linkedEntityId, boundingBoxSequence
 * Backend expects: type, label, frames
 *
 * @param annotation - Frontend annotation object
 * @returns Backend-formatted payload
 */
export function transformFrontendToBackend(annotation: Annotation): {
  id: string
  videoId: string
  personaId: string | null
  type: string
  label: string
  linkType: 'entity' | 'event' | 'time' | 'location' | null
  frames: BoundingBoxSequence | undefined
  confidence?: number
  source: string
} {
  let personaId: string | null
  let label: string
  let linkType: 'entity' | 'event' | 'time' | 'location' | null = null

  if (annotation.annotationType === 'type') {
    // Type annotations require personaId (persona-scoped ontology assignments)
    personaId = annotation.personaId
    label = annotation.typeId || 'unlabeled'
  } else {
    // Object annotations are persona-agnostic (world object links). Pick
    // the label from whichever linked-id field is set and tell the backend
    // which linkType to record so the round-trip preserves the distinction.
    personaId = null
    if (annotation.linkedEntityId) {
      label = annotation.linkedEntityId
      linkType = 'entity'
    } else if (annotation.linkedEventId) {
      label = annotation.linkedEventId
      linkType = 'event'
    } else if (annotation.linkedTimeId) {
      label = annotation.linkedTimeId
      linkType = 'time'
    } else if (annotation.linkedLocationId) {
      label = annotation.linkedLocationId
      linkType = 'location'
    } else {
      label = 'unlabeled'
    }
  }

  return {
    // Forward the client's stable local id so the create POST keeps it.
    // The backend create is idempotent on this id: a first create returns
    // 201 with the same id, and a lagged re-POST of an already-persisted
    // box updates it in place (200) instead of minting a duplicate row.
    id: annotation.id,
    videoId: annotation.videoId,
    personaId,
    type: annotation.annotationType,
    label,
    linkType,
    frames: annotation.boundingBoxSequence,
    confidence: annotation.confidence,
    source: 'manual'
  }
}

export const api = {
  // Videos
  async getVideos(): Promise<VideoMetadata[]> {
    const response = await axios.get(`${API_BASE}/videos`)
    return response.data
  },

  async getVideo(id: string): Promise<VideoMetadata> {
    const response = await axios.get(`${API_BASE}/videos/${id}`)
    return response.data
  },

  // Ontology
  async getOntology(): Promise<Ontology> {
    const response = await axios.get(`${API_BASE}/ontology`)
    return response.data
  },

  async saveOntology(ontology: Ontology): Promise<Ontology> {
    const response = await axios.put(`${API_BASE}/ontology`, ontology)
    return response.data
  },

  // Annotations
  async getAnnotations(videoId: string): Promise<Annotation[]> {
    const response = await axios.get<BackendAnnotation[]>(`${API_BASE}/annotations/${videoId}`)
    return response.data.map(transformBackendToFrontend)
  },

  async saveAnnotation(annotation: Annotation): Promise<Annotation> {
    const backendPayload = transformFrontendToBackend(annotation)
    const response = await axios.post<BackendAnnotation>(`${API_BASE}/annotations`, backendPayload)
    return transformBackendToFrontend(response.data)
  },

  async updateAnnotation(annotation: Annotation): Promise<Annotation> {
    const fullPayload = transformFrontendToBackend(annotation)

    // For PUT, we only send the updatable fields (not videoId/personaId)
    const backendPayload = {
      type: fullPayload.type,
      label: fullPayload.label,
      frames: fullPayload.frames,
      confidence: fullPayload.confidence,
      source: fullPayload.source
    }

    const response = await axios.put<BackendAnnotation>(`${API_BASE}/annotations/${annotation.id}`, backendPayload)
    return transformBackendToFrontend(response.data)
  },

  async deleteAnnotation(videoId: string, annotationId: string): Promise<void> {
    await axios.delete(`${API_BASE}/annotations/${videoId}/${annotationId}`)
  },

  // Export
  async exportOntology(): Promise<OntologyExport> {
    const [ontology, videos] = await Promise.all([
      this.getOntology(),
      this.getVideos(),
    ])

    // Collect all annotations
    const allAnnotations: Annotation[] = []
    for (const video of videos) {
      const annotations = await this.getAnnotations(video.id)
      allAnnotations.push(...annotations)
    }

    return {
      ontology,
      annotations: allAnnotations,
      videos,
      exportDate: new Date().toISOString(),
      exportVersion: '1.0.0',
    }
  },

  async validateOntology(data: OntologyExport): Promise<{ valid: boolean; errors?: Array<{ path: string; message: string; code?: string }> }> {
    const response = await axios.post(`${API_BASE}/ontology/validate`, data)
    return response.data
  },

  // Export as JSON Lines
  async downloadExport(): Promise<void> {
    const exportData = await this.exportOntology()

    const jsonLines: string[] = []

    // Export ontology types (personas and their ontologies)
    jsonLines.push(JSON.stringify({
      type: 'ontology',
      data: {
        personas: exportData.ontology.personas,
        personaOntologies: exportData.ontology.personaOntologies
      }
    }))

    // Export world state if it exists
    if (exportData.ontology.world) {
      const world = exportData.ontology.world

      // Export each entity
      world.entities.forEach(entity => {
        jsonLines.push(JSON.stringify({ type: 'entity', data: entity }))
      })

      // Export each event
      world.events.forEach(event => {
        jsonLines.push(JSON.stringify({ type: 'event', data: event }))
      })

      // Export each time
      world.times.forEach(time => {
        jsonLines.push(JSON.stringify({ type: 'time', data: time }))
      })

      // Export each entity collection
      world.entityCollections.forEach(collection => {
        jsonLines.push(JSON.stringify({ type: 'entityCollection', data: collection }))
      })

      // Export each event collection
      world.eventCollections.forEach(collection => {
        jsonLines.push(JSON.stringify({ type: 'eventCollection', data: collection }))
      })

      // Export each time collection
      world.timeCollections.forEach(collection => {
        jsonLines.push(JSON.stringify({ type: 'timeCollection', data: collection }))
      })

      // Export each relation
      world.relations.forEach(relation => {
        jsonLines.push(JSON.stringify({ type: 'relation', data: relation }))
      })
    }

    // Export annotations
    exportData.annotations.forEach(ann => {
      jsonLines.push(JSON.stringify({ type: 'annotation', data: ann }))
    })

    // Export videos
    exportData.videos.forEach(video => {
      jsonLines.push(JSON.stringify({ type: 'video', data: video }))
    })

    // Export metadata
    jsonLines.push(JSON.stringify({
      type: 'metadata',
      data: {
        exportDate: exportData.exportDate,
        exportVersion: exportData.exportVersion
      }
    }))

    // Create download
    const blob = new Blob([jsonLines.join('\n')], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fovea-export-${Date.now()}.jsonl`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  /**
   * Run object tracking on video frames.
   * Sends tracking request to model service and returns tracked object candidates.
   *
   * @param videoId - ID of video to track objects in
   * @param options - Tracking configuration options
   * @returns Promise resolving to tracking response with candidate tracks
   */
  async runTracking(
    videoId: string,
    options: TrackingOptions
  ): Promise<TrackingResponse> {
    const response = await axios.post(`${API_BASE}/model/track`, {
      videoId,
      ...options,
    })
    return response.data
  },

  /**
   * Get export statistics without performing the export.
   * Useful for estimating file size before downloading.
   *
   * @param options - Export filter options
   * @returns Promise resolving to export statistics
   */
  async getExportStats(options: ExportOptions = {}): Promise<ExportStats> {
    const params = new URLSearchParams()

    if (options.includeInterpolated !== undefined) {
      params.append('includeInterpolated', options.includeInterpolated.toString())
    }
    if (options.personaIds && options.personaIds.length > 0) {
      params.append('personaIds', options.personaIds.join(','))
    }
    if (options.videoIds && options.videoIds.length > 0) {
      params.append('videoIds', options.videoIds.join(','))
    }
    if (options.annotationTypes && options.annotationTypes.length > 0) {
      params.append('annotationTypes', options.annotationTypes.join(','))
    }

    const response = await axios.get(`${API_BASE}/export/stats?${params.toString()}`)
    return response.data
  },

  /**
   * Export annotations with bounding box sequences to JSON Lines format.
   * Downloads the export file directly to the user's browser.
   *
   * @param options - Export filter and format options
   */
  async exportAnnotations(options: ExportOptions = {}): Promise<void> {
    const params = new URLSearchParams()
    params.append('format', 'jsonl')

    if (options.includeInterpolated !== undefined) {
      params.append('includeInterpolated', options.includeInterpolated.toString())
    }
    if (options.personaIds && options.personaIds.length > 0) {
      params.append('personaIds', options.personaIds.join(','))
    }
    if (options.videoIds && options.videoIds.length > 0) {
      params.append('videoIds', options.videoIds.join(','))
    }
    if (options.annotationTypes && options.annotationTypes.length > 0) {
      params.append('annotationTypes', options.annotationTypes.join(','))
    }

    // Use blob response type to handle binary data
    const response = await axios.get(`${API_BASE}/export?${params.toString()}`, {
      responseType: 'blob'
    })

    // Extract filename from Content-Disposition header if available
    const contentDisposition = response.headers['content-disposition']
    let filename = 'annotations.jsonl'
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
      if (filenameMatch) {
        filename = filenameMatch[1]
      }
    }

    // Create download
    const blob = new Blob([response.data], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  /**
   * Preview import file without committing to database.
   *
   * @param file - JSON Lines file to preview
   * @returns Preview with counts, conflicts, warnings
   */
  async previewImport(file: File): Promise<ImportPreview> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await axios.post(`${API_BASE}/import/preview`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },

  /**
   * Upload and import JSON Lines file.
   *
   * @param file - JSON Lines file to import
   * @param options - Import options with conflict resolution strategies
   * @returns Import result with statistics and errors
   */
  async uploadImportFile(file: File, options: ImportOptions): Promise<ImportResult> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('options', JSON.stringify(options))

    const response = await axios.post(`${API_BASE}/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },

  /**
   * Get import history.
   *
   * @param limit - Maximum number of records (default: 50)
   * @param offset - Number of records to skip (default: 0)
   * @returns List of past imports
   */
  async getImportHistory(limit = 50, offset = 0): Promise<{
    imports: ImportHistoryItem[]
    total: number
  }> {
    const response = await axios.get(`${API_BASE}/import/history`, {
      params: { limit, offset }
    })
    return response.data
  },
}