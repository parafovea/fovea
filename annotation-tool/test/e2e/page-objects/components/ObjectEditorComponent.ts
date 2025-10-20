import { Page, Locator, expect } from '@playwright/test'

/**
 * Component Object for Object Editor.
 * Provides methods to interact with object editors (Entity, Event, Location, Time).
 */
export class ObjectEditorComponent {
  constructor(
    private page: Page,
    private container?: Locator
  ) {}

  // Locators
  get nameInput() {
    const scope = this.container || this.page
    return scope.getByLabel(/name/i).or(scope.getByTestId('object-name'))
  }

  get typeSelect() {
    const scope = this.container || this.page
    return scope.getByLabel(/type/i).or(scope.getByTestId('object-type-select'))
  }

  get descriptionInput() {
    const scope = this.container || this.page
    return scope.getByLabel(/description/i).or(scope.getByTestId('object-description'))
  }

  get wikidataLinkButton() {
    const scope = this.container || this.page
    return scope.getByRole('button', { name: /link.*wikidata/i }).or(
      scope.getByTestId('link-wikidata')
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
      scope.getByTestId('delete-object')
    )
  }

  // Location-specific locators
  get latitudeInput() {
    const scope = this.container || this.page
    return scope.getByLabel(/latitude/i).or(scope.getByTestId('location-lat'))
  }

  get longitudeInput() {
    const scope = this.container || this.page
    return scope.getByLabel(/longitude/i).or(scope.getByTestId('location-lng'))
  }

  // Actions
  async fillName(name: string) {
    await this.nameInput.fill(name)
  }

  async selectType(typeName: string) {
    await this.typeSelect.click()
    await this.page.waitForTimeout(200)

    const typeOption = this.page.getByRole('option', { name: new RegExp(typeName, 'i') })
    await typeOption.click()
    await this.page.waitForTimeout(200)
  }

  async fillDescription(description: string) {
    await this.descriptionInput.fill(description)
  }

  async fillCoordinates(lat: number, lng: number) {
    await this.latitudeInput.fill(lat.toString())
    await this.longitudeInput.fill(lng.toString())
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

  async linkToWikidata(wikidataId: string) {
    await this.wikidataLinkButton.click()
    await this.page.waitForTimeout(300)

    // Enter Wikidata ID
    const wikidataInput = this.page.getByPlaceholder(/wikidata.*id/i).or(
      this.page.getByTestId('wikidata-id-input')
    )
    await wikidataInput.fill(wikidataId)

    // Confirm link
    const linkButton = this.page.getByRole('button', { name: /link/i })
    await linkButton.click()

    await this.waitForSave()
  }

  // Assertions
  async expectNameValue(name: string) {
    await expect(this.nameInput).toHaveValue(name)
  }

  async expectDescriptionValue(description: string) {
    await expect(this.descriptionInput).toHaveValue(description)
  }

  async expectCoordinates(lat: number, lng: number) {
    await expect(this.latitudeInput).toHaveValue(lat.toString())
    await expect(this.longitudeInput).toHaveValue(lng.toString())
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
      resp.url().includes('/api/world') && resp.ok()
    )
    await this.page.waitForTimeout(300)
  }
}
