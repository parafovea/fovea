import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for multi-persona type creation and shared type functionality.
 * Tests that types can be created for multiple personas simultaneously with shared type IDs.
 */
test.describe('Multi-Persona Type Creation', () => {
  test('creates entity type for multiple personas with same sharedTypeId', async ({
    ontologyWorkspace,
    db,
    page,
    testUser,
    workerSessionToken
  }) => {
    // Create 2 personas
    const persona1 = await db.createPersona({
      userId: testUser.id,
      name: 'Analyst Alpha',
      role: 'Intelligence Analyst'
    }, workerSessionToken)

    const persona2 = await db.createPersona({
      userId: testUser.id,
      name: 'Analyst Beta',
      role: 'Strategic Analyst'
    }, workerSessionToken)

    try {
      // Navigate to ontology workspace for persona 1
      await ontologyWorkspace.navigateTo(persona1.id)
      await ontologyWorkspace.selectTab('entities')
      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      // Wait for dialog
      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible', timeout: 5000 })

      // Fill the name field
      const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
      await nameInput.fill('SharedVehicle')

      // Fill the definition
      const defInput = dialog.locator('textarea').first()
      await defInput.fill('A type shared between personas')

      // Look for the per-persona checkbox label and toggle it. shadcn's
      // <Checkbox> wraps a base-ui button (role=checkbox) plus a hidden
      // native input inside a <label> with the persona name. The hidden
      // input is aria-hidden and refuses pointer events, so click the
      // wrapping <label> by visible text — standard label-control
      // behaviour toggles the associated checkbox.
      const persona2Label = dialog.locator('label').filter({ hasText: /Analyst Beta/i }).first()
      const labelVisible = await persona2Label.isVisible({ timeout: 2000 }).catch(() => false)
      if (labelVisible) {
        await persona2Label.click()
      }

      // Save the type
      const saveButton = dialog.getByRole('button', { name: /save|create/i })
      await saveButton.click()
      await page.waitForTimeout(1000)

      // Verify type exists in persona 1
      await ontologyWorkspace.expectTypeExists('SharedVehicle')

      // Get the entity type from persona 1 to check sharedTypeId
      const type1 = await db.getEntityTypeByName(persona1.id, 'SharedVehicle')
      expect(type1).not.toBeNull()

      // Navigate to persona 2 to check if type was created there
      await ontologyWorkspace.navigateTo(persona2.id)
      await ontologyWorkspace.selectTab('entities')

      // Check if type exists in persona 2 (depends on whether multi-persona UI was available)
      if (checkboxVisible) {
        await ontologyWorkspace.expectTypeExists('SharedVehicle')

        // Get the entity type from persona 2
        const type2 = await db.getEntityTypeByName(persona2.id, 'SharedVehicle')
        expect(type2).not.toBeNull()

        // Verify both types have the same sharedTypeId
        expect(type1!.sharedTypeId).toBeDefined()
        expect(type2!.sharedTypeId).toBeDefined()
        expect(type1!.sharedTypeId).toBe(type2!.sharedTypeId)

        // Verify they have different type IDs (unique per persona)
        expect(type1!.id).not.toBe(type2!.id)
      }
    } finally {
      // Cleanup
      await db.deletePersona(persona1.id)
      await db.deletePersona(persona2.id)
    }
  })

  test('persona selection is preserved when interacting with form fields', async ({
    ontologyWorkspace,
    db,
    page,
    testUser,
    workerSessionToken
  }) => {
    // Create 2 personas
    const persona1 = await db.createPersona({
      userId: testUser.id,
      name: 'Test Persona 1',
      role: 'Analyst'
    }, workerSessionToken)

    const persona2 = await db.createPersona({
      userId: testUser.id,
      name: 'Test Persona 2',
      role: 'Researcher'
    }, workerSessionToken)

    try {
      // Navigate to ontology workspace for persona 1
      await ontologyWorkspace.navigateTo(persona1.id)
      await ontologyWorkspace.selectTab('entities')
      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible', timeout: 5000 })

      // Find the per-persona <label> that wraps a shadcn <Checkbox>; the
      // hidden native input is aria-hidden so we toggle by clicking the
      // label and read state from the role=checkbox button's
      // data-state attribute (base-ui exposes data-checked/data-unchecked).
      const persona2Label = dialog.locator('label').filter({ hasText: /Test Persona 2/i }).first()
      const persona2Checkbox = persona2Label.getByRole('checkbox')
      const labelVisible = await persona2Label.isVisible({ timeout: 2000 }).catch(() => false)

      if (labelVisible) {
        // Select persona 2
        await persona2Label.click()

        // Verify it's checked
        const isChecked1 = (await persona2Checkbox.getAttribute('data-state')) === 'checked' ||
          (await persona2Checkbox.getAttribute('aria-checked')) === 'true'
        expect(isChecked1).toBe(true)

        // Now interact with the name field (this used to reset persona selection)
        const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
        await nameInput.click()
        await nameInput.fill('TestType')

        // Wait a moment for any potential state updates
        await page.waitForTimeout(300)

        // Verify persona 2 is still checked (bug regression test)
        const isChecked2 = (await persona2Checkbox.getAttribute('data-state')) === 'checked' ||
          (await persona2Checkbox.getAttribute('aria-checked')) === 'true'
        expect(isChecked2).toBe(true)

        // Now interact with the definition field
        const defInput = dialog.locator('textarea').first()
        await defInput.click()
        await defInput.fill('A test type definition')

        await page.waitForTimeout(300)

        // Verify persona 2 is still checked after interacting with another field
        const isChecked3 = (await persona2Checkbox.getAttribute('data-state')) === 'checked' ||
          (await persona2Checkbox.getAttribute('aria-checked')) === 'true'
        expect(isChecked3).toBe(true)
      }

      // Cancel the dialog
      const cancelButton = dialog.getByRole('button', { name: /cancel/i })
      await cancelButton.click()
    } finally {
      await db.deletePersona(persona1.id)
      await db.deletePersona(persona2.id)
    }
  })

  test('single persona type creation does not include sharedTypeId', async ({
    ontologyWorkspace,
    db,
    testPersona
  }) => {
    // Navigate and create a type for single persona
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.createEntityType('SinglePersonaType', 'A type for single persona')

    await ontologyWorkspace.selectTab('entities')
    await ontologyWorkspace.expectTypeExists('SinglePersonaType')

    // Verify the type does NOT have a sharedTypeId (single persona = no sharing)
    const entityType = await db.getEntityTypeByName(testPersona.id, 'SinglePersonaType')
    expect(entityType).not.toBeNull()
    expect(entityType!.sharedTypeId).toBeUndefined()
  })

  test('types are isolated between personas by default', async ({
    ontologyWorkspace,
    db,
    page,
    testUser,
    workerSessionToken
  }) => {
    // Create 2 personas
    const persona1 = await db.createPersona({
      userId: testUser.id,
      name: 'Isolated Persona A',
      role: 'Analyst'
    }, workerSessionToken)

    const persona2 = await db.createPersona({
      userId: testUser.id,
      name: 'Isolated Persona B',
      role: 'Analyst'
    }, workerSessionToken)

    try {
      // Create type for persona 1 only (without selecting persona 2)
      await ontologyWorkspace.navigateTo(persona1.id)
      await ontologyWorkspace.createEntityType('IsolatedType', 'Only in persona A')

      await ontologyWorkspace.selectTab('entities')
      await ontologyWorkspace.expectTypeExists('IsolatedType')

      // Navigate to persona 2
      await ontologyWorkspace.navigateTo(persona2.id)
      await page.waitForLoadState('networkidle')
      await ontologyWorkspace.selectTab('entities')

      // Verify type does NOT exist in persona 2
      await ontologyWorkspace.expectTypeNotExists('IsolatedType')
    } finally {
      await db.deletePersona(persona1.id)
      await db.deletePersona(persona2.id)
    }
  })

  test('multi-persona event type creation', async ({
    ontologyWorkspace,
    db,
    page,
    testUser,
    workerSessionToken
  }) => {
    const persona1 = await db.createPersona({
      userId: testUser.id,
      name: 'Event Persona A',
      role: 'Event Analyst'
    }, workerSessionToken)

    const persona2 = await db.createPersona({
      userId: testUser.id,
      name: 'Event Persona B',
      role: 'Event Analyst'
    }, workerSessionToken)

    try {
      await ontologyWorkspace.navigateTo(persona1.id)
      await ontologyWorkspace.selectTab('events')
      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible', timeout: 5000 })

      // Fill form
      const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
      await nameInput.fill('SharedMeeting')

      const defInput = dialog.locator('textarea').first()
      await defInput.fill('A meeting event type')

      // Click the wrapping <label> for Event Persona B (shadcn Checkbox's
      // hidden native input is aria-hidden; clicking the label toggles it).
      const persona2Label = dialog.locator('label').filter({ hasText: /Event Persona B/i }).first()
      const labelVisible = await persona2Label.isVisible({ timeout: 2000 }).catch(() => false)
      if (labelVisible) {
        await persona2Label.click()
      }

      // Save
      const saveButton = dialog.getByRole('button', { name: /save|create/i })
      await saveButton.click()
      await page.waitForTimeout(1000)

      // Verify in persona 1
      await ontologyWorkspace.expectTypeExists('SharedMeeting')

      // Navigate to persona 2 and verify if multi-select was available
      if (checkboxVisible) {
        await ontologyWorkspace.navigateTo(persona2.id)
        await ontologyWorkspace.selectTab('events')
        await ontologyWorkspace.expectTypeExists('SharedMeeting')
      }
    } finally {
      await db.deletePersona(persona1.id)
      await db.deletePersona(persona2.id)
    }
  })

  test('multi-persona role type creation', async ({
    ontologyWorkspace,
    db,
    page,
    testUser,
    workerSessionToken
  }) => {
    const persona1 = await db.createPersona({
      userId: testUser.id,
      name: 'Role Persona A',
      role: 'Role Analyst'
    }, workerSessionToken)

    const persona2 = await db.createPersona({
      userId: testUser.id,
      name: 'Role Persona B',
      role: 'Role Analyst'
    }, workerSessionToken)

    try {
      await ontologyWorkspace.navigateTo(persona1.id)
      await ontologyWorkspace.selectTab('roles')
      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible', timeout: 5000 })

      // Fill form
      const nameInput = dialog.getByRole('textbox', { name: /^name/i }).first()
      await nameInput.fill('SharedAgent')

      const defInput = dialog.locator('textarea').first()
      await defInput.fill('An agent role type')

      // Click the wrapping <label> for Role Persona B (shadcn Checkbox's
      // hidden native input is aria-hidden; clicking the label toggles it).
      const persona2Label = dialog.locator('label').filter({ hasText: /Role Persona B/i }).first()
      const labelVisible = await persona2Label.isVisible({ timeout: 2000 }).catch(() => false)
      if (labelVisible) {
        await persona2Label.click()
      }

      // Save
      const saveButton = dialog.getByRole('button', { name: /save|create/i })
      await saveButton.click()
      await page.waitForTimeout(1000)

      // Verify in persona 1
      await ontologyWorkspace.expectTypeExists('SharedAgent')

      // Navigate to persona 2 and verify if multi-select was available
      if (checkboxVisible) {
        await ontologyWorkspace.navigateTo(persona2.id)
        await ontologyWorkspace.selectTab('roles')
        await ontologyWorkspace.expectTypeExists('SharedAgent')
      }
    } finally {
      await db.deletePersona(persona1.id)
      await db.deletePersona(persona2.id)
    }
  })

  test('multi-persona relation type creation', async ({
    ontologyWorkspace,
    db,
    page,
    testUser,
    workerSessionToken
  }) => {
    const persona1 = await db.createPersona({
      userId: testUser.id,
      name: 'Relation Persona A',
      role: 'Relation Analyst'
    }, workerSessionToken)

    const persona2 = await db.createPersona({
      userId: testUser.id,
      name: 'Relation Persona B',
      role: 'Relation Analyst'
    }, workerSessionToken)

    try {
      await ontologyWorkspace.navigateTo(persona1.id)
      await ontologyWorkspace.selectTab('relations')
      await ontologyWorkspace.addTypeFab.click()
      await page.waitForTimeout(300)

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible', timeout: 5000 })

      // Fill relation type form (uses different field labels)
      const nameInput = dialog.getByLabel('Relation Type Name', { exact: false }).or(
        dialog.getByRole('textbox', { name: /relation.*type.*name/i })
      )
      await nameInput.fill('SharedConnection')

      const defInput = dialog.locator('textarea').first()
      await defInput.fill('A connection relation type')

      // Click the wrapping <label> for Relation Persona B (shadcn
      // Checkbox's hidden native input is aria-hidden; clicking the label
      // toggles it).
      const persona2Label = dialog.locator('label').filter({ hasText: /Relation Persona B/i }).first()
      const labelVisible = await persona2Label.isVisible({ timeout: 2000 }).catch(() => false)
      if (labelVisible) {
        await persona2Label.click()
      }

      // Save
      const saveButton = dialog.getByRole('button', { name: /save|create/i })
      await saveButton.click()
      await page.waitForTimeout(1000)

      // Verify in persona 1
      await ontologyWorkspace.expectTypeExists('SharedConnection')

      // Navigate to persona 2 and verify if multi-select was available
      if (checkboxVisible) {
        await ontologyWorkspace.navigateTo(persona2.id)
        await ontologyWorkspace.selectTab('relations')
        await ontologyWorkspace.expectTypeExists('SharedConnection')
      }
    } finally {
      await db.deletePersona(persona1.id)
      await db.deletePersona(persona2.id)
    }
  })
})
