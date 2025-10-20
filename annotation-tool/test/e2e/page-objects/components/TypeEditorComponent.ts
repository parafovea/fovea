import { Page, Locator, expect } from '@playwright/test'

/**
 * Component Object for Type Editor.
 * Provides methods to interact with type editors (EntityType, EventType, etc.).
 */
export class TypeEditorComponent {
  constructor(
    private page: Page,
    private container?: Locator
  ) {}

  // Locators
  get nameInput() {
    const scope = this.container || this.page
    return scope.getByLabel(/name/i).or(scope.getByTestId('type-name'))
  }

  get definitionInput() {
    const scope = this.container || this.page
    return scope.getByLabel(/definition/i).or(scope.getByTestId('type-definition'))
  }

  get wikidataButton() {
    const scope = this.container || this.page
    return scope.getByRole('button', { name: /import.*wikidata/i }).or(
      scope.getByTestId('import-wikidata')
    )
  }

  get saveButton() {
    const scope = this.container || this.page
    return scope.getByRole('button', { name: /save/i })
  }

  get cancelButton() {
    const scope = this.container || this.page
    return scope.getByRole('button', { name: /cancel/i })
  }

  get deleteButton() {
    const scope = this.container || this.page
    return scope.getByRole('button', { name: /delete/i }).or(
      scope.getByTestId('delete-type')
    )
  }

  // Actions
  async fillName(name: string) {
    await this.nameInput.fill(name)
  }

  async fillDefinition(definition: string) {
    await this.definitionInput.fill(definition)
  }

  async save() {
    await this.saveButton.click()
    await this.waitForSave()
  }

  async cancel() {
    await this.cancelButton.click()
    await this.page.waitForTimeout(300)
  }

  async delete() {
    await this.deleteButton.click()

    // Wait for confirmation dialog
    await this.page.waitForTimeout(200)

    // Confirm deletion
    const confirmButton = this.page.getByRole('button', { name: /confirm/i }).or(
      this.page.getByRole('button', { name: /yes/i })
    )
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click()
    }

    await this.page.waitForTimeout(300)
  }

  async importFromWikidata(wikidataId: string) {
    await this.wikidataButton.click()
    await this.page.waitForTimeout(300)

    // Search for Wikidata entity
    const searchInput = this.page.getByPlaceholder(/search.*wikidata/i).or(
      this.page.getByTestId('wikidata-search')
    )
    await searchInput.fill(wikidataId)
    await searchInput.press('Enter')

    // Wait for search results
    await this.page.waitForTimeout(1000)

    // Select first result
    const firstResult = this.page.locator('[data-testid*="wikidata-result"]').first()
    await firstResult.click()

    // Confirm import
    const importButton = this.page.getByRole('button', { name: /import/i })
    await importButton.click()

    await this.waitForSave()
  }

  // Assertions
  async expectNameValue(name: string) {
    await expect(this.nameInput).toHaveValue(name)
  }

  async expectDefinitionValue(definition: string) {
    await expect(this.definitionInput).toHaveValue(definition)
  }

  async expectSaveEnabled() {
    await expect(this.saveButton).toBeEnabled()
  }

  async expectSaveDisabled() {
    await expect(this.saveButton).toBeDisabled()
  }

  // Helper methods
  private async waitForSave() {
    await this.page.waitForResponse(resp =>
      resp.url().includes('/api/ontology') && resp.ok()
    )
    await this.page.waitForTimeout(300)
  }
}
