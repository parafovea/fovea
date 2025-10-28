import { test, expect } from '../fixtures/test-context.js'

/**
 * Worker Isolation Verification Tests
 *
 * These tests verify that each Playwright worker has its own isolated user
 * and WorldState, enabling parallel test execution without race conditions.
 */
test.describe('Worker Isolation', () => {
  test('each worker has unique user', async ({ testUser }, workerInfo) => {
    // Verify user has worker-specific username (includes timestamp for uniqueness)
    expect(testUser.username).toMatch(new RegExp(`^test-worker-${workerInfo.workerIndex}-\\d+$`))
    expect(testUser.displayName).toBe(`Test User (Worker ${workerInfo.workerIndex})`)
  })

  test('each worker can create isolated entities', async ({ testUser, objectWorkspace, page }) => {
    // Navigate to object workspace
    await page.goto('http://localhost:3000')
    await objectWorkspace.navigateTo()

    // Create a worker-specific entity
    const entityName = `Test Entity Worker ${testUser.username}`
    await objectWorkspace.createEntity(entityName, `Entity created by ${testUser.username}`)

    // Verify entity exists in this worker's WorldState
    await objectWorkspace.expectEntityExists(entityName)
  })

  test('workers do not interfere with each other', async ({ testUser, objectWorkspace, page }) => {
    // This test creates data and verifies it persists
    // If workers share state, this will fail when run in parallel

    await page.goto('http://localhost:3000')
    await objectWorkspace.navigateTo()

    const entityName = `Persistent Entity ${testUser.username}`
    await objectWorkspace.createEntity(entityName, 'Should persist in isolated WorldState')

    // Wait a bit to let other workers run
    await page.waitForTimeout(1000)

    // Verify entity still exists (not overwritten by another worker)
    await objectWorkspace.expectEntityExists(entityName)
  })
})
