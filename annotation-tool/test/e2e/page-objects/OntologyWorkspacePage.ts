import { Page, expect } from '@playwright/test'
import { BasePage } from './base/BasePage.js'

/**
 * Page Object for the Ontology Workspace.
 * Provides methods to interact with ontology type definitions (EntityType, EventType, etc.).
 */
export class OntologyWorkspacePage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  // Locators
  get newEntityTypeButton() {
    return this.page.getByRole('button', { name: /new entity type/i })
  }

  get newEventTypeButton() {
    return this.page.getByRole('button', { name: /new event type/i })
  }

  get newRoleTypeButton() {
    return this.page.getByRole('button', { name: /new role type/i })
  }

  get newRelationTypeButton() {
    return this.page.getByRole('button', { name: /new relation type/i })
  }

  get typeList() {
    return this.page.getByTestId('type-list').or(
      this.page.locator('[data-testid*="type-list"]')
    )
  }

  get wikidataImportButton() {
    return this.page.getByRole('button', { name: /import.*wikidata/i }).or(
      this.page.getByTestId('import-wikidata')
    )
  }

  // Navigation
  async navigateTo() {
    await this.goto('/ontology')
    await this.waitForWorkspaceReady()
  }

  // Actions
  async createEntityType(name: string, definition: string) {
    await this.newEntityTypeButton.click()
    await this.wait(300)

    // Fill name
    const nameInput = this.page.getByLabel(/name/i).or(
      this.page.getByTestId('type-name')
    )
    await nameInput.fill(name)

    // Fill definition
    const definitionInput = this.page.getByLabel(/definition/i).or(
      this.page.getByTestId('type-definition')
    )
    await definitionInput.fill(definition)

    // Click save
    const saveButton = this.page.getByRole('button', { name: /save/i })
    await saveButton.click()

    // Wait for save to complete
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/ontology') && resp.ok()
    )
    await this.wait(300)
  }

  async createEventType(name: string, definition: string) {
    await this.newEventTypeButton.click()
    await this.wait(300)

    // Fill name
    const nameInput = this.page.getByLabel(/name/i).or(
      this.page.getByTestId('type-name')
    )
    await nameInput.fill(name)

    // Fill definition
    const definitionInput = this.page.getByLabel(/definition/i).or(
      this.page.getByTestId('type-definition')
    )
    await definitionInput.fill(definition)

    // Click save
    const saveButton = this.page.getByRole('button', { name: /save/i })
    await saveButton.click()

    // Wait for save to complete
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/ontology') && resp.ok()
    )
    await this.wait(300)
  }

  async importFromWikidata(wikidataId: string) {
    await this.wikidataImportButton.click()
    await this.wait(300)

    // Search for Wikidata entity
    const searchInput = this.page.getByPlaceholder(/search.*wikidata/i).or(
      this.page.getByTestId('wikidata-search')
    )
    await searchInput.fill(wikidataId)
    await searchInput.press('Enter')

    // Wait for search results
    await this.wait(1000)

    // Select first result
    const firstResult = this.page.locator('[data-testid*="wikidata-result"]').first()
    await firstResult.click()

    // Confirm import
    const importButton = this.page.getByRole('button', { name: /import/i })
    await importButton.click()

    // Wait for import to complete
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/ontology') && resp.ok()
    )
    await this.wait(300)
  }

  async selectType(typeName: string) {
    const typeItem = this.page.getByText(typeName, { exact: false })
    await typeItem.click()
    await this.wait(200)
  }

  async deleteType(typeName: string) {
    await this.selectType(typeName)
    await this.wait(200)

    // Click delete button
    const deleteButton = this.page.getByRole('button', { name: /delete/i }).or(
      this.page.getByTestId('delete-type')
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

  async searchTypes(searchTerm: string) {
    const searchInput = this.page.getByPlaceholder(/search/i).or(
      this.page.getByTestId('type-search')
    )
    await searchInput.fill(searchTerm)
    await this.wait(300)
  }

  // Assertions
  async expectTypeExists(typeName: string) {
    const typeItem = this.page.getByText(typeName, { exact: false })
    await expect(typeItem).toBeVisible()
  }

  async expectTypeCount(count: number) {
    const typeItems = this.page.locator('[data-testid*="type-item"]')
    await expect(typeItems).toHaveCount(count)
  }

  async expectWorkspaceReady() {
    // Wait for ontology data to load
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/ontology') && resp.ok()
    )
    await this.wait(500)

    // Verify workspace elements are visible
    const workspace = this.page.locator('[data-testid*="ontology-workspace"]').or(
      this.page.locator('main')
    )
    await expect(workspace).toBeVisible()
  }

  // Helper methods
  private async waitForWorkspaceReady() {
    await this.expectWorkspaceReady()
  }
}
