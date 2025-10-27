import { test as base } from '@playwright/test'
import { AnnotationWorkspacePage } from '../page-objects/AnnotationWorkspacePage.js'
import { VideoBrowserPage } from '../page-objects/VideoBrowserPage.js'
import { OntologyWorkspacePage } from '../page-objects/OntologyWorkspacePage.js'
import { ObjectWorkspacePage } from '../page-objects/ObjectWorkspacePage.js'
import { DatabaseHelper, User, Persona, Video, EntityType, EventType, RoleType, RelationType } from '../utils/database-helpers.js'

/**
 * Extended test fixtures for E2E tests.
 * Provides dependency injection of page objects and test data.
 */
type Fixtures = {
  annotationWorkspace: AnnotationWorkspacePage
  videoBrowser: VideoBrowserPage
  ontologyWorkspace: OntologyWorkspacePage
  objectWorkspace: ObjectWorkspacePage
  db: DatabaseHelper
  testUser: User
  testPersona: Persona
  testVideo: Video
  testEntityType: EntityType
  testEventType: EventType
  testRoleType: RoleType
  testRelationType: RelationType
}

/**
 * Extended test with custom fixtures.
 * Use this instead of @playwright/test's test export to get access to fixtures.
 */
export const test = base.extend<Fixtures>({
  /**
   * Annotation workspace page object.
   * Automatically created for each test.
   */
  annotationWorkspace: async ({ page }, use) => {
    const workspace = new AnnotationWorkspacePage(page)
    await use(workspace)
  },

  /**
   * Video browser page object.
   * Automatically created for each test.
   */
  videoBrowser: async ({ page }, use) => {
    const browser = new VideoBrowserPage(page)
    await use(browser)
  },

  /**
   * Database helper for creating and cleaning up test data.
   * Cleans up before and after each test to ensure isolation.
   */
  db: async ({ baseURL }, use) => {
    const db = new DatabaseHelper(baseURL)
    await db.connect()
    await db.cleanup() // Clean up before test (clear residual data)
    await use(db)
    await db.cleanup() // Clean up after test
    await db.disconnect()
  },

  /**
   * Test user fixture.
   * Returns the default single-user mode user that all E2E tests share.
   * Tests rely on cleanup() to ensure isolation between runs.
   */
  testUser: async ({ db }, use) => {
    // In single-user mode, all tests share the default user
    // The user should already exist from backend initialization
    const user = await db.getDefaultUser()
    await use(user)
    // Don't delete - this is the shared default user
  },

  /**
   * Test persona fixture.
   * Creates a test persona before the test and cleans up after.
   * Depends on testUser fixture.
   */
  testPersona: async ({ db, testUser }, use) => {
    const persona = await db.createPersona({
      userId: testUser.id,
      name: 'Test Analyst',
      role: 'Intelligence Analyst'
    })
    await use(persona)
    await db.deletePersona(persona.id)
  },

  /**
   * Test video fixture.
   * Provides a test video for annotation.
   */
  testVideo: async ({ db }, use) => {
    const video = await db.createVideo({
      filename: 'test-video.mp4',
      duration: 60,
      fps: 30
    })
    await use(video)
  },

  /**
   * Ontology workspace page object.
   * Automatically created for each test.
   */
  ontologyWorkspace: async ({ page }, use) => {
    const workspace = new OntologyWorkspacePage(page)
    await use(workspace)
  },

  /**
   * Object workspace page object.
   * Automatically created for each test.
   */
  objectWorkspace: async ({ page }, use) => {
    const workspace = new ObjectWorkspacePage(page)
    await use(workspace)
  },

  /**
   * Test entity type fixture.
   * Creates a test entity type before the test and cleans up after.
   * Depends on testPersona fixture.
   */
  testEntityType: async ({ db, testPersona }, use) => {
    const entityType = await db.createEntityType(testPersona.id, {
      name: 'Test Entity Type',
      definition: 'A test entity type for E2E testing'
    })
    await use(entityType)
    // Cleanup is handled by persona deletion
  },

  /**
   * Test event type fixture.
   * Creates a test event type before the test and cleans up after.
   * Depends on testPersona fixture.
   */
  testEventType: async ({ db, testPersona }, use) => {
    const eventType = await db.createEventType(testPersona.id, {
      name: 'Test Event Type',
      definition: 'A test event type for E2E testing'
    })
    await use(eventType)
    // Cleanup is handled by persona deletion
  },

  /**
   * Test role type fixture.
   * Creates a test role type before the test and cleans up after.
   * Depends on testPersona fixture.
   */
  testRoleType: async ({ db, testPersona }, use) => {
    const roleType = await db.createRoleType(testPersona.id, {
      name: 'Test Role Type',
      definition: 'A test role type for E2E testing',
      allowedFillerTypes: ['Person', 'Organization']
    })
    await use(roleType)
    // Cleanup is handled by persona deletion
  },

  /**
   * Test relation type fixture.
   * Creates a test relation type before the test and cleans up after.
   * Depends on testPersona fixture.
   */
  testRelationType: async ({ db, testPersona }, use) => {
    const relationType = await db.createRelationType(testPersona.id, {
      name: 'Test Relation Type',
      definition: 'A test relation type for E2E testing',
      sourceTypes: ['Person'],
      targetTypes: ['Organization']
    })
    await use(relationType)
    // Cleanup is handled by persona deletion
  }
})

/**
 * Export expect from @playwright/test for consistency.
 */
export { expect } from '@playwright/test'
