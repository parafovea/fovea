import axios from 'axios'
import { Ontology, Annotation, VideoMetadata, OntologyExport, TrackingResponse } from '../models/types'

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
    const response = await axios.post(`${API_BASE}/annotations`, annotation)
    return response.data
  },

  async updateAnnotation(annotation: Annotation): Promise<Annotation> {
    const response = await axios.put(`${API_BASE}/annotations/${annotation.id}`, annotation)
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
}