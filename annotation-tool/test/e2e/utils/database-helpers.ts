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

export interface EntityType {
  id: string
  name: string
  definition: string
}

export interface EventType {
  id: string
  name: string
  definition: string
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
   * Create a test entity type.
   * @param personaId - ID of persona to add type to
   * @param data - Partial entity type data
   */
  async createEntityType(personaId: string, data: Partial<EntityType>): Promise<EntityType> {
    // Get the current ontology
    const getResponse = await fetch(`${this.baseURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    // Add the new entity type
    const newEntityType = {
      id: data.id || `entity-type-${Date.now()}`,
      name: data.name || 'Test Entity Type',
      definition: data.definition || 'Test entity type definition'
    }

    ontology.entityTypes = ontology.entityTypes || []
    ontology.entityTypes.push(newEntityType)

    // Update the ontology
    const updateResponse = await fetch(`${this.baseURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
    })

    if (!updateResponse.ok) {
      throw new Error(`Failed to update ontology: ${updateResponse.statusText}`)
    }

    return newEntityType
  }

  /**
   * Create a test event type.
   * @param personaId - ID of persona to add type to
   * @param data - Partial event type data
   */
  async createEventType(personaId: string, data: Partial<EventType>): Promise<EventType> {
    // Get the current ontology
    const getResponse = await fetch(`${this.baseURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    // Add the new event type
    const newEventType = {
      id: data.id || `event-type-${Date.now()}`,
      name: data.name || 'Test Event Type',
      definition: data.definition || 'Test event type definition'
    }

    ontology.eventTypes = ontology.eventTypes || []
    ontology.eventTypes.push(newEventType)

    // Update the ontology
    const updateResponse = await fetch(`${this.baseURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
    })

    if (!updateResponse.ok) {
      throw new Error(`Failed to update ontology: ${updateResponse.statusText}`)
    }

    return newEventType
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
