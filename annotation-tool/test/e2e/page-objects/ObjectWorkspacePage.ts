import { Page, expect } from '@playwright/test'
import { BasePage } from './base/BasePage.js'

/**
 * Page Object for the Object Workspace.
 * Provides methods to interact with world objects (Entity, Event, Location, Time).
 */
export class ObjectWorkspacePage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  // Locators
  get newEntityButton() {
    return this.page.getByRole('button', { name: /new entity/i })
  }

  get newEventButton() {
    return this.page.getByRole('button', { name: /new event/i })
  }

  get newLocationButton() {
    return this.page.getByRole('button', { name: /new location/i })
  }

  get newTimeButton() {
    return this.page.getByRole('button', { name: /new time/i })
  }

  get objectList() {
    return this.page.getByTestId('object-list').or(
      this.page.locator('[data-testid*="object-list"]')
    )
  }

  get wikidataLinkButton() {
    return this.page.getByRole('button', { name: /link.*wikidata/i }).or(
      this.page.getByTestId('link-wikidata')
    )
  }

  // Navigation
  async navigateTo() {
    await this.goto('/objects')
    await this.waitForWorkspaceReady()
  }

  // Actions
  async createEntity(name: string, typeId?: string) {
    await this.newEntityButton.click()
    await this.wait(300)

    // Select type if provided
    if (typeId) {
      const typeSelect = this.page.getByLabel(/type/i).or(
        this.page.getByTestId('entity-type-select')
      )
      await typeSelect.click()
      await this.wait(200)

      const typeOption = this.page.getByRole('option', { name: new RegExp(typeId, 'i') })
      await typeOption.click()
      await this.wait(200)
    }

    // Fill name
    const nameInput = this.page.getByLabel(/name/i).or(
      this.page.getByTestId('entity-name')
    )
    await nameInput.fill(name)

    // Click save
    const saveButton = this.page.getByRole('button', { name: /save/i })
    await saveButton.click()

    // Wait for save to complete
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/world') && resp.ok()
    )
    await this.wait(300)
  }

  async createEvent(name: string, typeId?: string) {
    await this.newEventButton.click()
    await this.wait(300)

    // Select type if provided
    if (typeId) {
      const typeSelect = this.page.getByLabel(/type/i).or(
        this.page.getByTestId('event-type-select')
      )
      await typeSelect.click()
      await this.wait(200)

      const typeOption = this.page.getByRole('option', { name: new RegExp(typeId, 'i') })
      await typeOption.click()
      await this.wait(200)
    }

    // Fill name
    const nameInput = this.page.getByLabel(/name/i).or(
      this.page.getByTestId('event-name')
    )
    await nameInput.fill(name)

    // Click save
    const saveButton = this.page.getByRole('button', { name: /save/i })
    await saveButton.click()

    // Wait for save to complete
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/world') && resp.ok()
    )
    await this.wait(300)
  }

  async createLocation(name: string, lat?: number, lng?: number) {
    await this.newLocationButton.click()
    await this.wait(300)

    // Fill name
    const nameInput = this.page.getByLabel(/name/i).or(
      this.page.getByTestId('location-name')
    )
    await nameInput.fill(name)

    // Set coordinates if provided
    if (lat !== undefined && lng !== undefined) {
      const latInput = this.page.getByLabel(/latitude/i).or(
        this.page.getByTestId('location-lat')
      )
      await latInput.fill(lat.toString())

      const lngInput = this.page.getByLabel(/longitude/i).or(
        this.page.getByTestId('location-lng')
      )
      await lngInput.fill(lng.toString())
    }

    // Click save
    const saveButton = this.page.getByRole('button', { name: /save/i })
    await saveButton.click()

    // Wait for save to complete
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/world') && resp.ok()
    )
    await this.wait(300)
  }

  async linkEntityToWikidata(entityName: string, wikidataId: string) {
    // Select the entity
    await this.selectObject(entityName)
    await this.wait(200)

    // Click link to Wikidata button
    await this.wikidataLinkButton.click()
    await this.wait(300)

    // Enter Wikidata ID
    const wikidataInput = this.page.getByPlaceholder(/wikidata.*id/i).or(
      this.page.getByTestId('wikidata-id-input')
    )
    await wikidataInput.fill(wikidataId)

    // Confirm link
    const linkButton = this.page.getByRole('button', { name: /link/i })
    await linkButton.click()

    // Wait for link to complete
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/world') && resp.ok()
    )
    await this.wait(300)
  }

  async selectObject(objectName: string) {
    const objectItem = this.page.getByText(objectName, { exact: false })
    await objectItem.click()
    await this.wait(200)
  }

  async deleteObject(objectName: string) {
    await this.selectObject(objectName)
    await this.wait(200)

    // Click delete button
    const deleteButton = this.page.getByRole('button', { name: /delete/i }).or(
      this.page.getByTestId('delete-object')
    )
    await deleteButton.click()

    // Confirm deletion
    const confirmButton = this.page.getByRole('button', { name: /confirm/i }).or(
      this.page.getByRole('button', { name: /yes/i })
    )
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click()
    }

    // Wait for deletion to complete
    await this.wait(500)
  }

  async searchObjects(searchTerm: string) {
    const searchInput = this.page.getByPlaceholder(/search/i).or(
      this.page.getByTestId('object-search')
    )
    await searchInput.fill(searchTerm)
    await this.wait(300)
  }

  // Assertions
  async expectEntityExists(entityName: string) {
    const entityItem = this.page.getByText(entityName, { exact: false })
    await expect(entityItem).toBeVisible()
  }

  async expectEventExists(eventName: string) {
    const eventItem = this.page.getByText(eventName, { exact: false })
    await expect(eventItem).toBeVisible()
  }

  async expectLocationExists(locationName: string) {
    const locationItem = this.page.getByText(locationName, { exact: false })
    await expect(locationItem).toBeVisible()
  }

  async expectObjectCount(count: number) {
    const objectItems = this.page.locator('[data-testid*="object-item"]')
    await expect(objectItems).toHaveCount(count)
  }

  async expectWorkspaceReady() {
    // Wait for world state data to load
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/world') && resp.ok()
    )
    await this.wait(500)

    // Verify workspace elements are visible
    const workspace = this.page.locator('[data-testid*="object-workspace"]').or(
      this.page.locator('main')
    )
    await expect(workspace).toBeVisible()
  }

  // Helper methods
  private async waitForWorkspaceReady() {
    await this.expectWorkspaceReady()
  }
}
