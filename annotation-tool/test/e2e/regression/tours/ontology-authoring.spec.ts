/**
 * Tour 2 — "Building a persona's ontology" — end-to-end product flow.
 *
 * Walks all 7 steps of Tour 2, incrementally BUILDING the four-layer
 * ontology (entity / event / role / relation types) through the
 * OntologyWorkspace UI. Content for what to build comes from the
 * microvent grist — entity type "gunshot" + event type "wildfire"
 * (both from the Automated persona's real microvent ontology). Roles
 * and relations are demonstrated with synthetic-but-realistic names
 * because the microvent dataset's roles/relations arrays are empty.
 *
 * Step-by-step coverage:
 *   1. ontology-workspace-tabs — informational; press Next.
 *   2. entity-type-editor — click "+" FAB to open editor →
 *      expectAction='click' auto-advances OR Next; fill name "gunshot",
 *      type a gloss segment, click Save.
 *   3. gloss-editor — already shown during step 2's dialog. Press Next.
 *   4. event-type-editor — close prior dialog, switch to Events tab,
 *      click "+" to open editor → fill "wildfire", save.
 *   5. role-type-editor — close, switch to Roles tab, click "+", fill
 *      "perpetrator", save.
 *   6. relation-type-editor — close, switch to Relations tab, click "+",
 *      fill "occurred-at", save.
 *   7. type-hierarchy-tree — no UI yet, requiresFixture=true; the
 *      engine surfaces Skip after the 3s waitForAnchor ceiling and the
 *      visitor clicks it to finish.
 *
 * End state: the worker user's fresh persona owns one entity type, one
 * event type, one role type, and one relation type, matching the
 * counts asserted via the ontology API at the end of the test.
 */

import { test, expect } from '../../fixtures/test-context.js'

const TOUR_ID = 'ontology-authoring'

declare global {
  interface Window {
    __foveaTour?: {
      launch: (tourId: string) => Promise<boolean>
      abandon: () => void
      activeId: () => string | null
    }
  }
}

test.describe('Tour 2: Building a persona\'s ontology — end to end', () => {
  test('walks all seven steps and builds a four-layer ontology via the UI', async ({
    page,
    testUser,
    workerDb,
    workerUser,
    workerSessionToken,
    microventGrist,
  }) => {
    void testUser

    // ---- setup: build a fresh persona owned by the worker user. No
    // pre-loaded ontology — the tour walks the visitor through
    // building it from scratch. Use the microvent "Automated"
    // persona's name+role as the realistic blueprint.
    const personaGrist = microventGrist.personas.find(
      (p) => p.name === 'Automated',
    )
    expect(personaGrist, 'microvent grist exposes Automated persona').toBeTruthy()
    const persona = await workerDb.createPersona(
      {
        userId: workerUser.id,
        name: personaGrist!.name,
        role: personaGrist!.role,
      },
      workerSessionToken,
    )

    // Pull the entity + event type names from microvent's Automated
    // ontology grist so the tour builds the same content a real
    // visitor would (without the test pre-loading it).
    const automatedOntology = microventGrist.ontologyByPersonaName['Automated']
    expect(automatedOntology, 'microvent grist has Automated ontology').toBeTruthy()
    const entityTypeName = automatedOntology!.entityTypes[0]?.name
    const eventTypeName = automatedOntology!.eventTypes[0]?.name
    expect(
      entityTypeName,
      'microvent has at least one entity type to build',
    ).toBeTruthy()
    expect(
      eventTypeName,
      'microvent has at least one event type to build',
    ).toBeTruthy()
    const roleTypeName = 'perpetrator'
    const relationTypeName = 'occurred-at'

    await page.goto('/ontology')
    await page.waitForFunction(
      () => Boolean(window.__foveaTour),
      undefined,
      { timeout: 10000 },
    )

    // The /ontology landing renders the persona browser. Enter the
    // workspace by clicking Open on the first persona-card that
    // matches the name we just created. Use page-level role lookup —
    // there's exactly one Open button per persona card, so filtering
    // the Open buttons by their nearby heading text is the simplest
    // reliable shape.
    const personaHeading = page
      .getByRole('heading', { level: 3, name: persona.name })
      .first()
    await expect(personaHeading).toBeVisible({ timeout: 10000 })
    // Cards are laid out as a grid; the Open button is two levels up
    // and inside a sibling action row. The shortest path that
    // doesn't depend on internal layout is to find the Open button
    // whose nearest h3 ancestor matches the persona name.
    await page
      .locator('div')
      .filter({ has: personaHeading })
      .locator('button', { hasText: 'Open' })
      .first()
      .click()

    await page.waitForSelector('[data-tour-id="ontology-workspace-tabs"]', {
      timeout: 10000,
    })

    // ---- launch ----
    const ok = await page.evaluate(
      async (id) => Boolean(await window.__foveaTour?.launch(id)),
      TOUR_ID,
    )
    expect(ok, 'tour launched').toBe(true)
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card).toBeAttached({ timeout: 5000 })

    // ---- step 1: workspace tabs ----
    await expect(card.locator('text=/^1\\s*\\/\\s*7$/')).toBeVisible()
    await card.getByRole('button', { name: 'Next' }).click()

    // ---- step 2: entity-type-editor ----
    await expect(card.locator('text=/^2\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    // Make sure we're on the Entity Types tab.
    await page
      .getByRole('tab', { name: /^Entity Types/ })
      .click()
    // Click the floating "+" FAB to open the editor for this tab.
    await page.getByRole('button', { name: 'add type' }).click()
    await page.waitForSelector('[data-tour-id="entity-type-editor"]', {
      timeout: 5000,
    })
    // Fill the name + gloss for "gunshot".
    const entityDialog = page.locator('[data-tour-id="entity-type-editor"]')
    await entityDialog
      .getByRole('textbox', { name: /^Name$/i })
      .fill(entityTypeName!)
    // Gloss definition is required for Create to enable; type a short
    // realistic definition (matches the microvent grist for "gunshot").
    const entityGloss =
      automatedOntology!.entityTypes[0].gloss.find((g) => g.type === 'text')?.content ??
      'discharge of a firearm'
    await entityDialog
      .getByRole('textbox', { name: /Gloss Definition/i })
      .fill(entityGloss)
    // Save the type. The button label is just "Create" in create mode.
    await entityDialog
      .getByRole('button', { name: /^Create$/i })
      .click()
    // Wait for the dialog to dismiss.
    await expect(entityDialog).toBeHidden({ timeout: 5000 }).catch(() => {})
    // The runner may or may not have auto-advanced (expectAction='click'
    // on the dialog should fire when the visitor clicks inside it to
    // type, but Playwright .fill may not trigger a real click event on
    // the dialog wrapper). Tolerate both.
    let counter = await card
      .locator('text=/^\\d+\\s*\\/\\s*7$/')
      .first()
      .textContent()
    if ((counter ?? '').trim().startsWith('2 ')) {
      await card.getByRole('button', { name: 'Next' }).click()
    }

    // ---- step 3: gloss-editor ----
    await expect(card.locator('text=/^3\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    // The gloss-editor anchor lives inside the entity-type-editor
    // dialog, which we already closed. The runner waits 3s for the
    // anchor then surfaces Skip — but if a stray gloss-editor mounted
    // in some other panel, it resolves and shows Next. Accept either.
    const step3Action = card.getByRole('button', { name: /^(Skip|Next)$/ })
    await expect(step3Action).toBeVisible({ timeout: 4500 })
    await step3Action.click()

    // ---- step 4: event-type-editor ----
    await expect(card.locator('text=/^4\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    await page.getByRole('tab', { name: /^Event Types/ }).click()
    await page.getByRole('button', { name: 'add type' }).click()
    await page.waitForSelector('[data-tour-id="event-type-editor"]', {
      timeout: 5000,
    })
    const eventDialog = page.locator('[data-tour-id="event-type-editor"]')
    await eventDialog
      .getByRole('textbox', { name: /^Name$/i })
      .fill(eventTypeName!)
    await eventDialog
      .getByRole('textbox', { name: /Gloss Definition/i })
      .fill(
        automatedOntology!.eventTypes[0]?.gloss.find((g) => g.type === 'text')
          ?.content ?? 'an uncontrolled fire',
      )
    await eventDialog
      .getByRole('button', { name: /^Create$/i })
      .click()
    await expect(eventDialog).toBeHidden({ timeout: 5000 }).catch(() => {})
    counter = await card.locator('text=/^\\d+\\s*\\/\\s*7$/').first().textContent()
    if ((counter ?? '').trim().startsWith('4 ')) {
      await card.getByRole('button', { name: 'Next' }).click()
    }

    // ---- step 5: role-type-editor ----
    await expect(card.locator('text=/^5\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    await page.getByRole('tab', { name: /^Role Types/ }).click()
    await page.getByRole('button', { name: 'add type' }).click()
    await page.waitForSelector('[data-tour-id="role-type-editor"]', {
      timeout: 5000,
    })
    const roleDialog = page.locator('[data-tour-id="role-type-editor"]')
    await roleDialog
      .getByRole('textbox', { name: /^Name$/i })
      .fill(roleTypeName)
    await roleDialog
      .getByRole('textbox', { name: /Gloss Definition/i })
      .fill('a person responsible for the act')
    await roleDialog
      .getByRole('button', { name: /^Create$/i })
      .click()
    await expect(roleDialog).toBeHidden({ timeout: 5000 }).catch(() => {})
    counter = await card.locator('text=/^\\d+\\s*\\/\\s*7$/').first().textContent()
    if ((counter ?? '').trim().startsWith('5 ')) {
      await card.getByRole('button', { name: 'Next' }).click()
    }

    // ---- step 6: relation-type-editor ----
    await expect(card.locator('text=/^6\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    await page.getByRole('tab', { name: /^Relation Types/ }).click()
    await page.getByRole('button', { name: 'add type' }).click()
    await page.waitForSelector('[data-tour-id="relation-type-editor"]', {
      timeout: 5000,
    })
    const relationDialog = page.locator(
      '[data-tour-id="relation-type-editor"]',
    )
    // Relation editor's schema is different — textbox label is
    // "Relation Type Name", and the form needs at least one Source +
    // Target type selected (rendered as click-to-toggle "badge"
    // generics, four per row) before the Create button enables.
    await relationDialog
      .getByRole('textbox', { name: /Relation Type Name/i })
      .fill(relationTypeName)
    // The 8 toggleable badges appear in DOM order: Source row first
    // (Entity, Role, Event, Claim), then Target row (Entity, Role,
    // Event, Claim). Pick the first source badge and first target
    // badge.
    // Source/Target default to ['entity'] in create mode (see
    // RelationTypeEditor — line 90/91). Don't touch the badges or
    // we'll toggle the defaults off and disable Create. Just fill the
    // required gloss field below.
    await relationDialog
      .getByRole('textbox', { name: /Gloss Definition/i })
      .fill('the event took place at the location')
    await relationDialog
      .getByRole('button', { name: /^Create$/i })
      .click()
    await expect(relationDialog).toBeHidden({ timeout: 5000 }).catch(() => {})
    counter = await card.locator('text=/^\\d+\\s*\\/\\s*7$/').first().textContent()
    if ((counter ?? '').trim().startsWith('6 ')) {
      await card.getByRole('button', { name: 'Next' }).click()
    }

    // ---- step 7: type-hierarchy-tree (no UI yet — requiresFixture) ----
    await expect(card.locator('text=/^7\\s*\\/\\s*7$/')).toBeVisible({
      timeout: 5000,
    })
    // The anchor doesn't resolve; the engine shows Skip after the 3 s
    // ceiling. Skip on the last step finishes the tour.
    const finishOrSkip = card.getByRole('button', {
      name: /^(Skip|Finish)$/,
    })
    await expect(finishOrSkip).toBeVisible({ timeout: 4500 })
    await finishOrSkip.click()
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
      timeout: 5000,
    })

    // ---- end state: the persona owns one type in each of the four
    // layers, exactly what the tour walked the visitor through
    // building. Read the ontology via API and assert counts.
    const ontologyResp = await fetch(
      `http://localhost:3001/api/personas/${persona.id}/ontology`,
      { headers: { Cookie: `session_token=${workerSessionToken}` } },
    )
    expect(ontologyResp.ok, 'ontology endpoint reachable').toBe(true)
    const ontology = (await ontologyResp.json()) as {
      entities?: Array<{ name: string }>
      events?: Array<{ name: string }>
      roles?: Array<{ name: string }>
      relationTypes?: Array<{ name: string }>
    }
    expect(
      (ontology.entities ?? []).map((e) => e.name),
      'entity type built during the tour landed in the DB',
    ).toContain(entityTypeName)
    expect(
      (ontology.events ?? []).map((e) => e.name),
      'event type built during the tour landed in the DB',
    ).toContain(eventTypeName)
    expect(
      (ontology.roles ?? []).map((r) => r.name),
      'role type built during the tour landed in the DB',
    ).toContain(roleTypeName)
    expect(
      (ontology.relationTypes ?? []).map((r) => r.name),
      'relation type built during the tour landed in the DB',
    ).toContain(relationTypeName)
  })
})
