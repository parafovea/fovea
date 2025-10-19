/**
 * Database helper utilities for E2E tests.
 * Provides functions for seeding test data and cleaning up after tests.
 */

export interface User {
  id: string
  username: string
  email?: string
  displayName: string
}

export interface Persona {
  id: string
  userId: string
  name: string
  role: string
}

export interface Video {
  id: string
  filename: string
  duration: number
  fps: number
}

export interface Annotation {
  id: string
  videoId: string
  personaId: string
}

/**
 * Database helper for managing test data in E2E tests.
 * Provides utilities for creating and cleaning up test fixtures.
 */
export class DatabaseHelper {
  private baseURL: string

  constructor(baseURL: string = 'http://localhost:3000') {
    this.baseURL = baseURL
  }

  /**
   * Create a test user.
   * @param data - Partial user data
   */
  async createUser(data: Partial<User>): Promise<User> {
    // In single-user mode, return the default user
    // In multi-user mode, this would make an API call
    return {
      id: 'default-user-id',
      username: data.username || 'test-user',
      email: data.email,
      displayName: data.displayName || 'Test User'
    }
  }

  /**
   * Delete a test user.
   * @param _userId - ID of user to delete
   */
  async deleteUser(_userId: string): Promise<void> {
    // Cleanup implementation
    // In single-user mode, this is a no-op
  }

  /**
   * Create a test persona.
   * @param data - Partial persona data
   */
  async createPersona(data: Partial<Persona>): Promise<Persona> {
    // This would make an API call to create a persona
    const response = await fetch(`${this.baseURL}/api/personas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name || 'Test Analyst',
        role: data.role || 'Intelligence Analyst',
        informationNeed: 'Test information need'
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to create persona: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Delete a test persona.
   * @param personaId - ID of persona to delete
   */
  async deletePersona(personaId: string): Promise<void> {
    await fetch(`${this.baseURL}/api/personas/${personaId}`, {
      method: 'DELETE'
    })
  }

  /**
   * Create a test video record.
   * Note: This assumes the video file already exists in test-data directory.
   * @param data - Partial video data
   */
  async createVideo(data: Partial<Video>): Promise<Video> {
    // Videos are typically loaded from the test-data directory
    // This returns a mock video object for testing
    return {
      id: 'test-video-id',
      filename: data.filename || 'test-video.mp4',
      duration: data.duration || 60,
      fps: data.fps || 30
    }
  }

  /**
   * Create a test annotation.
   * @param data - Partial annotation data
   */
  async createAnnotation(data: Partial<Annotation>): Promise<Annotation> {
    const response = await fetch(`${this.baseURL}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: data.videoId,
        personaId: data.personaId,
        keyframes: []
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to create annotation: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Delete a test annotation.
   * @param annotationId - ID of annotation to delete
   */
  async deleteAnnotation(annotationId: string): Promise<void> {
    await fetch(`${this.baseURL}/api/annotations/${annotationId}`, {
      method: 'DELETE'
    })
  }

  /**
   * Clean up all test data created during a test.
   */
  async cleanup(): Promise<void> {
    // Cleanup implementation
    // This would delete all test data created during the test run
  }

  /**
   * Connect to the database (if needed).
   */
  async connect(): Promise<void> {
    // Connection setup if needed
  }

  /**
   * Disconnect from the database.
   */
  async disconnect(): Promise<void> {
    // Cleanup and disconnect
  }
}
