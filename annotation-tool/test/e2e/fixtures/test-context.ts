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
  testPersonaPersistent: Persona
  testVideo: Video
  testEntityType: EntityType
  testEntityTypePersistent: EntityType
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

    // Worker users get systemRole='system_admin' so the buildAbilities()
    // shortcut (`if (roles.systemRole === 'system_admin')`) returns
    // can('manage', 'all') and every CASL check downstream short-circuits
    // to allowed. Without this, persona/world-state/annotation creates
    // return 403 because no RolePermission rows are seeded for the
    // per-worker users we create on the fly. (isAdmin alone does NOT
    // bypass CASL — only systemRole does.)
    const user = await workerDb.createUser({
      username,
      displayName,
      password,
      isAdmin: true,
      systemRole: 'system_admin'
    })

    await use(user)

    // Cleanup: delete user and all associated data
    await workerDb.deleteUser(user.id)
  }, { scope: 'worker' }],

  workerSessionToken: [async ({ workerUser, workerDb }, use) => {
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

    // Inject the worker user's token into workerDb so every create*Type /
    // ontology fetch resolves to the worker user (otherwise unauthenticated
    // requests fall into the "only system personas visible" branch and 404).
    workerDb.setSessionToken(cookieMatch[1])

    await use(cookieMatch[1])

    workerDb.setSessionToken(null)
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
   * Persistent test persona fixture for persistence tests.
   *
   * Returns ONE persona per worker user, identified by the unique
   * (userId, name="Test Analyst (Persistent)") tuple. Earlier versions
   * of this fixture unconditionally created a new persona on every
   * test, accumulating duplicates within a worker — the summary-
   * persistence and annotation-persistence specs then hit a strict-mode
   * violation when `getByRole('option').filter({ hasText: 'Test Analyst
   * (Persistent)' })` resolved to N copies of the same-named persona.
   * Dedupe by querying the user's personas first and reusing an
   * existing match; only create a fresh persona on the first call.
   * Worker-level cleanup still owns the deletion at the end of the
   * worker's lifecycle (the test does NOT delete on teardown so
   * persisted-annotation data survives the reload assertion).
   */
  // Name includes workerIndex + first 8 chars of testUser.id so admin
  // sessions see globally-unique options even when previous test runs
  // left orphans in the database.
  testPersonaPersistent: async ({ db, testUser, workerSessionToken }, use, testInfo) => {
    const personaName = `Test Analyst (Persistent W${testInfo.workerIndex}-${testUser.id.slice(0, 8)})`
    const existing = await db.findPersonaByName(testUser.id, personaName, workerSessionToken)
    const persona = existing ?? await db.createPersona({
      userId: testUser.id,
      name: personaName,
      role: 'Intelligence Analyst'
    }, workerSessionToken)
    await use(persona)
  },

  /**
   * Test video fixture.
   * Fetches the first available video from the backend.
   * Test data only contains webm files for browser compatibility.
   */
  testVideo: async ({ workerSessionToken, testUser }, use, testInfo) => {
    const response = await fetch('http://localhost:3001/api/videos', {
      headers: { Cookie: `session_token=${workerSessionToken}` }
    })
    const videos = await response.json()

    if (!Array.isArray(videos) || videos.length === 0) {
      throw new Error('No videos found in test environment. Ensure test-data directory has videos.')
    }

    // Spread workers across the available videos so parallel test runs
    // don't all hit annotations on the same video row.
    const video = videos[testInfo.workerIndex % videos.length]

    // Delete annotations + summaries on this video before each test so
    // residue from a prior test in the same worker (or a parallel worker
    // before the testVideo stripe rotation) doesn't bleed into the
    // current test's assertions about counts / persistence / visibility.
    //
    // CRITICAL: scope the cleanup to annotations + summaries CREATED BY
    // THE CURRENT testUser. The video pool is shared across workers and
    // across Playwright projects (smoke, functional, regression,
    // accessibility); two workers striped onto the same video would
    // otherwise wipe each other's in-progress annotations between
    // test setup and the assertion, producing "All Annotations (0)"
    // failures that only show up under parallel load (the test passes
    // in isolation, fails under --project=A --project=B). Filtering
    // by createdBy / userId keeps each worker's cleanup local to its
    // own rows.
    const annsRes = await fetch(`http://localhost:3001/api/annotations/${video.id}`, {
      headers: { Cookie: `session_token=${workerSessionToken}` },
    })
    if (annsRes.ok) {
      const anns = (await annsRes.json()) as Array<{ id: string; createdBy?: string }>
      const ownAnns = anns.filter((a) => a.createdBy === testUser.id)
      await Promise.all(
        ownAnns.map((a) =>
          fetch(`http://localhost:3001/api/annotations/${video.id}/${a.id}`, {
            method: 'DELETE',
            headers: { Cookie: `session_token=${workerSessionToken}` },
          }),
        ),
      )
    }
    const summariesRes = await fetch(`http://localhost:3001/api/videos/${video.id}/summaries`, {
      headers: { Cookie: `session_token=${workerSessionToken}` },
    })
    if (summariesRes.ok) {
      const summaries = (await summariesRes.json()) as Array<{
        id: string
        personaId: string
        userId?: string
        createdBy?: string
      }>
      const ownSummaries = summaries.filter((s) => (s.userId ?? s.createdBy) === testUser.id)
      await Promise.all(
        ownSummaries.map((s) =>
          fetch(`http://localhost:3001/api/videos/${video.id}/summaries/${s.personaId}`, {
            method: 'DELETE',
            headers: { Cookie: `session_token=${workerSessionToken}` },
          }),
        ),
      )
    }

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
   * Clears localStorage to ensure fresh Zustand state.
   */
  // @ts-expect-error - testUser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ontologyWorkspace: async ({ page, testUser }, use) => {
    // Clear localStorage to ensure fresh state for ontology workspace tests
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())

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
   * Persistent test entity type fixture for persistence tests.
   * Creates an entity type but does NOT delete it after the test.
   * Depends on testPersonaPersistent fixture.
   */
  testEntityTypePersistent: async ({ db, testPersonaPersistent }, use) => {
    const entityType = await db.createEntityType(testPersonaPersistent.id, {
      name: 'Test Entity Type (Persistent)',
      definition: 'A test entity type for persistence E2E testing'
    })
    await use(entityType)
    // Don't delete - let worker cleanup handle it
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
