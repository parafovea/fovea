import { test as base } from '@playwright/test'
import { AnnotationWorkspacePage } from '../page-objects/AnnotationWorkspacePage.js'
import { VideoBrowserPage } from '../page-objects/VideoBrowserPage.js'
import { DatabaseHelper, User, Persona, Video } from '../utils/database-helpers.js'

/**
 * Extended test fixtures for E2E tests.
 * Provides dependency injection of page objects and test data.
 */
type Fixtures = {
  annotationWorkspace: AnnotationWorkspacePage
  videoBrowser: VideoBrowserPage
  db: DatabaseHelper
  testUser: User
  testPersona: Persona
  testVideo: Video
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
   */
  db: async ({ baseURL }, use) => {
    const db = new DatabaseHelper(baseURL)
    await db.connect()
    await use(db)
    await db.cleanup()
    await db.disconnect()
  },

  /**
   * Test user fixture.
   * Creates a test user before the test and cleans up after.
   */
  testUser: async ({ db }, use) => {
    const user = await db.createUser({
      username: 'test-user',
      email: 'test@example.com',
      displayName: 'Test User'
    })
    await use(user)
    await db.deleteUser(user.id)
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
  }
})

/**
 * Export expect from @playwright/test for consistency.
 */
export { expect } from '@playwright/test'
