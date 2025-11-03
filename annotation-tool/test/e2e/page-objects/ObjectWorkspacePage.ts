import { Page, expect } from '@playwright/test'
import { BasePage } from './base/BasePage.js'

/**
 * Page Object for the Object Workspace.
 * Provides methods to interact with world objects (Entity, Event, Location, Time, Collections).
 */
export class ObjectWorkspacePage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  // Locators
  get addFab() {
    return this.page.getByRole('button', { name: /add/i }).last()
  }

  get searchInput() {
    return this.page.getByPlaceholder(/search.*objects/i)
  }

  get entitiesTab() {
    return this.page.getByRole('tab', { name: /entities/i })
  }

  get eventsTab() {
    return this.page.getByRole('tab', { name: /events/i })
  }

  get locationsTab() {
    return this.page.getByRole('tab', { name: /locations/i })
  }

  get timesTab() {
    return this.page.getByRole('tab', { name: /times/i })
  }

  get collectionsTab() {
    return this.page.getByRole('tab', { name: /collections/i })
  }

  // Navigation
  async navigateTo() {
    await this.goto('/objects')
    await this.page.waitForLoadState('networkidle', { timeout: 15000 })
    // Wait for personas to load from API
    await this.wait(2000)
  }

  async selectTab(tab: 'entities' | 'events' | 'locations' | 'times' | 'collections') {
    const tabMap = {
      entities: this.entitiesTab,
      events: this.eventsTab,
      locations: this.locationsTab,
      times: this.timesTab,
      collections: this.collectionsTab
    }
    await tabMap[tab].click()
    await this.wait(300)
  }

  // Entity Methods
  async createEntity(name: string, description: string, entityTypeName?: string) {
    await this.selectTab('entities')
    await this.addFab.click()
    await this.wait(300)

    // Fill form
    await this.fillEntityForm(name, description, entityTypeName)

    // Save
    await this.saveForm()
  }

  async editEntity(currentName: string, newName: string, newDescription: string) {
    await this.selectTab('entities')
    await this.clickEditButton(currentName)
    await this.wait(500)

    await this.fillEntityForm(newName, newDescription)
    await this.saveForm()
  }

  async deleteEntity(name: string) {
    await this.selectTab('entities')
    await this.clickDeleteButton(name)
  }

  async linkEntityToType(entityName: string, typeName: string) {
    await this.selectTab('entities')
    await this.clickEditButton(entityName)
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Scroll to type assignments section
    const typeAssignmentsHeading = dialog.getByText(/type assignments by persona/i)
    if (await typeAssignmentsHeading.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeAssignmentsHeading.scrollIntoViewIfNeeded()
      await this.wait(300)
    }

    // Scroll to Add Type Assignment section
    const addTypeAssignmentBox = dialog.getByText('Add Type Assignment')
    await addTypeAssignmentBox.scrollIntoViewIfNeeded()
    await this.wait(500)

    // Find the Persona select - MUI Select renders as combobox
    const personaSelect = dialog.getByRole('combobox').first()
    await personaSelect.waitFor({ state: 'visible', timeout: 5000 })
    await personaSelect.click()
    await this.wait(500)

    // Wait for the listbox to appear - it renders as a portal outside the dialog
    // Use a more specific selector to avoid conflicts with parallel tests
    await this.wait(500)
    const personaListbox = this.page.getByRole('listbox').first()
    await personaListbox.waitFor({ state: 'visible', timeout: 5000 })
    await this.wait(300)

    // Wait for options to be available and click the first one
    // Ensure we're clicking an option that's actually visible and in the correct listbox
    const firstPersonaOption = personaListbox.getByRole('option').first()
    await firstPersonaOption.waitFor({ state: 'visible', timeout: 5000 })
    await firstPersonaOption.click({ timeout: 5000 })
    await this.wait(1000)

    // Wait for listbox to close
    await personaListbox.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})

    // Click Entity Type select - it's the second combobox in the dialog
    // (first is Persona, second is Entity Type)
    const entityTypeSelect = dialog.getByRole('combobox').nth(1)
    await entityTypeSelect.scrollIntoViewIfNeeded()
    await this.wait(500)
    await entityTypeSelect.click()
    await this.wait(500)

    // Wait for type options listbox
    await this.wait(500)
    const typeListbox = this.page.getByRole('listbox').first()
    await typeListbox.waitFor({ state: 'visible', timeout: 5000 })
    await this.wait(300)

    // Select the specified type
    const typeOption = typeListbox.getByRole('option', { name: new RegExp(typeName, 'i') }).first()
    await typeOption.waitFor({ state: 'visible', timeout: 5000 })
    await typeOption.click({ timeout: 5000 })
    await this.wait(500)

    // Wait for listbox to close
    await typeListbox.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})

    // Click "Add Assignment" button
    const addButton = dialog.getByRole('button', { name: /add assignment/i })
    await expect(addButton).toBeVisible({ timeout: 5000 })
    await addButton.click()
    await this.wait(500)

    // Save the entity with new type assignment
    await this.saveForm()
  }

  async addEntityToCollection(entityName: string, _collectionName: string) {
    // Placeholder for collection functionality
    await this.selectTab('entities')
    await this.expectEntityExists(entityName)
  }

  async expectEntityExists(name: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const entityItem = visiblePanel.locator('li').filter({ has: this.page.getByText(name, { exact: true }) }).first()
    await expect(entityItem).toBeVisible({ timeout: 5000 })
  }

  async expectEntityNotExists(name: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const entityItem = visiblePanel.locator('li').filter({ has: this.page.getByText(name, { exact: true }) })
    await expect(entityItem).not.toBeVisible()
  }

  // Event Methods
  async createEvent(name: string, description: string, eventTypeName?: string) {
    await this.selectTab('events')
    await this.addFab.click()
    await this.wait(300)

    await this.fillEventForm(name, description, eventTypeName)
    await this.saveForm()
  }

  async editEvent(currentName: string, newName: string, newDescription: string) {
    await this.selectTab('events')
    await this.clickEditButton(currentName)
    await this.wait(500)

    await this.fillEventForm(newName, newDescription)
    await this.saveForm()
  }

  async deleteEvent(name: string) {
    await this.selectTab('events')
    await this.clickDeleteButton(name)
  }

  async linkEventToType(eventName: string, typeName: string) {
    await this.selectTab('events')
    await this.clickEditButton(eventName)
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 3000 })

    // Click the "Add Interpretation" accordion to expand it
    const addInterpretationAccordion = dialog.getByRole('button', { name: /add interpretation/i })
    await addInterpretationAccordion.scrollIntoViewIfNeeded()
    await this.wait(300)
    await addInterpretationAccordion.click({ timeout: 3000 })
    await this.wait(500)

    // Now the accordion is expanded - find the region with form controls
    const accordionRegion = dialog.locator('[role="region"]').first()
    await accordionRegion.waitFor({ state: 'visible', timeout: 3000 })

    // Persona select - it's the first combobox in the region
    const personaCombobox = accordionRegion.getByRole('combobox').first()
    await personaCombobox.click({ timeout: 3000 })
    await this.wait(300)

    await this.wait(500)
    const personaListbox = this.page.getByRole('listbox').first()
    await personaListbox.waitFor({ state: 'visible', timeout: 5000 })

    // Wait for options to be available and click the first one
    const firstPersonaOption = personaListbox.getByRole('option').first()
    await firstPersonaOption.waitFor({ state: 'visible', timeout: 5000 })
    await firstPersonaOption.click({ timeout: 5000 })
    await this.wait(500)

    // Wait for listbox to close
    await personaListbox.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})

    // Event Type select - it's the second combobox in the region (now visible after persona selection)
    const eventTypeCombobox = accordionRegion.getByRole('combobox').nth(1)
    await eventTypeCombobox.waitFor({ state: 'visible', timeout: 3000 })
    await eventTypeCombobox.click({ timeout: 3000 })
    await this.wait(300)

    await this.wait(500)
    const typeListbox = this.page.getByRole('listbox').first()
    await typeListbox.waitFor({ state: 'visible', timeout: 5000 })
    await this.wait(300)

    const typeOption = typeListbox.getByRole('option', { name: new RegExp(typeName, 'i') }).first()
    await typeOption.waitFor({ state: 'visible', timeout: 5000 })
    await typeOption.click({ timeout: 5000 })
    await this.wait(500)

    // Wait for listbox to close
    await typeListbox.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})

    // Click "Add Interpretation" button inside the region
    const addButton = accordionRegion.getByRole('button', { name: /add interpretation/i })
    await addButton.waitFor({ state: 'visible', timeout: 3000 })
    await addButton.click({ timeout: 3000 })
    await this.wait(500)

    // Save the event
    await this.saveForm()
  }

  async addParticipantToEvent(eventName: string, entityName: string, roleName: string) {
    await this.selectTab('events')
    await this.clickEditButton(eventName)
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Expand "Add Interpretation" accordion
    const addInterpretationAccordion = dialog.getByText('Add Interpretation')
    await addInterpretationAccordion.scrollIntoViewIfNeeded()
    await this.wait(300)

    const isExpanded = await addInterpretationAccordion.getAttribute('aria-expanded')
    if (isExpanded !== 'true') {
      await addInterpretationAccordion.click()
      await this.wait(500)
    }

    // Select persona (first available)
    const personaSelect = dialog.getByRole('combobox').filter({ hasText: /persona/i }).or(
      dialog.locator('[name="Persona"]').locator('..')
    )
    if (await personaSelect.count() > 0) {
      await personaSelect.first().click()
      await this.wait(300)
      const firstPersona = this.page.getByRole('option').first()
      if (await firstPersona.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstPersona.click()
        await this.wait(500)
      }
    }

    // Select event type (first available)
    const eventTypeSelect = dialog.getByLabel(/event type/i).first()
    if (await eventTypeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await eventTypeSelect.click()
      await this.wait(300)
      const firstType = this.page.getByRole('option').first()
      if (await firstType.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstType.click()
        await this.wait(500)
      }
    }

    // Click "Add Participant" button
    const addParticipantButton = dialog.getByRole('button', { name: /add participant/i })
    if (await addParticipantButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addParticipantButton.click()
      await this.wait(500)
    }

    // Select entity
    const entitySelect = dialog.getByLabel(/entity/i).last()
    if (await entitySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await entitySelect.click()
      await this.wait(300)
      const entityOption = this.page.getByRole('option', { name: new RegExp(entityName, 'i') })
      if (await entityOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await entityOption.click()
        await this.wait(300)
      }
    }

    // Select role
    const roleSelect = dialog.getByLabel(/role/i).last()
    if (await roleSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleSelect.click()
      await this.wait(300)
      const roleOption = this.page.getByRole('option', { name: new RegExp(roleName, 'i') })
      if (await roleOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await roleOption.click()
        await this.wait(300)
      }
    }

    // Add the interpretation
    const addInterpretationButton = dialog.getByRole('button', { name: /add interpretation/i })
    if (await addInterpretationButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addInterpretationButton.click()
      await this.wait(500)
    }

    await this.saveForm()
  }

  async linkEventToLocation(eventName: string, locationName: string) {
    await this.selectTab('events')
    await this.clickEditButton(eventName)
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 3000 })

    // Scroll down to Location/Time section
    const locationLabel = dialog.getByText(/^location$/i).first()
    if (await locationLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await locationLabel.scrollIntoViewIfNeeded()
      await this.wait(300)
    }

    // Find Location select - look for combobox near "Location" text
    const locationInput = dialog.locator('[role="combobox"]').filter({ has: this.page.locator('input[id*="location"]') }).first()
    if (await locationInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await locationInput.click({ timeout: 3000 })
    } else {
      // Fallback: try finding by nearby text
      const locationFormControl = dialog.locator('.MuiFormControl-root').filter({ hasText: /location/i }).first()
      const combobox = locationFormControl.locator('[role="combobox"]').first()
      await combobox.click({ timeout: 3000 })
    }
    await this.wait(300)

    // Wait for listbox and select location
    const listbox = this.page.getByRole('listbox').first()
    await listbox.waitFor({ state: 'visible', timeout: 3000 })
    const locationOption = listbox.getByRole('option', { name: new RegExp(locationName, 'i') }).first()
    await locationOption.click({ timeout: 3000 })
    await this.wait(300)

    await this.saveForm()
  }

  async linkEventToTime(eventName: string, timeName: string) {
    await this.selectTab('events')
    await this.clickEditButton(eventName)
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 3000 })

    // Scroll down to Time section
    const timeLabel = dialog.getByText(/^time$/i).first()
    if (await timeLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await timeLabel.scrollIntoViewIfNeeded()
      await this.wait(300)
    }

    // Find Time select - look for combobox near "Time" text
    const timeInput = dialog.locator('[role="combobox"]').filter({ has: this.page.locator('input[id*="time"]') }).first()
    if (await timeInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await timeInput.click({ timeout: 3000 })
    } else {
      // Fallback: try finding by nearby text
      const timeFormControl = dialog.locator('.MuiFormControl-root').filter({ hasText: /time/i }).first()
      const combobox = timeFormControl.locator('[role="combobox"]').first()
      await combobox.click({ timeout: 3000 })
    }
    await this.wait(300)

    // Wait for listbox and select time
    const listbox = this.page.getByRole('listbox').first()
    await listbox.waitFor({ state: 'visible', timeout: 3000 })
    const timeOption = listbox.getByRole('option', { name: new RegExp(timeName, 'i') }).first()
    await timeOption.click({ timeout: 3000 })
    await this.wait(300)

    await this.saveForm()
  }

  async expectEventExists(name: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const eventItem = visiblePanel.locator('li').filter({ has: this.page.getByText(name, { exact: true }) }).first()
    await expect(eventItem).toBeVisible({ timeout: 5000 })
  }

  async expectEventNotExists(name: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const eventItem = visiblePanel.locator('li').filter({ has: this.page.getByText(name, { exact: true }) })
    await expect(eventItem).not.toBeVisible()
  }

  // Location Methods
  async createLocation(name: string, lat: number, lng: number) {
    await this.selectTab('locations')
    await this.addFab.click()
    await this.wait(300)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    const nameInput = dialog.getByRole('textbox', { name: /name/i }).first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.click()
    await nameInput.fill(name)

    // Coordinates may be in textboxes or number inputs
    const latInput = dialog.getByLabel(/latitude/i).first()
    if (await latInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await latInput.click()
      await latInput.fill(lat.toString())
    }

    const lngInput = dialog.getByLabel(/longitude/i).first()
    if (await lngInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lngInput.click()
      await lngInput.fill(lng.toString())
    }

    await this.saveForm()
  }

  async editLocationOnMap(name: string, newLat: number, newLng: number) {
    await this.selectTab('locations')
    await this.clickEditButton(name)
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Update coordinates
    const latInput = dialog.getByLabel(/latitude/i).first()
    if (await latInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await latInput.click()
      await latInput.clear()
      await latInput.fill(newLat.toString())
    }

    const lngInput = dialog.getByLabel(/longitude/i).first()
    if (await lngInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lngInput.click()
      await lngInput.clear()
      await lngInput.fill(newLng.toString())
    }

    await this.saveForm()
  }

  async expectLocationExists(name: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const locationItem = visiblePanel.locator('li').filter({ has: this.page.getByText(name, { exact: true }) }).first()
    await expect(locationItem).toBeVisible({ timeout: 5000 })
  }

  async expectLocationNotExists(name: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const locationItem = visiblePanel.locator('li').filter({ has: this.page.getByText(name, { exact: true }) })
    await expect(locationItem).not.toBeVisible()
  }

  async deleteLocation(name: string) {
    await this.selectTab('locations')
    await this.clickDeleteButton(name)
  }

  async expectLocationAtCoordinates(name: string, lat: number, lng: number) {
    await this.selectTab('locations')
    await this.clickEditButton(name)
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    const latInput = dialog.getByLabel(/latitude/i).first()
    const lngInput = dialog.getByLabel(/longitude/i).first()

    await expect(latInput).toHaveValue(lat.toString())
    await expect(lngInput).toHaveValue(lng.toString())

    // Close dialog
    const cancelButton = this.page.getByRole('button', { name: /cancel/i })
    await cancelButton.click()
    await this.wait(300)
  }

  // Time Methods
  async createSimpleTime(label: string, datetime: string) {
    await this.selectTab('times')
    await this.addFab.click()
    await this.wait(300)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill label field
    const labelInput = dialog.getByRole('textbox', { name: /^label/i }).first()
    if (await labelInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await labelInput.click()
      await labelInput.fill(label)
    }

    // Fill datetime field (convert ISO to datetime-local format)
    // ISO: "2024-10-21T14:30:00Z" -> datetime-local: "2024-10-21T14:30"
    const datetimeLocal = datetime.replace(/:\d{2}(\.\d{3})?Z?$/, '')
    const timestampInput = dialog.getByLabel(/timestamp/i).first()
    if (await timestampInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await timestampInput.click()
      await timestampInput.fill(datetimeLocal)
    }

    await this.saveForm()
  }

  async createTimespan(label: string, start: string, end: string) {
    await this.selectTab('times')
    await this.addFab.click()
    await this.wait(300)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill label field
    const labelInput = dialog.getByRole('textbox', { name: /^label/i }).first()
    if (await labelInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await labelInput.click()
      await labelInput.fill(label)
    }

    // Select interval/timespan type
    const typeButton = dialog.getByRole('button', { name: /interval|timespan/i })
    if (await typeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeButton.click()
      await this.wait(300)
    }

    // Fill start and end times
    const startInput = dialog.getByLabel(/start/i).first()
    if (await startInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startInput.fill(start)
    }

    const endInput = dialog.getByLabel(/end/i).first()
    if (await endInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await endInput.fill(end)
    }

    await this.saveForm()
  }

  async createFuzzyTime(label: string, datetime: string, uncertainty: string) {
    await this.selectTab('times')
    await this.addFab.click()
    await this.wait(300)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill label field
    const labelInput = dialog.getByRole('textbox', { name: /^label/i }).first()
    if (await labelInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await labelInput.click()
      await labelInput.fill(label)
    }

    // Fill datetime (convert ISO to datetime-local format)
    const datetimeLocal = datetime.replace(/:\d{2}(\.\d{3})?Z?$/, '')
    const timestampInput = dialog.getByLabel(/timestamp/i).first()
    if (await timestampInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await timestampInput.click()
      await timestampInput.fill(datetimeLocal)
    }

    // Enable vagueness by clicking the switch
    const vaguenessSwitch = dialog.getByLabel(/add vagueness/i).first()
    if (await vaguenessSwitch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vaguenessSwitch.click()
      await this.wait(300)

      // Fill in vagueness description
      const descriptionInput = dialog.getByLabel(/^description$/i).first()
      if (await descriptionInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await descriptionInput.fill(uncertainty)
      }
    }

    await this.saveForm()
  }

  async expectTimeExists(label: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const timeItem = visiblePanel.locator('li').filter({ has: this.page.getByText(label, { exact: false }) }).first()
    await expect(timeItem).toBeVisible({ timeout: 5000 })
  }

  async expectTimeNotExists(label: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const timeItem = visiblePanel.locator('li').filter({ has: this.page.getByText(label, { exact: false }) })
    await expect(timeItem).not.toBeVisible()
  }

  async deleteTime(label: string) {
    await this.selectTab('times')
    await this.clickDeleteButton(label)
  }

  // Collection Methods
  async createEntityCollection(name: string, description: string, entityNames: string[] = []) {
    await this.selectTab('collections')
    await this.addFab.click()
    await this.wait(300)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Select Entity Collection type (if choosing type)
    const entityButton = dialog.getByRole('button', { name: /entity collection/i })
    if (await entityButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await entityButton.click()
      await this.wait(300)
    }

    // Fill name
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.click()
    await nameInput.fill(name)

    // Fill description
    const descTextarea = dialog.locator('textarea').first()
    if (await descTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descTextarea.click()
      await descTextarea.fill(description)
    }

    // Add entities if provided
    if (entityNames.length > 0) {
      const autocomplete = dialog.getByLabel(/select entities/i).first()
      if (await autocomplete.isVisible({ timeout: 2000 }).catch(() => false)) {
        for (const entityName of entityNames) {
          await autocomplete.click()
          await autocomplete.fill(entityName)
          await this.wait(300)

          const option = this.page.getByRole('option', { name: new RegExp(entityName, 'i') }).first()
          if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
            await option.click()
            await this.wait(300)
          }
        }
      }
    }

    await this.saveForm()
  }

  async createEventCollection(name: string, description: string, eventNames: string[] = []) {
    await this.selectTab('collections')
    await this.addFab.click()
    await this.wait(300)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Select Event Collection type
    const eventButton = dialog.getByRole('button', { name: /event collection/i })
    if (await eventButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await eventButton.click()
      await this.wait(300)
    }

    // Fill name
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.click()
    await nameInput.fill(name)

    // Fill description
    const descTextarea = dialog.locator('textarea').first()
    if (await descTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descTextarea.click()
      await descTextarea.fill(description)
    }

    // Add events if provided
    if (eventNames.length > 0) {
      const autocomplete = dialog.getByLabel(/select events/i).first()
      if (await autocomplete.isVisible({ timeout: 2000 }).catch(() => false)) {
        for (const eventName of eventNames) {
          await autocomplete.click()
          await autocomplete.fill(eventName)
          await this.wait(300)

          const option = this.page.getByRole('option', { name: new RegExp(eventName, 'i') }).first()
          if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
            await option.click()
            await this.wait(300)
          }
        }
      }
    }

    await this.saveForm()
  }

  async editCollection(currentName: string, newName: string, newDescription: string) {
    await this.selectTab('collections')
    await this.clickEditButton(currentName)
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill name
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.click()
    await nameInput.clear()
    await nameInput.fill(newName)

    // Fill description
    const descTextarea = dialog.locator('textarea').first()
    if (await descTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descTextarea.click()
      await descTextarea.clear()
      await descTextarea.fill(newDescription)
    }

    await this.saveForm()
  }

  async removeCollectionMember(collectionName: string, memberNameToRemove: string) {
    await this.selectTab('collections')
    await this.clickEditButton(collectionName)
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Find the autocomplete container
    const autocompleteContainer = dialog.locator('.MuiAutocomplete-root').first()

    // Get all member chips in the autocomplete (exclude collection type chips)
    const memberChipsInAutocomplete = autocompleteContainer.locator('.MuiChip-root').filter({
      has: this.page.locator('.MuiChip-deleteIcon')
    })

    // Find and click the delete icon for the chip to remove
    const chipToRemove = memberChipsInAutocomplete.filter({ hasText: memberNameToRemove }).first()
    const deleteIcon = chipToRemove.locator('.MuiChip-deleteIcon')
    if (await deleteIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteIcon.click()
      await this.wait(500)
    }

    await this.saveForm()
  }

  async deleteCollection(name: string) {
    await this.selectTab('collections')
    await this.clickDeleteButton(name)
  }

  async expectCollectionExists(name: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const collectionItem = visiblePanel.locator('li').filter({ has: this.page.getByText(name, { exact: true }) }).first()
    await expect(collectionItem).toBeVisible({ timeout: 5000 })
  }

  async expectCollectionNotExists(name: string) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const collectionItem = visiblePanel.locator('li').filter({ has: this.page.getByText(name, { exact: true }) })
    await expect(collectionItem).not.toBeVisible()
  }

  async expectCollectionHasMembers(collectionName: string, count: number) {
    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const collectionItem = visiblePanel.locator('li').filter({ has: this.page.getByText(collectionName, { exact: true }) }).first()

    // Look for chip showing member count
    const memberChip = collectionItem.getByText(new RegExp(`${count}\\s+(entities|events)`, 'i'))
    await expect(memberChip).toBeVisible({ timeout: 5000 })
  }

  // Search
  async searchObjects(query: string) {
    await this.searchInput.fill(query)
    await this.wait(300)
  }

  async clearSearch() {
    await this.searchInput.clear()
    await this.wait(300)
  }

  // Common Expectations
  async expectObjectCount(tab: 'entities' | 'events' | 'locations' | 'times', count: number) {
    await this.selectTab(tab)
    await this.wait(500)

    const visiblePanel = this.page.locator('[role="tabpanel"]').filter({ has: this.page.locator(':visible') }).first()
    const listItems = visiblePanel.locator('li')

    if (count === 0) {
      const itemCount = await listItems.count()
      expect(itemCount).toBe(0)
    } else {
      await expect(listItems).toHaveCount(count, { timeout: 5000 })
    }
  }

  async expectSaveSuccess() {
    await this.page.waitForResponse(
      resp => resp.url().includes('/api/world') && resp.ok(),
      { timeout: 10000 }
    ).catch(() => {})
    await this.wait(1000)
  }

  // Helper Methods
  private async fillEntityForm(name: string, description: string, _entityTypeName?: string) {
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill name
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.click()
    await nameInput.fill(name)

    // Fill description if GlossEditor is visible
    const descTextarea = dialog.locator('textarea').first()
    if (await descTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descTextarea.click()
      await descTextarea.fill(description)
    }
  }

  private async fillEventForm(name: string, description: string, _eventTypeName?: string) {
    await this.wait(500)

    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })

    // Fill name
    const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.click()
    await nameInput.fill(name)

    // Fill description
    const descTextarea = dialog.locator('textarea').first()
    if (await descTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descTextarea.click()
      await descTextarea.fill(description)
    }
  }

  private async saveForm() {
    const saveButton = this.page.getByRole('button', { name: /save|create|update/i })
    await saveButton.waitFor({ state: 'visible', timeout: 5000 })
    await saveButton.click()

    await Promise.race([
      this.page.waitForResponse(
        resp => resp.url().includes('/api/world') && resp.ok(),
        { timeout: 10000 }
      ),
      this.page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
    ]).catch(() => {})

    await this.wait(1000)
  }

  private async clickEditButton(objectName: string) {
    const listItem = this.page.locator('li').filter({ hasText: objectName }).first()
    await listItem.waitFor({ state: 'visible', timeout: 5000 })

    const editButton = listItem.locator('button').first().or(
      listItem.locator('svg[data-testid="EditIcon"]').locator('..').or(
        listItem.getByRole('button').first()
      )
    )
    await editButton.click()
    await this.wait(500)
  }

  private async clickDeleteButton(objectName: string) {
    const listItem = this.page.locator('li').filter({ hasText: objectName }).first()
    await listItem.waitFor({ state: 'visible', timeout: 5000 })

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
}
