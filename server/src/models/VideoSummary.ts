import { VideoSummary } from './types'

class VideoSummaryModel {
  private summaries: Map<string, VideoSummary[]> = new Map()

  // Get all summaries for a video
  getAllForVideo(videoId: string): VideoSummary[] {
    return this.summaries.get(videoId) || []
  }

  // Get summary for specific persona
  getForPersona(videoId: string, personaId: string): VideoSummary | null {
    const videoSummaries = this.summaries.get(videoId) || []
    return videoSummaries.find(s => s.personaId === personaId) || null
  }

  // Create or update summary
  save(summary: VideoSummary): VideoSummary {
    const videoSummaries = this.summaries.get(summary.videoId) || []
    const existingIndex = videoSummaries.findIndex(s => s.id === summary.id)
    
    if (existingIndex >= 0) {
      // Update existing
      videoSummaries[existingIndex] = {
        ...summary,
        updatedAt: new Date().toISOString()
      }
    } else {
      // Create new
      videoSummaries.push({
        ...summary,
        createdAt: summary.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }
    
    this.summaries.set(summary.videoId, videoSummaries)
    return summary
  }

  // Delete summary
  delete(videoId: string, summaryId: string): boolean {
    const videoSummaries = this.summaries.get(videoId) || []
    const filteredSummaries = videoSummaries.filter(s => s.id !== summaryId)
    
    if (filteredSummaries.length < videoSummaries.length) {
      this.summaries.set(videoId, filteredSummaries)
      return true
    }
    return false
  }

  // Get all summaries (for export)
  getAll(): VideoSummary[] {
    const allSummaries: VideoSummary[] = []
    for (const summaries of this.summaries.values()) {
      allSummaries.push(...summaries)
    }
    return allSummaries
  }

  // Import summaries
  import(summaries: VideoSummary[]): void {
    for (const summary of summaries) {
      this.save(summary)
    }
  }
}

export const videoSummaryModel = new VideoSummaryModel()