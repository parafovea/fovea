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

export interface RoleType {
  id: string
  name: string
  definition: string
  allowedFillerTypes?: string[]
}

export interface RelationType {
  id: string
  name: string
  definition: string
  sourceTypes?: string[]
  targetTypes?: string[]
}

/**
 * Database helper for managing test data in E2E tests.
 * Provides utilities for creating and cleaning up test fixtures.
 */
export class DatabaseHelper {
  private apiURL: string

  constructor(baseURL: string = 'http://localhost:3000') {
    // baseURL is used to derive apiURL
    // API is on port 3001 in E2E environment
    this.apiURL = baseURL.replace(':3000', ':3001')
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
   * Always creates a fresh persona with an empty ontology for test isolation.
   * @param data - Partial persona data
   */
  async createPersona(data: Partial<Persona>): Promise<Persona> {
    // Always create a new persona for test isolation
    const response = await fetch(`${this.apiURL}/api/personas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name || 'Test Analyst',
        role: data.role || 'Intelligence Analyst',
        informationNeed: data.informationNeed || 'Test information need'
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create persona: ${response.statusText} - ${errorText}`)
    }

    const persona = await response.json()
    return {
      id: persona.id,
      userId: persona.userId,
      name: persona.name,
      role: persona.role
    }
  }

  /**
   * Delete a test persona.
   * @param personaId - ID of persona to delete
   */
  async deletePersona(personaId: string): Promise<void> {
    await fetch(`${this.apiURL}/api/personas/${personaId}`, {
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
    const response = await fetch(`${this.apiURL}/api/annotations`, {
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
    await fetch(`${this.apiURL}/api/annotations/${annotationId}`, {
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
    const getResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    // Add the new entity type (uses 'gloss' not 'definition' in actual data model)
    const newEntityType = {
      id: data.id || `entity-type-${Date.now()}`,
      name: data.name || 'Test Entity Type',
      gloss: [{ type: 'text', content: data.definition || 'Test entity type definition' }],
      examples: []
    }

    ontology.entities = ontology.entities || []
    ontology.entities.push(newEntityType)

    // Update the ontology
    const updateResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
    })

    if (!updateResponse.ok) {
      throw new Error(`Failed to update ontology: ${updateResponse.statusText}`)
    }

    // Return the simplified interface expected by tests
    return {
      id: newEntityType.id,
      name: newEntityType.name,
      definition: data.definition || 'Test entity type definition'
    }
  }

  /**
   * Create a test event type.
   * @param personaId - ID of persona to add type to
   * @param data - Partial event type data
   */
  async createEventType(personaId: string, data: Partial<EventType>): Promise<EventType> {
    // Get the current ontology
    const getResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    // Add the new event type
    const newEventType = {
      id: data.id || `event-type-${Date.now()}`,
      name: data.name || 'Test Event Type',
      gloss: [{ type: 'text', content: data.definition || 'Test event type definition' }],
      roles: []
    }

    ontology.events = ontology.events || []
    ontology.events.push(newEventType)

    // Update the ontology
    const updateResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
    })

    if (!updateResponse.ok) {
      throw new Error(`Failed to update ontology: ${updateResponse.statusText}`)
    }

    return {
      id: newEventType.id,
      name: newEventType.name,
      definition: data.definition || 'Test event type definition'
    }
  }

  /**
   * Create a test role type.
   * @param personaId - ID of persona to add type to
   * @param data - Partial role type data
   */
  async createRoleType(personaId: string, data: Partial<RoleType>): Promise<RoleType> {
    // Get the current ontology
    const getResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    // Add the new role type
    const newRoleType = {
      id: data.id || `role-type-${Date.now()}`,
      name: data.name || 'Test Role Type',
      gloss: [{ type: 'text', content: data.definition || 'Test role type definition' }],
      allowedFillerTypes: data.allowedFillerTypes || []
    }

    ontology.roles = ontology.roles || []
    ontology.roles.push(newRoleType)

    // Update the ontology
    const updateResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
    })

    if (!updateResponse.ok) {
      throw new Error(`Failed to update ontology: ${updateResponse.statusText}`)
    }

    return {
      id: newRoleType.id,
      name: newRoleType.name,
      definition: data.definition || 'Test role type definition',
      allowedFillerTypes: newRoleType.allowedFillerTypes
    }
  }

  /**
   * Create a test relation type.
   * @param personaId - ID of persona to add type to
   * @param data - Partial relation type data
   */
  async createRelationType(personaId: string, data: Partial<RelationType>): Promise<RelationType> {
    // Get the current ontology
    const getResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    // Add the new relation type
    const newRelationType = {
      id: data.id || `relation-type-${Date.now()}`,
      name: data.name || 'Test Relation Type',
      gloss: [{ type: 'text', content: data.definition || 'Test relation type definition' }],
      sourceTypes: data.sourceTypes || [],
      targetTypes: data.targetTypes || []
    }

    ontology.relationTypes = ontology.relationTypes || []
    ontology.relationTypes.push(newRelationType)

    // Update the ontology
    const updateResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
    })

    if (!updateResponse.ok) {
      throw new Error(`Failed to update ontology: ${updateResponse.statusText}`)
    }

    return {
      id: newRelationType.id,
      name: newRelationType.name,
      definition: data.definition || 'Test relation type definition',
      sourceTypes: newRelationType.sourceTypes,
      targetTypes: newRelationType.targetTypes
    }
  }

  /**
   * Get an entity type by ID.
   * @param personaId - ID of persona
   * @param entityTypeId - ID of entity type
   */
  async getEntityType(personaId: string, entityTypeId: string): Promise<EntityType | null> {
    const getResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      return null
    }
    const ontology = await getResponse.json()
    const entityType = ontology.entities?.find((e: any) => e.id === entityTypeId)
    return entityType ? {
      id: entityType.id,
      name: entityType.name,
      definition: Array.isArray(entityType.gloss)
        ? entityType.gloss.find((g: any) => g.type === 'text')?.content || ''
        : entityType.gloss
    } : null
  }

  /**
   * Delete an entity type.
   * @param personaId - ID of persona
   * @param entityTypeId - ID of entity type to delete
   */
  async deleteEntityType(personaId: string, entityTypeId: string): Promise<void> {
    const getResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    ontology.entities = ontology.entities?.filter((e: any) => e.id !== entityTypeId) || []

    await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
    })
  }

  /**
   * Delete an event type.
   * @param personaId - ID of persona
   * @param eventTypeId - ID of event type to delete
   */
  async deleteEventType(personaId: string, eventTypeId: string): Promise<void> {
    const getResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    ontology.events = ontology.events?.filter((e: any) => e.id !== eventTypeId) || []

    await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
    })
  }

  /**
   * Delete a role type.
   * @param personaId - ID of persona
   * @param roleTypeId - ID of role type to delete
   */
  async deleteRoleType(personaId: string, roleTypeId: string): Promise<void> {
    const getResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    ontology.roles = ontology.roles?.filter((r: any) => r.id !== roleTypeId) || []

    await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
    })
  }

  /**
   * Delete a relation type.
   * @param personaId - ID of persona
   * @param relationTypeId - ID of relation type to delete
   */
  async deleteRelationType(personaId: string, relationTypeId: string): Promise<void> {
    const getResponse = await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`)
    if (!getResponse.ok) {
      throw new Error(`Failed to get ontology: ${getResponse.statusText}`)
    }
    const ontology = await getResponse.json()

    ontology.relationTypes = ontology.relationTypes?.filter((r: any) => r.id !== relationTypeId) || []

    await fetch(`${this.apiURL}/api/personas/${personaId}/ontology`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ontology)
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
