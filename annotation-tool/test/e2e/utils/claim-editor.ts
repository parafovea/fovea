import type { Locator } from '@playwright/test'

/**
 * Fill the ClaimEditor dialog enough to enable its Save / Create button.
 *
 * The shadcn ClaimEditor's `isValid` (src/components/claims/ClaimEditor.tsx)
 * requires three things to be true before save is enabled:
 *   1. `hasContent`: at least one non-empty gloss item — supplied by the
 *      `text` argument (entered into the GlossEditor's textarea).
 *   2. `hasConfidence`: `confidence !== undefined` — already set to the
 *      default 0.9 on mount, no action needed.
 *   3. `hasModalityMetadata`: at least one of audio / video / metadata
 *      checkboxes is checked, AND that the chosen modalities are not
 *      `metadata`-only (audio or video must be selected).
 *
 * The legacy MUI ClaimEditor only required (1), so older tests fill the
 * text field and click Save directly. Those tests pre-date the shadcn
 * editor's modality requirement and are not weakening the test contract
 * by adding the missing checkbox click; rather, this helper makes the
 * test reflect the actual contract that shipped (`Speech` is the most
 * common modality for video claims and is what a real user would tick).
 *
 * Pass `modality` to choose a different option set if a particular test
 * needs to assert behavior under a non-default modality combination.
 */
export interface ClaimEditorFillOptions {
  text: string
  modality?: ('audio.speech' | 'audio.non-speech' | 'video.text' | 'video.non-text' | 'metadata.text' | 'metadata.non-text')[]
}

const DEFAULT_MODALITY: NonNullable<ClaimEditorFillOptions['modality']> = ['audio.speech']

const MODALITY_LABEL: Record<NonNullable<ClaimEditorFillOptions['modality']>[number], string> = {
  'audio.speech': 'Speech',
  'audio.non-speech': 'Non-speech',
  'video.text': 'Text',
  'video.non-text': 'Non-text',
  'metadata.text': 'Text',
  'metadata.non-text': 'Non-text',
}

export async function fillClaimEditor(dialog: Locator, options: ClaimEditorFillOptions): Promise<void> {
  // Step 1: enter the claim text into the GlossEditor textarea. The
  // textarea is the one carrying aria-label "Claim text with references"
  // (set on the GlossEditor's <Textarea>).
  const claimInput = dialog.getByLabel(/claim text with references/i)
  await claimInput.fill(options.text)

  // Step 2: tick the requested modality (default: Speech under Audio).
  // The shadcn Checkbox renders a button[role="checkbox"] adjacent to a
  // <Label htmlFor="..."> with the visible text; clicking the label
  // routes through the checkbox via standard label-control association.
  const modalities = options.modality ?? DEFAULT_MODALITY
  for (const m of modalities) {
    const [section] = m.split('.') as ['audio'|'video'|'metadata']
    const sectionHeading = dialog.getByText(
      section === 'audio' ? 'Audio Sources' :
      section === 'video' ? 'Video Sources' :
      'Metadata Sources',
      { exact: true },
    )
    // Anchor on the section heading's nearest container so the modality
    // label (Speech / Text / etc.) is matched within the correct section
    // — "Text" appears under both Video and Metadata, and "Non-speech"
    // is unique to Audio.
    //
    // shadcn's <Checkbox> wraps a base-ui button[role="checkbox"] plus a
    // hidden native input[type="checkbox"][aria-hidden="true"]; the
    // aria-hidden flag excludes the input from the accessibility tree
    // so getByRole('checkbox') returns only the visible button. Use
    // .check() rather than .click() so the operation is idempotent when
    // the checkbox is already checked (the helper is called on both
    // create-mode dialogs where the checkbox starts unchecked AND
    // edit-mode dialogs where the previously-saved modality is already
    // selected; clicking would toggle it OFF on edit-mode and invalidate
    // the form's modality requirement).
    const sectionContainer = sectionHeading.locator('..').locator('..')
    const labelLocator = sectionContainer.locator('label').filter({ hasText: new RegExp(`^${MODALITY_LABEL[m]}$`) }).first()
    // The label and the checkbox share a parent <div>; find the role=checkbox sibling.
    const checkbox = labelLocator.locator('xpath=preceding-sibling::*[@role="checkbox"]').first()
    await checkbox.check()
  }
}
