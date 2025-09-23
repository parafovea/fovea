import axios from 'axios'
import { Ontology, Annotation, VideoMetadata, OntologyExport } from '../models/types'

const API_BASE = '/api'

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
    
    // Convert to JSON Lines format
    const jsonLines = [
      JSON.stringify({ type: 'ontology', data: exportData.ontology }),
      ...exportData.annotations.map(ann => 
        JSON.stringify({ type: 'annotation', data: ann })
      ),
      ...exportData.videos.map(video => 
        JSON.stringify({ type: 'video', data: video })
      ),
      JSON.stringify({ 
        type: 'metadata', 
        data: { 
          exportDate: exportData.exportDate, 
          exportVersion: exportData.exportVersion 
        } 
      }),
    ].join('\n')

    // Create download
    const blob = new Blob([jsonLines], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ontology-export-${Date.now()}.jsonl`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}