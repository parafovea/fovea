import { test as base } from '@playwright/test'
import { AnnotationWorkspacePage } from '../page-objects/AnnotationWorkspacePage.js'
import { VideoBrowserPage } from '../page-objects/VideoBrowserPage.js'
import { OntologyWorkspacePage } from '../page-objects/OntologyWorkspacePage.js'
import { ObjectWorkspacePage } from '../page-objects/ObjectWorkspacePage.js'
import { DatabaseHelper, User, Persona, Video, EntityType, EventType, RoleType, RelationType } from '../utils/database-helpers.js'

/**
 * Worker-scoped fixtures (shared across all tests in a worker).
 */
type WorkerFixtures = {
  workerDb: DatabaseHelper
  workerUser: User
  workerSessionToken: string
}

/**
 * Test-scoped fixtures (created fresh for each test).
 */
type TestFixtures = {
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
  testClaimRelationType: RelationType
}

/**
 * Extended test with custom fixtures.
 * Use this instead of @playwright/test's test export to get access to fixtures.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  /**
   * Annotation workspace page object.
   * Automatically created for each test.
   * Depends on testUser to ensure authentication is set up.
   */
  // @ts-expect-error - testUser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  annotationWorkspace: async ({ page, testUser }, use) => {
    const workspace = new AnnotationWorkspacePage(page)
    await use(workspace)
  },

  /**
   * Video browser page object.
   * Automatically created for each test.
   * Depends on testUser to ensure authentication is set up.
   */
  // @ts-expect-error - testUser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  videoBrowser: async ({ page, testUser }, use) => {
    const browser = new VideoBrowserPage(page)
    await use(browser)
  },

  // Worker-scoped fixtures (shared across all tests in worker)
  // @ts-expect-error - browser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  workerDb: [async ({ browser }, use) => {
    const db = new DatabaseHelper('http://localhost:3000')
    await db.connect()
    await use(db)
    await db.disconnect()
  }, { scope: 'worker' }],

  workerUser: [async ({ workerDb }, use, workerInfo) => {
    const timestamp = Date.now()
    const username = `test-worker-${workerInfo.workerIndex}-${timestamp}`
    const displayName = `Test User (Worker ${workerInfo.workerIndex})`
    const password = 'test-password-123'

    const user = await workerDb.createUser({
      username,
      displayName,
      password,
      isAdmin: false
    })

    await use(user)

    // Cleanup: delete user and all associated data
    await workerDb.deleteUser(user.id)
  }, { scope: 'worker' }],

  workerSessionToken: [async ({ workerUser }, use) => {
    const password = 'test-password-123'

    // Authenticate to get session token
    const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: workerUser.username, password })
    })

    if (!loginResponse.ok) {
      throw new Error(`Failed to login as ${workerUser.username}: ${loginResponse.status}`)
    }

    // Extract session token
    const cookies = loginResponse.headers.get('set-cookie')
    const cookieMatch = cookies?.match(/session_token=([^;]+)/)

    if (!cookieMatch) {
      throw new Error('Failed to extract session token from login response')
    }

    await use(cookieMatch[1])
  }, { scope: 'worker' }],

  // Test-scoped fixtures (use worker fixtures)
  db: async ({ workerDb, workerUser }, use) => {
    // Clean WorldState before each test to ensure isolation
    // (all tests in a worker share the same user/WorldState)
    await workerDb.cleanup(workerUser.id)
    await use(workerDb)
    // No cleanup after - let the next test's beforeEach cleanup handle it
  },

  testUser: async ({ workerUser, workerSessionToken, context }, use) => {
    // Add authentication cookie to this test's browser context
    await context.addCookies([{
      name: 'session_token',
      value: workerSessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax'
    }])

    await use(workerUser)
  },

  /**
   * Test persona fixture.
   * Creates a test persona before the test and cleans up after.
   * Depends on testUser fixture.
   */
  testPersona: async ({ db, testUser, workerSessionToken }, use) => {
    const persona = await db.createPersona({
      userId: testUser.id,
      name: 'Test Analyst',
      role: 'Intelligence Analyst'
    }, workerSessionToken)
    await use(persona)
    await db.deletePersona(persona.id)
  },

  /**
   * Test video fixture.
   * Fetches the first available video from the backend.
   * Test data only contains webm files for browser compatibility.
   */
  // eslint-disable-next-line no-empty-pattern
  testVideo: async ({}, use) => {
    // Fetch actual videos from backend
    const response = await fetch('http://localhost:3001/api/videos')
    const videos = await response.json()

    if (!videos || videos.length === 0) {
      throw new Error('No videos found in test environment. Ensure test-data directory has videos.')
    }

    // Use first video (all test videos are webm for codec compatibility)
    const video = videos[0]

    await use({
      id: video.id,
      filename: video.filename,
      duration: video.duration,
      fps: video.fps || 30
    })
  },

  /**
   * Ontology workspace page object.
   * Automatically created for each test.
   * Depends on testUser to ensure authentication is set up.
   */
  // @ts-expect-error - testUser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ontologyWorkspace: async ({ page, testUser }, use) => {
    const workspace = new OntologyWorkspacePage(page)
    await use(workspace)
  },

  /**
   * Object workspace page object.
   * Automatically created for each test.
   * Depends on testUser to ensure authentication is set up.
   */
  // @ts-expect-error - testUser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  objectWorkspace: async ({ page, testUser }, use) => {
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
  },

  /**
   * Test claim relation type fixture.
   * Creates a claim-to-claim relation type for testing claim relations.
   * Depends on testPersona fixture.
   */
  testClaimRelationType: async ({ db, testPersona }, use) => {
    const relationType = await db.createRelationType(testPersona.id, {
      name: 'Supports',
      definition: 'One claim supports another claim',
      sourceTypes: ['claim'],
      targetTypes: ['claim']
    })
    await use(relationType)
    // Cleanup is handled by persona deletion
  }
})

/**
 * Export expect from @playwright/test for consistency.
 */
export { expect } from '@playwright/test'
