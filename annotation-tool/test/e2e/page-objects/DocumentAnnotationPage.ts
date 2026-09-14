import { Page, Locator, expect } from '@playwright/test'
import { BasePage } from './base/BasePage.js'

/**
 * Page Object for the standalone document span annotator and the video
 * "Associated Text" panel, which both mount the same `SpanAnnotator` +
 * `SpanLabelPicker` (`AnnotationAutocomplete` in unified `mode='both'`).
 *
 * Token selection uses POINTER events (onPointerDown/Move/Up on the tokenized
 * text), so the single-token helper first tries a plain click and falls back to
 * explicit mouse pointer events; the range helper always drives the mouse from
 * the first token's center to the last token's center.
 */
export class DocumentAnnotationPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  /** The span-annotator root. */
  get annotator(): Locator {
    return this.page.locator('[data-testid="span-annotator"]').first()
  }

  /** The label picker's anchor element (present only while the picker is open). */
  get pickerAnchor(): Locator {
    return this.page.locator('[data-testid="span-label-anchor"]')
  }

  /** All token elements inside the (first) span annotator. */
  get tokens(): Locator {
    return this.annotator.locator('[data-token]')
  }

  /**
   * Navigate to the standalone document workspace for a document and wait for the
   * span annotator to mount.
   */
  async goto(documentId: string): Promise<void> {
    await this.page.goto(`/documents/${documentId}`)
    await expect(this.annotator).toBeVisible({ timeout: 20000 })
  }

  /**
   * Select the workspace persona (the DocumentWorkspace's "Active persona"
   * shadcn Select) so type options resolve in the picker. Defaults to the
   * `testPersona` name.
   */
  async selectPersona(name = 'Test Analyst'): Promise<void> {
    const trigger = this.page.getByRole('combobox', { name: /active persona/i })
    await expect(trigger).toBeVisible({ timeout: 10000 })
    await trigger.click()
    const listbox = this.page.getByRole('listbox')
    await expect(listbox).toBeVisible({ timeout: 5000 })
    // Admin sessions can see other workers' personas; match this test's name.
    const option = listbox
      .getByRole('option')
      .filter({ hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
      .first()
    await expect(option).toBeVisible({ timeout: 5000 })
    await option.click()
    await expect(listbox).toBeHidden({ timeout: 5000 }).catch(() => {})
  }

  /** Returns the center point of a token by index. */
  private async tokenCenter(index: number): Promise<{ x: number; y: number }> {
    const tok = this.tokens.nth(index)
    await expect(tok).toBeVisible({ timeout: 10000 })
    const box = await tok.boundingBox()
    if (!box) throw new Error(`Token ${index} has no bounding box`)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  /**
   * Select a single token and open the label picker over it. Tries a plain click
   * first; if the picker does not open, falls back to explicit pointer events on
   * the token's center.
   */
  async selectToken(index: number): Promise<void> {
    const tok = this.tokens.nth(index)
    await expect(tok).toBeVisible({ timeout: 10000 })
    await tok.click()
    if (await this.pickerAnchor.isVisible().catch(() => false)) return

    const { x, y } = await this.tokenCenter(index)
    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    await this.page.mouse.up()
    await expect(this.pickerAnchor).toBeVisible({ timeout: 5000 })
  }

  /**
   * Select a contiguous run of tokens by dragging from the first token's center
   * to the last token's center with pointer events, then open the picker.
   */
  async selectTokenRange(from: number, to: number): Promise<void> {
    const start = await this.tokenCenter(from)
    const end = await this.tokenCenter(to)
    await this.page.mouse.move(start.x, start.y)
    await this.page.mouse.down()
    await this.page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2)
    await this.page.mouse.move(end.x, end.y)
    await this.page.mouse.up()
    await expect(this.pickerAnchor).toBeVisible({ timeout: 5000 })
  }

  /** Whether the label picker is currently open. */
  async pickerOpen(): Promise<boolean> {
    return this.pickerAnchor.isVisible().catch(() => false)
  }

  /** Wait for the label picker to be open. */
  async expectPickerOpen(): Promise<void> {
    await expect(this.pickerAnchor).toBeVisible({ timeout: 5000 })
  }

  /** Wait for the label picker to be closed. */
  async expectPickerClosed(): Promise<void> {
    await expect(this.pickerAnchor).toBeHidden({ timeout: 5000 })
  }

  /** Type into the picker's search input. */
  async search(text: string): Promise<void> {
    const input = this.page.locator('[data-testid="picker-search"]')
    await expect(input).toBeVisible({ timeout: 5000 })
    await input.fill(text)
  }

  /** The distinct option kinds (`data-option-kind`) currently listed in the picker. */
  async optionKinds(): Promise<string[]> {
    return this.page.locator('[data-testid="picker-option"]').evaluateAll((els) =>
      Array.from(new Set(els.map((el) => el.getAttribute('data-option-kind') ?? ''))),
    )
  }

  /** The option labels (`data-option-label`) currently listed in the picker. */
  async optionLabels(): Promise<string[]> {
    return this.page.locator('[data-testid="picker-option"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-option-label') ?? ''),
    )
  }

  /** Click the option whose display label matches. */
  async pickOption(label: string): Promise<void> {
    const option = this.page.locator(`[data-testid="picker-option"][data-option-label="${label}"]`)
    await expect(option).toBeVisible({ timeout: 5000 })
    await option.click()
  }

  /** Click the inline "create type" quick-add. */
  async quickAddType(): Promise<void> {
    const btn = this.page.locator('[data-testid="picker-create-type"]')
    await expect(btn).toBeVisible({ timeout: 5000 })
    await btn.click()
  }

  /** Click the inline "create world object" quick-add. */
  async quickAddObject(): Promise<void> {
    const btn = this.page.locator('[data-testid="picker-create-object"]')
    await expect(btn).toBeVisible({ timeout: 5000 })
    await btn.click()
  }

  /** Open the Wikidata sub-view for a world object. */
  async wikidataForObject(): Promise<void> {
    const btn = this.page.locator('[data-testid="picker-wikidata-object"]')
    await expect(btn).toBeVisible({ timeout: 5000 })
    await btn.click()
  }

  /** Open the Wikidata sub-view for an ontology type. */
  async wikidataForType(): Promise<void> {
    const btn = this.page.locator('[data-testid="picker-wikidata-type"]')
    await expect(btn).toBeVisible({ timeout: 5000 })
    await btn.click()
  }

  /** Return from the Wikidata sub-view to the unified list. */
  async wikidataBack(): Promise<void> {
    const btn = this.page.locator('[data-testid="picker-wikidata-back"]')
    await expect(btn).toBeVisible({ timeout: 5000 })
    await btn.click()
  }

  /**
   * Choose a world-object kind in the Wikidata object sub-view and assert the
   * chosen button is pressed.
   */
  async chooseKind(kind: 'entity' | 'location' | 'event' | 'time'): Promise<void> {
    const btn = this.page.locator(`[data-testid="picker-kind-${kind}"]`)
    await expect(btn).toBeVisible({ timeout: 5000 })
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
  }

  /** The span rows in the side panel. */
  get spanRows(): Locator {
    return this.annotator.locator('[data-span-row]')
  }

  /** Count of tokens currently covered by a span (carrying `data-span-ids`). */
  async coveredTokenCount(): Promise<number> {
    return this.annotator.locator('[data-token][data-span-ids]').count()
  }

  /**
   * Assert that a label chip with the given name is shown on some span row
   * (the label picker's chosen type/object surfaces as a chip in the panel).
   */
  async expectLabelChip(name: string): Promise<void> {
    await expect(
      this.annotator.locator('[data-span-row]').getByText(name, { exact: true }).first(),
    ).toBeVisible({ timeout: 10000 })
  }

  /** Re-open the label picker on the first span row via its label control. */
  async reopenPickerOnFirstSpan(): Promise<void> {
    const editBtn = this.spanRows
      .first()
      .getByRole('button', { name: /label span|add label/i })
    await expect(editBtn).toBeVisible({ timeout: 10000 })
    await editBtn.click()
    await this.expectPickerOpen()
  }
}
