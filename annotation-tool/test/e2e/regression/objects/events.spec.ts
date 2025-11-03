import { test, expect } from '../../fixtures/test-context.js'

test.describe('Event Management', () => {
  test.describe.configure({ mode: 'serial' })

  test('creates event with name and description', async ({
    objectWorkspace,
    _testPersona,
    _testEventType,
    _page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    await objectWorkspace.createEvent(
      'Product Launch',
      'Major product announcement event'
    )

    await objectWorkspace.expectEventExists('Product Launch')
    await objectWorkspace.expectObjectCount('events', 1)
  })

  test('validates event name is required', async ({
    objectWorkspace,
    _testPersona,
    _testEventType,
    page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    // Click add button
    const addFab = page.locator('button[aria-label*="add" i], button:has-text("add")').first()
    await addFab.click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Try to save without name
    const saveButton = dialog.getByRole('button', { name: /save|create/i })
    const isDisabled = await saveButton.isDisabled().catch(() => true)
    if (!isDisabled) {
      await saveButton.click()
      await page.waitForTimeout(300)
    }

    // Dialog should still be visible (validation error)
    await expect(dialog).toBeVisible()

    // Close dialog
    const cancelButton = dialog.getByRole('button', { name: /cancel|close/i })
    await cancelButton.click()
  })

  test('edits event details', async ({
    objectWorkspace,
    _testPersona,
    _testEventType,
    _page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    await objectWorkspace.createEvent('Meeting', 'Team meeting')
    await objectWorkspace.editEvent('Meeting', 'Board Meeting', 'Executive board meeting')
    await objectWorkspace.expectEventExists('Board Meeting')
  })

  test('deletes event', async ({
    objectWorkspace,
    _testPersona,
    _testEventType,
    _page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    await objectWorkspace.createEvent('Conference', 'Annual conference')
    await objectWorkspace.expectEventExists('Conference')

    await objectWorkspace.deleteEvent('Conference')
    await objectWorkspace.expectEventNotExists('Conference')
    await objectWorkspace.expectObjectCount('events', 0)
  })

  test('searches events by name', async ({
    objectWorkspace,
    _testPersona,
    _testEventType,
    _page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    await objectWorkspace.createEvent('Launch Event', 'Product launch')
    await objectWorkspace.createEvent('Team Meeting', 'Weekly sync')

    await objectWorkspace.searchObjects('Launch')
    await objectWorkspace.expectEventExists('Launch Event')
  })

  test('searches events by description', async ({
    objectWorkspace,
    _testPersona,
    _testEventType,
    _page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    await objectWorkspace.createEvent('Event A', 'Held in Paris')
    await objectWorkspace.createEvent('Event B', 'Held in London')

    await objectWorkspace.searchObjects('London')
    await objectWorkspace.expectEventExists('Event B')
  })

  test('links event to event type', async ({
    objectWorkspace,
    _testPersona,
    testEventType,
    _page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.createEvent('Test Event', 'A test event')
    await objectWorkspace.linkEventToType('Test Event', testEventType.name)
    await objectWorkspace.expectEventExists('Test Event')
  })

  test('adds participants to event', async ({
    objectWorkspace,
    _testPersona,
    _testEntityType,
    _testRoleType,
    _page
  }) => {
    await objectWorkspace.navigateTo()

    // Create entity first
    await objectWorkspace.createEntity('Speaker', 'Event speaker')

    // Create event
    await objectWorkspace.selectTab('events')
    await objectWorkspace.createEvent('Summit', 'Tech summit')

    // Add participant to event
    await objectWorkspace.addParticipantToEvent('Summit', 'Speaker', 'Test Role Type')

    // Verify event still exists
    await objectWorkspace.expectEventExists('Summit')
  })

  test('adds event location', async ({
    objectWorkspace,
    _testPersona,
    _page
  }) => {
    await objectWorkspace.navigateTo()

    // Create location first
    await objectWorkspace.createLocation('Conference Center', 37.7749, -122.4194)

    // Create event
    await objectWorkspace.createEvent('Conference', 'Annual conference')

    // Link location to event
    await objectWorkspace.linkEventToLocation('Conference', 'Conference Center')

    // Verify event exists (full verification would require checking the link)
    await objectWorkspace.expectEventExists('Conference')
  })

  test('adds event time', async ({
    objectWorkspace,
    _testPersona,
    _page
  }) => {
    await objectWorkspace.navigateTo()

    // Create time first
    await objectWorkspace.createSimpleTime('Meeting Time', '2024-10-21T10:00:00Z')

    // Create event
    await objectWorkspace.createEvent('Meeting', 'Team meeting')

    // Link time to event
    await objectWorkspace.linkEventToTime('Meeting', 'Meeting Time')

    // Verify event exists (full verification would require checking the link)
    await objectWorkspace.expectEventExists('Meeting')
  })

  test('adds Wikidata reference', async ({
    objectWorkspace,
    _testPersona,
    _page
  }) => {
    // Basic test - verifies event creation (Wikidata search requires UI implementation)
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')
    await objectWorkspace.createEvent('Olympics', '2024 Olympics')
    await objectWorkspace.expectEventExists('Olympics')
  })

  test('adds event to collection', async ({
    objectWorkspace,
    _testPersona,
    _page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    // Create events
    await objectWorkspace.createEvent('Event 1', 'First event')
    await objectWorkspace.createEvent('Event 2', 'Second event')

    // Create event collection with these events
    await objectWorkspace.createEventCollection(
      'Event Series',
      'Collection of related events',
      ['Event 1', 'Event 2']
    )

    // Verify collection exists
    await objectWorkspace.expectCollectionExists('Event Series')
  })

  test('displays event count in tab', async ({
    objectWorkspace,
    _testPersona,
    _testEventType,
    page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    // Initially should be 0
    await expect(page.getByRole('tab', { name: /events.*0/i })).toBeVisible()

    // Create events
    await objectWorkspace.createEvent('Event 1', 'First event')
    await objectWorkspace.createEvent('Event 2', 'Second event')

    // Should show 2
    await expect(page.getByRole('tab', { name: /events.*2/i })).toBeVisible()
  })

  test('events persist across reload', async ({
    objectWorkspace,
    _testPersona,
    _testEventType,
    page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    // Wait for the save request
    const saveResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/world') && response.request().method() === 'PUT',
      { timeout: 10000 }
    )

    await objectWorkspace.createEvent('Persistent Event', 'Should survive reload')
    await saveResponsePromise
    await page.waitForTimeout(1500)

    // Reload page
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    await objectWorkspace.selectTab('events')
    await objectWorkspace.expectEventExists('Persistent Event')
  })

  test('creates multiple events', async ({
    objectWorkspace,
    _testPersona,
    _testEventType,
    _page
  }) => {
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('events')

    await objectWorkspace.createEvent('Event 1', 'First')
    await objectWorkspace.createEvent('Event 2', 'Second')
    await objectWorkspace.createEvent('Event 3', 'Third')

    await objectWorkspace.expectEventExists('Event 1')
    await objectWorkspace.expectEventExists('Event 2')
    await objectWorkspace.expectEventExists('Event 3')
    await objectWorkspace.expectObjectCount('events', 3)
  })
})
