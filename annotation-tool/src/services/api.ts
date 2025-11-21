import axios from 'axios'
import { Ontology, Annotation, VideoMetadata, OntologyExport, TrackingResponse, ExportOptions, ExportStats, ImportOptions, ImportPreview, ImportResult, ImportHistoryItem } from '../models/types'

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
    const response = await axios.get(`${API_BASE}/annotations/${videoId}`)
    return response.data
  },

  async saveAnnotation(annotation: Annotation): Promise<Annotation> {
    // Transform frontend Annotation to backend format
    let personaId: string
    let label: string

    if (annotation.annotationType === 'type') {
      personaId = annotation.personaId
      label = annotation.typeId || 'unlabeled'
    } else {
      // Object annotations don't have personaId, use videoId as fallback
      personaId = annotation.videoId
      label = annotation.linkedEntityId || annotation.linkedEventId || annotation.linkedTimeId || 'unlabeled'
    }

    const backendPayload = {
      videoId: annotation.videoId,
      personaId,
      type: annotation.annotationType,
      label,
      frames: annotation.boundingBoxSequence,
      confidence: annotation.confidence,
      source: 'manual'
    }

    console.error('[API saveAnnotation] POST /api/annotations', {
      annotationId: annotation.id,
      videoId: backendPayload.videoId,
      personaId: backendPayload.personaId,
      type: backendPayload.type,
      label: backendPayload.label
    })

    const response = await axios.post(`${API_BASE}/annotations`, backendPayload)

    console.error('[API saveAnnotation] Response', {
      status: response.status,
      data: response.data
    })

    return response.data
  },

  async updateAnnotation(annotation: Annotation): Promise<Annotation> {
    // Transform frontend Annotation to backend format
    let label: string

    if (annotation.annotationType === 'type') {
      label = annotation.typeId || 'unlabeled'
    } else {
      label = annotation.linkedEntityId || annotation.linkedEventId || annotation.linkedTimeId || 'unlabeled'
    }

    const backendPayload = {
      type: annotation.annotationType,
      label,
      frames: annotation.boundingBoxSequence,
      confidence: annotation.confidence,
      source: 'manual'
    }

    console.error('[API updateAnnotation] PUT /api/annotations/:id', {
      annotationId: annotation.id,
      type: backendPayload.type,
      label: backendPayload.label
    })

    const response = await axios.put(`${API_BASE}/annotations/${annotation.id}`, backendPayload)

    console.error('[API updateAnnotation] Response', {
      status: response.status,
      data: response.data
    })

    return response.data
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

  async validateOntology(data: OntologyExport): Promise<{ valid: boolean; errors?: any }> {
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