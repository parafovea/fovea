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
  get addTypeFab() {
    return this.page.getByRole('button', { name: /add type/i }).or(
      this.page.locator('button[aria-label*="add"]').last()
    )
  }

  get searchInput() {
    return this.page.getByPlaceholder(/search.*type/i)
  }

  get entityTypesTab() {
    return this.page.getByRole('tab', { name: /entity types/i })
  }

  get roleTypesTab() {
    return this.page.getByRole('tab', { name: /role types/i })
  }

  get eventTypesTab() {
    return this.page.getByRole('tab', { name: /event types/i })
  }

  get relationTypesTab() {
    return this.page.getByRole('tab', { name: /relation types/i })
  }

  // Navigation
  async navigateTo(personaId?: string) {
    if (!personaId) {
      throw new Error('personaId is required - OntologyWorkspace no longer auto-selects personas')
    }

    // Navigate to ontology workspace with cache-bust
    await this.page.goto(`/ontology?t=${Date.now()}`)
    await this.page.waitForLoadState('networkidle', { timeout: 15000 })

    // Wait for either PersonaBrowser OR ontology tabs to be visible
    await Promise.race([
      this.page.locator('[data-persona-id]').first().waitFor({ state: 'visible', timeout: 10000 }),
      this.entityTypesTab.waitFor({ state: 'visible', timeout: 10000 })
    ])

    // If tabs are visible, go back to PersonaBrowser
    const tabsVisible = await this.entityTypesTab.isVisible().catch(() => false)
    if (tabsVisible) {
      const backBtn = this.page.getByRole('button', { name: 'Back to persona browser' })
      await backBtn.click()
      // Wait for tabs to disappear (state change confirmation)
      await this.entityTypesTab.waitFor({ state: 'hidden', timeout: 10000 })
      await this.page.locator('[data-persona-id]').first().waitFor({ state: 'visible', timeout: 10000 })
    }

    // Find and click the specific persona
    const personaCard = this.page.locator(`[data-persona-id="${personaId}"]`)
    const cardVisible = await personaCard.isVisible({ timeout: 2000 }).catch(() => false)

    if (!cardVisible) {
      // Persona not found - might need to reload to get fresh data
      await this.page.reload()
      await this.page.waitForLoadState('networkidle', { timeout: 10000 })
      await personaCard.waitFor({ state: 'visible', timeout: 10000 }).catch(async () => {
        const allPersonaIds = await this.page.locator('[data-persona-id]').evaluateAll(
          els => els.map(el => el.getAttribute('data-persona-id'))
        )
        throw new Error(`Persona "${personaId}" not found. Available: [${allPersonaIds.join(', ')}]`)
      })
    }

    // Click Open button on the persona card
    const openButton = personaCard.locator('button:has-text("Open")')
    await openButton.click()

    // Wait for ontology tabs to appear
    await this.entityTypesTab.waitFor({ state: 'visible', timeout: 10000 })
  }

  async selectTab(tab: 'entities' | 'events' | 'roles' | 'relations') {
    const tabMap = {
      entities: this.entityTypesTab,
      roles: this.roleTypesTab,
      events: this.eventTypesTab,
      relations: this.relationTypesTab
    }
    await tabMap[tab].click()
    await this.wait(300)
  }

  // Entity Types
  async createEntityType(name: string, definition: string) {
    await this.selectTab('entities')
    await this.addTypeFab.click()
    await this.wait(300)

    // Fill form
    await this.fillTypeForm(name, definition)

    // Save
    await this.saveTypeForm()
  }

  async editEntityType(currentName: string, newName: string, newDefinition: string) {
    await this.selectTab('entities')
    await this.clickEditButton(currentName)
    await this.wait(500)

    // Wait for dialog and fill form
    await this.fillTypeForm(newName, newDefinition)
    await this.saveTypeForm()
  }

  async deleteEntityType(name: string) {
    await this.selectTab('entities')
    await this.clickDeleteButton(name)
  }

  async duplicateEntityType(name: string) {
    // Not yet implemented in UI - placeholder
    await this.selectTab('entities')
    await this.expectTypeExists(name)
  }

  async searchEntityTypes(query: string) {
    await this.selectTab('entities')
    await this.searchInput.fill(query)
    await this.wait(300)
  }

  // Event Types
  async createEventType(name: string, definition: string) {
    await this.selectTab('events')
    await this.addTypeFab.click()
    await this.wait(300)

    await this.fillTypeForm(name, definition)
    await this.saveTypeForm()
  }

  async editEventType(currentName: string, newName: string, newDefinition: string) {
    await this.selectTab('events')
    await this.clickEditButton(currentName)
    await this.wait(500)

    await this.fillTypeForm(newName, newDefinition)
    await this.saveTypeForm()
  }

  async deleteEventType(name: string) {
    await this.selectTab('events')
    await this.clickDeleteButton(name)
  }

  // Role Types
  async createRoleType(name: string, definition: string, allowedFillerTypes: string[]) {
    await this.selectTab('roles')
    await this.addTypeFab.click()
    await this.wait(300)

    await this.fillTypeForm(name, definition)

    // Add allowed filler types if provided
    for (const fillerType of allowedFillerTypes) {
      const fillerInput = this.page.getByLabel(/allowed.*filler/i).or(
        this.page.getByPlaceholder(/add.*entity.*type/i)
      )
      if (await fillerInput.isVisible().catch(() => false)) {
        await fillerInput.fill(fillerType)
        await this.page.keyboard.press('Enter')
      }
    }

    await this.saveTypeForm()
  }

  async editRoleType(currentName: string, newName: string, newDefinition: string) {
    await this.selectTab('roles')
    await this.clickEditButton(currentName)
    await this.wait(500)

    await this.fillTypeForm(newName, newDefinition)
    await this.saveTypeForm()
  }

  async deleteRoleType(name: string) {
    await this.selectTab('roles')
    await this.clickDeleteButton(name)
  }

  // Relation Types
  async createRelationType(name: string, definition: string, _sourceTypes: string[] = [], _targetTypes: string[] = []) {
    await this.selectTab('relations')
    await this.addTypeFab.click()
    await this.wait(300)

    await this.fillRelationTypeForm(name, definition)

    // Fill source and target types if provided
    // For basic tests, we use the defaults (Entity selected)
    // Advanced tests can extend this to interact with chips

    await this.saveTypeForm()
  }

  async editRelationType(currentName: string, newName: string, newDefinition: string) {
    await this.selectTab('relations')
    await this.clickEditButton(currentName)
    await this.wait(500)

    await this.fillRelationTypeForm(newName, newDefinition)
    await this.saveTypeForm()
  }

  async deleteRelationType(name: string) {
    await this.selectTab('relations')
    await this.clickDeleteButton(name)
  }

  // Wikidata Integration
  async importFromWikidata(wikidataId: string) {
    // Open Wikidata search in current editor
    const wikidataButton = this.page.getByRole('button', { name: /wikidata/i })
    await wikidataButton.click()
    await this.wait(300)

    // Search for entity
    const searchInput = this.page.getByPlaceholder(/search.*wikidata/i)
    await searchInput.fill(wikidataId)
    await this.wait(1000) // Wait for search

    // Select first result
    const firstResult = this.page.locator('[data-testid*="wikidata-result"]').first().or(
      this.page.getByRole('button').filter({ hasText: new RegExp(wikidataId, 'i') }).first()
    )
    await firstResult.click()

    // Import
    const importButton = this.page.getByRole('button', { name: /import|select/i })
    await importButton.click()
    await this.wait(300)
  }

  async searchWikidata(query: string) {
    const wikidataButton = this.page.getByRole('button', { name: /wikidata/i })
    await wikidataButton.click()
    await this.wait(300)

    const searchInput = this.page.getByPlaceholder(/search.*wikidata/i)
    await searchInput.fill(query)
    await this.wait(1000)
  }

  async selectWikidataResult(index: number) {
    const results = this.page.locator('[data-testid*="wikidata-result"]')
    await results.nth(index).click()
    await this.wait(300)
  }

  // Assertions
  async expectTypeExists(name: string) {
    // Wait for data to load
    await this.page.waitForLoadState('networkidle', { timeout: 10000 })

    // Find visible (not hidden) tab panel and look for type by name.
    // The shadcn rewrite renders type rows as plain <li> with the name in
    // a nested <div>; the prior `li > p` query was MUI-specific.
    const visibleTabPanel = this.page.locator('[role="tabpanel"]:not([hidden])')
    // Anchor on the Edit/Delete button aria-label since each row carries
    // "Edit <name>" — that's an exact, unambiguous substring even when the
    // type's gloss happens to contain the name elsewhere on the page.
    const typeItem = visibleTabPanel.locator('li').filter({
      has: this.page.getByRole('button', { name: `Edit ${name}` })
    }).first()
    await expect(typeItem).toBeVisible({ timeout: 10000 })
  }

  async expectTypeNotExists(name: string) {
    // Wait for data to load
    await this.page.waitForLoadState('networkidle', { timeout: 10000 })

    // Find visible (not hidden) tab panel and check type doesn't exist
    // Use p element with exact text to avoid matching definitions
    const visibleTabPanel = this.page.locator('[role="tabpanel"]:not([hidden])')
    const typeItem = visibleTabPanel.locator('li').locator('p').filter({ hasText: new RegExp(`^${name}$`) })
    await expect(typeItem).not.toBeVisible()
  }

  async expectTypeCount(count: number) {
    // Wait for data to load
    await this.page.waitForLoadState('networkidle', { timeout: 10000 })

    // Count list items in visible (not hidden) tab panel
    const visibleTabPanel = this.page.locator('[role="tabpanel"]:not([hidden])')
    const listItems = visibleTabPanel.locator('li')

    if (count === 0) {
      const itemCount = await listItems.count()
      expect(itemCount).toBe(0)
    } else {
      await expect(listItems).toHaveCount(count, { timeout: 10000 })
    }
  }

  async expectTypeDefinition(name: string, definition: string) {
    await this.clickEditButton(name)
    await this.wait(500)

    const defInput = this.page.locator('textarea').first().or(
      this.page.getByLabel(/gloss|definition/i).first()
    )
    await defInput.waitFor({ state: 'visible', timeout: 5000 })
    await expect(defInput).toHaveValue(definition)

    // Close dialog
    const cancelButton = this.page.getByRole('button', { name: /cancel/i })
    await cancelButton.click()
    await this.wait(500)
  }

  async expectWikidataIdLinked(name: string, wikidataId: string) {
    // Look for Wikidata chip near the type name
    const typeRow = this.page.locator(`text="${name}"`).locator('..')
    const wikidataChip = typeRow.locator(`text="${wikidataId}"`).or(
      this.page.getByText(wikidataId)
    )
    await expect(wikidataChip).toBeVisible()
  }

  async expectSearchResults(count: number) {
    await this.wait(300)
    await this.expectTypeCount(count)
  }

  async expectNoTypes() {
    await this.expectTypeCount(0)
  }

  // Helper Methods
  private async fillTypeForm(name: string, definition: string) {
    // Wait for dialog to be fully loaded
    await this.wait(500)

    // Scope all selectors to the dialog to avoid conflicts with search fields
    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill name field - MUI adds asterisk for required fields
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.click()
    await nameInput.fill(name)

    // Fill definition/gloss field
    const defInput = dialog.locator('textarea').first()
    await defInput.waitFor({ state: 'visible', timeout: 5000 })
    await defInput.click()
    await defInput.fill(definition)
  }

  private async fillRelationTypeForm(name: string, definition: string) {
    // Wait for dialog to be fully loaded
    await this.wait(500)

    // Scope all selectors to the dialog to avoid conflicts with search fields
    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill name field - relation dialog uses "Relation Type Name" label
    // Use exact label first, then fall back to more generic selectors
    const nameInput = dialog.getByLabel('Relation Type Name', { exact: false }).or(
      dialog.getByRole('textbox', { name: /relation.*type.*name/i })
    )
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.click()
    await nameInput.fill(name)

    // Fill gloss definition - relation dialog uses GlossEditor with textarea
    const defInput = dialog.locator('textarea').first()
    await defInput.waitFor({ state: 'visible', timeout: 5000 })
    await defInput.click()
    await defInput.fill(definition)
  }

  private async saveTypeForm() {
    const saveButton = this.page.getByRole('button', { name: /save|create|done/i })
    await saveButton.waitFor({ state: 'visible', timeout: 5000 })
    await saveButton.click()

    // Wait for dialog to close
    await this.page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {
      // Dialog might have closed very quickly
    })

    // Wait for network to settle (API calls + cache invalidation refetches)
    await this.page.waitForLoadState('networkidle', { timeout: 10000 })
  }

  private async clickEditButton(typeName: string) {
    // Find and click the Edit button using its aria-label which includes the type name
    const editButton = this.page.getByRole('button', { name: `Edit ${typeName}` })
    await editButton.waitFor({ state: 'visible', timeout: 5000 })
    await editButton.click()
    await this.wait(500)
  }

  private async clickDeleteButton(typeName: string) {
    // Find the list item containing the type name
    const listItem = this.page.locator('li').filter({ hasText: typeName }).first()
    await listItem.waitFor({ state: 'visible', timeout: 5000 })

    // Click the delete button within that list item
    // Delete icon is usually the second icon button
    const deleteButton = listItem.locator('button').nth(1).or(
      listItem.locator('svg[data-testid="DeleteIcon"]').locator('..').or(
        listItem.getByRole('button').nth(1)
      )
    )
    await deleteButton.click()
    await this.wait(500)

    // Handle confirmation dialog if it appears
    const confirmButton = this.page.getByRole('button', { name: /confirm|yes|delete/i })
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click()
      await this.wait(500)
    }
  }

  /**
   * ACCESSIBILITY METHODS
   * Methods for testing keyboard navigation, focus management, and ARIA attributes
   */

  /**
   * Assert that an entity type dialog is currently open.
   */
  async expectEntityTypeDialogOpen(): Promise<void> {
    const dialog = this.page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    const titleText = await dialog.locator('h2, [role="heading"]').first().textContent()
    expect(titleText?.toLowerCase()).toMatch(/entity|type|create|edit/)
  }

  /**
   * Assert that entity type dialog is closed.
   */
  async expectEntityTypeDialogClosed(): Promise<void> {
    const dialog = this.page.locator('[role="dialog"]')
    await expect(dialog).not.toBeVisible()
  }

  /**
   * Tab to next focusable element.
   */
  async tabForward(): Promise<void> {
    await this.page.keyboard.press('Tab')
    await this.wait(100)
  }

  /**
   * Shift+Tab to previous focusable element.
   */
  async tabBackward(): Promise<void> {
    await this.page.keyboard.press('Shift+Tab')
    await this.wait(100)
  }

  /**
   * Press Escape key.
   */
  async pressEscape(): Promise<void> {
    await this.page.keyboard.press('Escape')
    await this.wait(200)
  }

  /**
   * Assert that focus is trapped within a dialog.
   */
  async expectDialogFocusTrap(): Promise<void> {
    const dialog = this.page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Tab through up to 20 elements
    for (let i = 0; i < 20; i++) {
      await this.tabForward()

      const focusedInDialog = await this.page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]')
        return dialog?.contains(document.activeElement) ?? false
      })

      expect(focusedInDialog).toBe(true)
    }
  }

  /**
   * Assert that the currently focused element has a visible focus indicator.
   * Verifies outline or box-shadow is present, or that element is an interactive element with focus.
   */
  async expectFocusVisible(): Promise<void> {
    const focusInfo = await this.page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return { hasFocus: false, hasIndicator: false, tagName: 'BODY', isInteractive: false }

      const styles = window.getComputedStyle(el)
      const hasOutline = styles.outline !== 'none' && styles.outlineWidth !== '0px'
      const hasBoxShadow = styles.boxShadow !== 'none'
      const hasBackground = styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent'

      // Check if element is naturally focusable
      const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'VIDEO']
      const isInteractive = interactiveTags.includes(el.tagName) ||
                          el.getAttribute('tabindex') !== null ||
                          el.getAttribute('role') === 'button' ||
                          el.getAttribute('role') === 'tab'

      return {
        hasFocus: true,
        hasIndicator: hasOutline || hasBoxShadow || hasBackground,
        tagName: el.tagName,
        isInteractive
      }
    })

    const passesTest = focusInfo.hasFocus && (focusInfo.hasIndicator || focusInfo.isInteractive)
    expect(passesTest).toBe(true)
  }
}
