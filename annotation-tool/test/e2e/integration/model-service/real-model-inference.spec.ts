/**
 * Tier 2 user-journey integration spec against the REAL CPU-mode
 * model-service container.
 *
 * Companion to ./real-model-service.spec.ts. That spec verifies the
 * meta-endpoint contract (/health, /api/models/config, /api/models/
 * frameworks, /api/models/task-ready) via page.request; this spec
 * covers what a human visitor actually does in the application UI,
 * exercising every inference task type the model-service exposes by
 * driving the same buttons, dialogs, and panels a researcher would
 * click in the booth. No mocks, no page.route fulfills, no direct
 * page.request.post against inference endpoints; the only page.request
 * calls below are for read-only persistence verification after the UI
 * has driven the model-service round-trip.
 *
 * Inference tasks covered as standalone per-task user journeys:
 *   1. Ontology augmentation        OntologyWorkspace > Suggest Types
 *                                   > AI Ontology Augmentation card.
 *   2. Object detection             AnnotationWorkspace > Detect
 *                                   Objects > DetectionDialog >
 *                                   Run Detection > Detection Results
 *                                   dialog > AnnotationCandidatesList.
 *   3. Object tracking              DetectionDialog with frame range +
 *                                   Enable Tracking checkbox; the
 *                                   model-service runs detection then
 *                                   forwards tracking and returns the
 *                                   merged candidate list.
 *   4. VLM video summarization      VideoBrowser card > Summarize
 *                                   button > JobStatusIndicator >
 *                                   VideoSummaryCard expanded view.
 *   5. Claim extraction             AnnotationWorkspace > Edit Summary
 *                                   > Claims tab > Extract Claims
 *                                   > ClaimsExtractionDialog > ClaimsViewer.
 *   6. Thumbnail generation         VideoBrowser card thumbnail <img>
 *                                   that renders only when the
 *                                   backend's GET /api/videos/:id/
 *                                   thumbnail successfully returns a
 *                                   real model-service-produced image.
 *
 * Multi-service knowledge-extraction journey (single test, seven
 * sequential steps, all UI-driven, same persona + same video for the
 * whole flow):
 *   1. Author a new persona via OntologyWorkspace PersonaBrowser
 *      "add persona" FAB > PersonaEditor > fill name + role +
 *      Information Need > Done.
 *   2. Open the new persona, augment its entity ontology via the
 *      Suggest Types button, accept >=1 suggestion into the persona.
 *   3. Navigate to the annotation workspace for the test video, pick
 *      the new persona, run Detect Objects against the current frame.
 *   4. With the same persona and a multi-frame range, run Detect
 *      Objects again with Enable Tracking checked so the model-service
 *      returns tracked candidates.
 *   5. Generate the VLM video summary via the Edit Summary dialog
 *      (the editor enqueues a backend summarize job that the worker
 *      forwards to the real model-service).
 *   6. From the summary editor's Claims tab, run Extract Claims and
 *      wait for at least one claim row to render.
 *   7. Reload the page and confirm the persisted summary text +
 *      claim count survive the round-trip.
 *
 * Why elevated per-step UI waitFor budgets:
 *   - VLM summarization on CPU with first-call weight loading: up to
 *     15 minutes; budget 900_000 ms.
 *   - Claim extraction (LLM completion over the summary): up to 15
 *     minutes; budget 900_000 ms.
 *   - Object detection / tracking / ontology augmentation on CPU: up
 *     to 5 minutes per call; budget 300_000 ms.
 *   - Standard UI navigation and form interaction: 30 seconds.
 *
 * Engage by booting docker-compose.e2e.real-models.yml (swaps the
 * backend's MODEL_SERVICE_URL to the real CPU-mode model-service
 * container with models-cpu.yaml) and running:
 *
 *   pnpm --filter @fovea/annotation-tool exec \
 *     playwright test --project=integration-models \
 *     test/e2e/integration/model-service/real-model-inference.spec.ts
 *
 * The integration-models project's per-test timeout is 30 minutes
 * (playwright.config.ts), comfortably above the chained worst-case
 * inside the multi-service journey.
 */
import type { Page, Response, Locator } from '@playwright/test'
import { test, expect } from '../../fixtures/test-context.js'

// Per-step UI waitFor budgets. Inline literals would let a casual
// edit drift these in one place while leaving the rationale comment
// behind in another; pin them to named constants here so the
// per-call call sites read as documentation of what is being waited
// on rather than as bare millisecond counts.
const FAST_UI_WAIT_MS = 30_000
// 5 min: covers tracking on CPU (yolo11n-seg + multi-frame extraction
// genuinely takes ~2 min for a 5-frame range even after warm-start).
const SHORT_INFERENCE_WAIT_MS = 300_000
// 8 min: tightest upper bound that still admits VLM summarize on
// CPU after capping max_video_frames=3 in models-cpu.yaml. Measured:
// SmolVLM-500M takes 3m30s cold and ~5m45s when memory-evicted
// between calls; LLM augment / claim extraction return in <90s with
// the qwen2.5-1.5b LLM warm. Success paths terminate fast, so this
// ceiling only matters when a model genuinely stalls.
const LONG_INFERENCE_WAIT_MS = 480_000

/**
 * Shape the backend's GET /api/personas/:id/ontology returns after the
 * camelCase rename (entityTypes -> entities, etc.); used only for the
 * read-only persistence check after a UI accept of augmenter
 * suggestions. The full shape lives in
 * server/src/routes/personas.ts; only the fields this spec consumes
 * are typed here.
 */
interface PersonaOntologyResponse {
  id: string
  personaId: string
  entities: Array<{ id: string; name: string }>
  events: Array<{ id: string; name: string }>
  roles: Array<{ id: string; name: string }>
}

/**
 * Shape the backend's GET /api/videos/:videoId/summaries returns;
 * only fields the post-reload persistence check reads are typed.
 */
interface VideoSummaryListItem {
  id: string
  personaId: string
  summary: Array<{ type: string; content: string }>
}

/**
 * Open the AnnotationWorkspace for the test video and wait for the
 * core toolbar + annotations panel to be visible. Replaces a bespoke
 * goto + sleep pattern with the same selectors AnnotationWorkspacePage
 * already established as the deterministic ready signal.
 */
async function openAnnotationWorkspace(page: Page, videoId: string): Promise<void> {
  await page.goto(`/annotate/${videoId}`, { timeout: FAST_UI_WAIT_MS })
  await expect(
    page.getByRole('combobox', { name: /select persona/i }),
  ).toBeVisible({ timeout: FAST_UI_WAIT_MS })
  await expect(page.getByText('All Annotations')).toBeVisible({ timeout: FAST_UI_WAIT_MS })
}

/**
 * Pick a persona inside the AnnotationWorkspace toolbar's persona
 * combobox by exact display name. The combobox renders options as
 * "<name> - <role>" so the match anchors on a "<name> -" prefix to
 * avoid colliding with a worker-parallel persona of the same role.
 */
async function selectPersonaInWorkspace(page: Page, personaName: string): Promise<void> {
  const personaSelect = page.getByRole('combobox', { name: /select persona/i })
  await expect(personaSelect).toBeVisible({ timeout: FAST_UI_WAIT_MS })
  await expect(personaSelect).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
  await personaSelect.click()
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible({ timeout: FAST_UI_WAIT_MS })
  const escaped = personaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const option = page
    .getByRole('option')
    .filter({ hasText: new RegExp(`^${escaped} -`) })
    .first()
  await expect(option).toBeVisible({ timeout: FAST_UI_WAIT_MS })
  await option.click()
  // Wait for the type-select to enable; this is the ontology-loaded
  // signal the AnnotationWorkspacePage object also uses.
  await expect(
    page.getByRole('combobox', { name: /select type/i }),
  ).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
}

/**
 * Open the DetectionDialog by clicking the Detect Objects button in
 * the AnnotationWorkspace toolbar, then return the Locator the caller
 * can use to scope further clicks to the open dialog.
 */
async function openDetectionDialog(page: Page): Promise<Locator> {
  const detectButton = page.getByRole('button', { name: /^detect objects$/i })
  await expect(detectButton).toBeVisible({ timeout: FAST_UI_WAIT_MS })
  await expect(detectButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
  await detectButton.click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Detect Objects' })
  await expect(dialog).toBeVisible({ timeout: FAST_UI_WAIT_MS })
  return dialog
}

/**
 * Click Run Detection inside the open DetectionDialog and wait for the
 * Detection Results dialog to render. The transition is the model-
 * service round-trip; budget SHORT_INFERENCE_WAIT_MS.
 */
async function runDetectionAndWaitForResults(page: Page, dialog: Locator): Promise<Locator> {
  const runButton = dialog.getByRole('button', { name: /^run detection$/i })
  await expect(runButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
  await runButton.click()
  const resultsDialog = page.getByRole('dialog').filter({ hasText: 'Detection Results' })
  await expect(resultsDialog).toBeVisible({ timeout: SHORT_INFERENCE_WAIT_MS })
  return resultsDialog
}

// Per-task block intentionally NOT .serial: each task test must pass
// on its own merits against the real model-service, so a single failure
// shouldn't skip the remaining task journeys. The integration-models
// Playwright project already pins workers:1, so these still run one at
// a time in clock order, but a red test 1 no longer hides red/green
// signal on tests 2 through 6.
test.describe('Per-task user journeys against real model-service', () => {
  test('user augments persona ontology with real LLM via Suggest Types', async ({
    page,
    testPersona,
  }) => {
    // STEP 1: Navigate to the ontology workspace and open the test
    // persona. The page renders the PersonaBrowser first; the
    // persona card carries data-persona-id which is the stable
    // selector the OntologyWorkspacePage object also uses.
    await page.goto(`/ontology?t=${Date.now()}`, { timeout: FAST_UI_WAIT_MS })
    const personaCard = page.locator(`[data-persona-id="${testPersona.id}"]`)
    await expect(personaCard).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await personaCard.getByRole('button', { name: /^open$/i }).click()
    await expect(
      page.getByRole('tab', { name: /entity types/i }),
    ).toBeVisible({ timeout: FAST_UI_WAIT_MS })

    // STEP 2: Default tab is Entity Types; open the augmenter via
    // the Suggest Types button. The button's text is "Suggest Types"
    // (OntologyWorkspace.tsx:469); the underlying handler opens the
    // augmenter floating panel with the AI Ontology Augmentation
    // heading.
    const suggestButton = page.getByRole('button', { name: /suggest types/i })
    await expect(suggestButton).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await expect(suggestButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
    await suggestButton.click()
    const augmenterHeading = page.getByRole('heading', { name: /ai ontology augmentation/i })
    await expect(augmenterHeading).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    // Scope subsequent checkbox / button lookups to the augmenter panel
    // so a sibling checkbox elsewhere on the OntologyWorkspace (existing
    // entity-type cards, persona selection, etc.) can't be counted as
    // a suggestion row.
    const augmenterCard = page.locator('div').filter({ has: augmenterHeading }).first()

    // STEP 3: Type a real-world domain into the Domain Description
    // textarea and click Generate Suggestions.
    const domainInput = page.getByPlaceholder(/wildlife research/i)
    await expect(domainInput).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await domainInput.fill(
      'Severe weather field research; tracking dust storms, visibility hazards, and affected infrastructure.',
    )
    const generateButton = page.getByRole('button', { name: /generate suggestions/i })
    await expect(generateButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
    await generateButton.click()

    // STEP 4: Wait for the model-service round-trip; the success
    // state renders a "Suggestions (N)" header followed by selectable
    // suggestion rows. The Add Selected button doubles as a robust
    // ready signal because it only renders inside the mutation
    // success branch.
    // Wait for one of the three terminal states the augmenter can
    // resolve to:
    //   1. "Suggestions (N)" header (success with at least one row)
    //   2. "No suggestions generated" alert (success with zero rows)
    //   3. "Failed to generate suggestions" alert (mutation error)
    // Including the error branch fails the test fast with a clear
    // message instead of stalling on the 15 min ceiling waiting for a
    // success state that never arrives.
    await expect(
      augmenterCard
        .getByText(/^Suggestions \(\d+\)$/)
        .or(augmenterCard.getByText(/no suggestions generated/i))
        .or(augmenterCard.getByText(/failed to generate suggestions/i)),
    ).toBeVisible({ timeout: LONG_INFERENCE_WAIT_MS })
    const errorAlert = augmenterCard.getByText(/failed to generate suggestions/i)
    if (await errorAlert.isVisible().catch(() => false)) {
      throw new Error(
        'OntologyAugmenter rendered mutation.isError after the model-service round-trip — backend log will hold the upstream cause',
      )
    }

    // STEP 5: Assert at least one suggestion rendered. Each
    // suggestion row contains a Checkbox + name span; pick all
    // visible checkboxes inside the augmenter and assert >=1.
    const suggestionCheckboxes = augmenterCard.getByRole('checkbox')
    const checkboxCount = await suggestionCheckboxes.count()
    expect(
      checkboxCount,
      `real LLM must return at least one suggestion for a well-formed domain prompt (got ${checkboxCount} checkboxes)`,
    ).toBeGreaterThanOrEqual(1)
    const addSelectedButton = augmenterCard.getByRole('button', { name: /add selected \(\d+\)/i })
    await expect(addSelectedButton).toBeVisible({ timeout: FAST_UI_WAIT_MS })
  })

  test('user runs object detection on test video via Detect Objects', async ({
    page,
    testVideo,
    testPersona,
  }) => {
    await openAnnotationWorkspace(page, testVideo.id)
    await selectPersonaInWorkspace(page, testPersona.name)

    const dialog = await openDetectionDialog(page)
    // Use Persona Ontology tab is selected by default. Default frame
    // selection is "Current Frame Only"; leave it alone so this test
    // exercises the cheapest detection variant (single frame, no
    // tracking) for the per-task pass.
    const resultsDialog = await runDetectionAndWaitForResults(page, dialog)

    // The results dialog header text is "Found N objects for query:
    // <query>"; assert it rendered with the expected shape and that
    // the underlying AnnotationCandidatesList shows at least one
    // candidate. Some real-model invocations on a low-action frame
    // return zero candidates, which is still a valid model-service
    // response; the assertion under test is that the model-service
    // round-trip completed and rendered a Detection Results dialog,
    // not that the model found a specific object on this clip.
    await expect(resultsDialog).toContainText(/Found \d+ objects for query:/i, {
      timeout: FAST_UI_WAIT_MS,
    })
    const closeButton = resultsDialog.getByRole('button', { name: /^close$/i }).first()
    await expect(closeButton).toBeVisible({ timeout: FAST_UI_WAIT_MS })
  })

  test('user runs detection + tracking on a frame range', async ({
    page,
    testVideo,
    testPersona,
  }) => {
    await openAnnotationWorkspace(page, testVideo.id)
    await selectPersonaInWorkspace(page, testPersona.name)

    const dialog = await openDetectionDialog(page)
    // Switch frame mode to "Frame Range" so the Enable Tracking
    // checkbox unlocks (DetectionDialog.tsx:361 wraps the tracking
    // section behind frameMode !== 'current'). Start frame defaults
    // to current frame; end frame defaults to current + 5 seconds
    // worth of frames; leave both alone so the range is small enough
    // to stay inside the CPU-only budget.
    const frameModeSelect = dialog.getByRole('combobox').first()
    await frameModeSelect.click()
    await page.getByRole('option', { name: /frame range/i }).click()

    const enableTrackingLabel = dialog.locator('label').filter({ hasText: /^Enable Tracking$/ })
    await expect(enableTrackingLabel).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await enableTrackingLabel.click()

    // SAMURAI is the default tracking model selection; do not change
    // it. Run detection and wait for the Detection Results dialog.
    const resultsDialog = await runDetectionAndWaitForResults(page, dialog)
    await expect(resultsDialog).toContainText(/Found \d+ objects for query:/i, {
      timeout: FAST_UI_WAIT_MS,
    })
  })

  test('user generates a real VLM video summary from the video browser', async ({
    page,
    testVideo,
    testPersona,
  }) => {
    // Navigate to the home video browser. Each video card carries a
    // Summarize button (when no summary exists yet) that
    // enqueues a backend summarize job; the JobStatusIndicator below
    // the card flips through queued/processing/completed states; on
    // completion the card auto-expands and the VideoSummaryCard
    // renders the persisted summary content.
    await page.goto('/', { timeout: FAST_UI_WAIT_MS })

    // Pick the test persona in the video browser toolbar so the
    // Summarize button enables (VideoBrowser.tsx:744 disables it
    // until activePersonaId is set).
    const personaSelect = page.getByRole('combobox').first()
    await expect(personaSelect).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await personaSelect.click()
    const escaped = testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await page
      .getByRole('option')
      .filter({ hasText: new RegExp(`${escaped}`) })
      .first()
      .click()

    // Locate the card for the test video. Cards carry data-slot=
    // "card"; filter by the video filename text which renders in
    // the card.
    const videoCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: testVideo.filename })
      .first()
    await expect(videoCard).toBeVisible({ timeout: FAST_UI_WAIT_MS })

    // Click the Summarize button on this card. The button is
    // labeled "Summarize" when no summary exists for the active
    // persona, "View" once one does (VideoBrowser.tsx:749).
    const summarizeButton = videoCard.getByRole('button', {
      name: /^(summarize|view)$/i,
    })
    await expect(summarizeButton).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await expect(summarizeButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
    await summarizeButton.click()

    // Wait for the JobStatusIndicator to render under the card,
    // signal completion (via the "Generating summary" title
    // disappearing), and the VideoSummaryCard to render content.
    // The summary content lives inside a div whose text is the
    // generated summary; the cheapest stable wait is to wait for
    // the JobStatusIndicator to disappear and a non-empty summary
    // text to render in its place.
    await expect(
      videoCard.getByText(/generating summary/i),
    ).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await expect(
      videoCard.getByText(/generating summary/i),
    ).toBeHidden({ timeout: LONG_INFERENCE_WAIT_MS })

    // The card expands automatically on completion (VideoBrowser
    // toggleSummaryExpand on success); the VideoSummaryCard renders
    // the summary text. Assert the card area now contains real
    // text (length > 0) that is not a placeholder.
    const cardText = await videoCard.innerText()
    expect(
      cardText.length,
      'video card must render real VLM-generated summary content after the job completes',
    ).toBeGreaterThan(testVideo.filename.length + 10)
  })

  test('user triggers claim extraction from the saved summary', async ({
    page,
    testVideo,
    testPersona,
  }) => {
    // Pre-seed a summary so the Extract Claims button can enable;
    // we do this via the API because the standalone case is about
    // claim extraction specifically, not summary creation (covered
    // in its own test above and again in the multi-service journey).
    // page.request is permitted here for SETUP, not for the
    // inference step under test.
    const seedRes = await page.request.post('/api/summaries', {
      data: {
        videoId: testVideo.id,
        personaId: testPersona.id,
        summary: [
          {
            type: 'text',
            content:
              'A dust storm sweeps across an arid landscape obscuring visibility and forcing vehicles off the road.',
          },
        ],
      },
    })
    expect(
      seedRes.status(),
      `summary seed must succeed (got ${seedRes.status()})`,
    ).toBe(201)

    await openAnnotationWorkspace(page, testVideo.id)

    // Open the Edit Summary dialog from the workspace toolbar.
    const editSummaryButton = page.getByRole('button', { name: /^edit summary$/i })
    await expect(editSummaryButton).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await editSummaryButton.click()
    const summaryDialog = page.getByRole('dialog').filter({ hasText: 'Edit Video Summary' })
    await expect(summaryDialog).toBeVisible({ timeout: FAST_UI_WAIT_MS })

    // Pick the test persona in the summary dialog's persona
    // dropdown so the editor mounts with the seeded summary loaded.
    const summaryPersonaSelect = summaryDialog.getByRole('combobox')
    await summaryPersonaSelect.click()
    const escaped = testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await page
      .getByRole('option')
      .filter({ hasText: new RegExp(`^${escaped} -`) })
      .first()
      .click()

    // Switch to the Claims tab so the Extract Claims button mounts.
    const claimsTab = summaryDialog.getByRole('tab', { name: /^claims/i })
    await expect(claimsTab).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await claimsTab.click()

    // The Edit Video Summary dialog renders the Extract Claims button
    // twice (toolbar action + nested icon button); `.first()` picks
    // the outer toolbar entry, which is the same one a real user
    // would click.
    const extractButton = summaryDialog
      .getByRole('button', { name: /^extract claims$/i })
      .first()
    await expect(extractButton).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await expect(extractButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
    await extractButton.click()

    // ClaimsExtractionDialog opens. Match its exact title text
    // ("Extract Claims from Summary") rather than a substring-extract
    // since the parent Edit Video Summary dialog also matches the
    // looser pattern; once both are in the dialog tree, `.last()`
    // returns whichever rendered last by Radix's portal ordering,
    // which is brittle.
    const extractionConfigDialog = page.getByRole('dialog', {
      name: /^Extract Claims from Summary$/i,
    })
    await expect(extractionConfigDialog).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    const startExtractionButton = extractionConfigDialog.getByRole('button', {
      name: /^extract claims$/i,
    })
    await expect(startExtractionButton).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await expect(startExtractionButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
    await startExtractionButton.click()
    // The config dialog closes when the extraction job is enqueued.
    // Wait for that transition before polling for the badge so we
    // don't race a still-open dialog blocking the tab badge in the
    // editor behind it.
    await expect(extractionConfigDialog).toBeHidden({ timeout: FAST_UI_WAIT_MS })

    // Wait for the claim-extraction job to land. The Claims tab
    // renders a badge with the claim count next to the tab name;
    // assert it flips from absent / 0 to >= 1.
    // VideoSummaryEditor.tsx wraps the tab label as
    //   <span>Claims<Badge>{count}</Badge></span>
    // inside the Claims `TabsTrigger`. Scope the badge lookup to the
    // Claims tab itself rather than walking up from a `text=Claims`
    // node — the span's accumulated text becomes "Claims3" once the
    // badge mounts, so a `^Claims$` exact-text match silently
    // disappears and the badge is invisible to the assertion.
    await expect(async () => {
      const claimsTabTrigger = summaryDialog.getByRole('tab', { name: /^claims/i })
      const badge = claimsTabTrigger.locator('[data-slot="badge"]')
      const badgeText = await badge.innerText().catch(() => '')
      const count = parseInt(badgeText, 10)
      expect(
        Number.isFinite(count) && count >= 1,
        `Claims tab badge must show >=1 after real extraction (got "${badgeText}")`,
      ).toBe(true)
    }).toPass({ timeout: LONG_INFERENCE_WAIT_MS })
  })

  test('user views a real thumbnail in the video browser', async ({ page, testVideo }) => {
    // Thumbnails are produced by the model-service via POST
    // /api/thumbnails/generate, persisted to a shared mount, and
    // served by the backend's GET /api/videos/:id/thumbnail. The
    // VideoBrowser renders the thumbnail as a plain <img> whose src
    // is that endpoint; we drive the user-journey assertion by
    // waiting for the img element to load (naturalWidth > 0).
    await page.goto('/', { timeout: FAST_UI_WAIT_MS })

    const videoCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: testVideo.filename })
      .first()
    await expect(videoCard).toBeVisible({ timeout: FAST_UI_WAIT_MS })

    const thumbnailImg = videoCard.locator('img').first()
    await expect(thumbnailImg).toBeVisible({ timeout: SHORT_INFERENCE_WAIT_MS })

    // naturalWidth > 0 confirms the browser successfully decoded
    // the bytes the backend served. A broken thumbnail load leaves
    // naturalWidth at 0.
    await expect(async () => {
      const naturalWidth = await thumbnailImg.evaluate(
        (el) => (el as HTMLImageElement).naturalWidth,
      )
      expect(naturalWidth, 'thumbnail img must decode to non-zero width').toBeGreaterThan(0)
    }).toPass({ timeout: SHORT_INFERENCE_WAIT_MS })
  })

  test('user transcribes audio via Transcribe Audio and sees timed segments', async ({
    page,
    testVideo,
  }) => {
    // Drive the plain-transcription user journey: open the workspace,
    // turn the "Identify speakers" diarization toggle off (pyannote is
    // gated behind an HF agreement and may not be configured in every
    // booth), click Transcribe Audio, and assert the dialog renders at
    // least one timed segment with a clickable timestamp pill.
    await openAnnotationWorkspace(page, testVideo.id)

    const transcribeButton = page.getByTestId('transcribe-audio-button')
    await expect(transcribeButton).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await expect(transcribeButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
    await transcribeButton.click()

    // The mutation pends synchronously: while it pends the dialog is
    // not yet open, so wait for the dialog to materialise within the
    // SHORT_INFERENCE_WAIT_MS budget.
    const dialog = page.getByTestId('transcript-dialog')
    await expect(dialog).toBeVisible({ timeout: SHORT_INFERENCE_WAIT_MS })

    // The TranscriptPanel renders an <ol data-testid="transcript-segments">
    // with one button per segment; faster-whisper on the test clip
    // returns at least one segment for the audio track.
    const segments = page.getByTestId('transcript-segment')
    await expect(segments.first()).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    expect(await segments.count()).toBeGreaterThan(0)

    // Toggle diarization off and re-run to confirm the plain-transcript
    // code path is reachable from the UI (a CPU-only deployment without
    // pyannote credentials will rely on this fallback).
    const diarizeToggle = page.getByTestId('transcribe-diarize-toggle')
    await diarizeToggle.uncheck()
    await page.getByTestId('transcript-rerun-button').click()
    await expect(segments.first()).toBeVisible({ timeout: SHORT_INFERENCE_WAIT_MS })
  })
})

test.describe.serial('Multi-service knowledge-extraction journey', () => {
  test('user authors a persona, augments its ontology, runs detection + tracking, summarizes, and extracts claims', async ({
    page,
    testUser,
    testVideo,
  }) => {
    void testUser
    // Personas the journey creates are scoped by a unique name per
    // run so a re-run on the same worker doesn't collide with the
    // previous run's persona. The worker fixture's cleanup runs
    // before each test so most collisions are avoided already, but
    // a unique suffix is cheap insurance.
    const journeyPersonaName = `Weather Response Analyst ${Date.now()}`
    const journeyPersonaRole = 'Emergency response coordinator'
    const journeyInformationNeed =
      'Identify severe weather phenomena visible in the footage, the infrastructure or vehicles they affect, ' +
      'and any emergency response personnel or equipment present. Track how visibility and ground conditions ' +
      'change across the clip so downstream analysts can prioritize incident reports.'
    const journeyDomain =
      'Severe weather field operations; dust storms and visibility hazards on rural highways with civilian ' +
      'vehicles and emergency response vehicles in frame.'

    // STEP 1: Create the persona through the OntologyWorkspace
    // PersonaBrowser FAB > PersonaEditor dialog.
    await page.goto(`/ontology?t=${Date.now()}`, { timeout: FAST_UI_WAIT_MS })
    const addPersonaFab = page.getByRole('button', { name: /^add persona$/i })
    await expect(addPersonaFab).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await addPersonaFab.click()

    const personaDialog = page.getByRole('dialog').filter({ hasText: 'Create New Persona' })
    await expect(personaDialog).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await personaDialog.getByLabel(/persona name/i).fill(journeyPersonaName)
    await personaDialog.getByLabel(/^role/i).fill(journeyPersonaRole)
    await personaDialog.getByLabel(/information need/i).fill(journeyInformationNeed)
    const doneButton = personaDialog.getByRole('button', { name: /^done$/i })
    await expect(doneButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })

    // Capture the network response so we have the new persona's id
    // for the world / summary / claim verifications below without
    // needing to scrape it out of the DOM.
    const createPersonaResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().endsWith('/api/personas') &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
      { timeout: FAST_UI_WAIT_MS },
    )
    await doneButton.click()
    const createPersonaResponse: Response = await createPersonaResponsePromise
    const createdPersona = (await createPersonaResponse.json()) as { id: string; name: string }
    expect(createdPersona.id).toBeTruthy()
    expect(createdPersona.name).toBe(journeyPersonaName)

    await expect(personaDialog).toBeHidden({ timeout: FAST_UI_WAIT_MS })

    // STEP 2: Open the persona, run the AI augmenter for entity
    // types, accept >=1 suggestion. The PersonaBrowser refreshes
    // automatically; pick the freshly-created card by its
    // data-persona-id.
    const newPersonaCard = page.locator(`[data-persona-id="${createdPersona.id}"]`)
    await expect(newPersonaCard).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    await newPersonaCard.getByRole('button', { name: /^open$/i }).click()
    await expect(
      page.getByRole('tab', { name: /entity types/i }),
    ).toBeVisible({ timeout: FAST_UI_WAIT_MS })

    // Wait for the Suggest Types button to enable; OntologyWorkspace
    // disables it until /api/models/config resolves with at least one
    // of cudaAvailable / cpuModelsAvailable === true, and clicking it
    // before the modelConfig query lands is a real race that the prior
    // run hit (button disabled, click never lands, test times out).
    const journeySuggestButton = page.getByRole('button', { name: /suggest types/i })
    await expect(journeySuggestButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
    await journeySuggestButton.click()
    const journeyAugmenterHeading = page.getByRole('heading', {
      name: /ai ontology augmentation/i,
    })
    await expect(journeyAugmenterHeading).toBeVisible({ timeout: FAST_UI_WAIT_MS })
    const journeyAugmenterCard = page
      .locator('div')
      .filter({ has: journeyAugmenterHeading })
      .first()
    await page.getByPlaceholder(/wildlife research/i).fill(journeyDomain)
    await page.getByRole('button', { name: /generate suggestions/i }).click()

    await expect(
      journeyAugmenterCard
        .getByText(/^Suggestions \(\d+\)$/)
        .or(journeyAugmenterCard.getByText(/no suggestions generated/i)),
    ).toBeVisible({ timeout: LONG_INFERENCE_WAIT_MS })
    const suggestionCheckboxes = journeyAugmenterCard.getByRole('checkbox')
    const suggestionCount = await suggestionCheckboxes.count()
    expect(
      suggestionCount,
      'real LLM augmentation must return at least one suggestion for the weather domain prompt',
    ).toBeGreaterThanOrEqual(1)
    // Tick the first two checkboxes (or the only one if just one
    // came back), then click Add Selected.
    const toAccept = Math.min(2, suggestionCount)
    for (let i = 0; i < toAccept; i++) {
      await suggestionCheckboxes.nth(i).check()
    }
    const addSelectedButton = journeyAugmenterCard.getByRole('button', {
      name: new RegExp(`add selected \\(${toAccept}\\)`, 'i'),
    })
    await expect(addSelectedButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })

    // Wait for the persona-ontology PUT that the Add Selected click
    // triggers so the assertion below sees the persisted types.
    const ontologyPutPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/personas/${createdPersona.id}/ontology`) &&
        resp.request().method() === 'PUT' &&
        resp.status() < 400,
      { timeout: SHORT_INFERENCE_WAIT_MS },
    )
    await addSelectedButton.click()
    await ontologyPutPromise

    // Verify persisted entity-type count >= 1 against the canonical
    // server view (UI-driven steps can be flaky on layout; this is
    // a read-only sanity gate after the UI mutation completed).
    const ontologyRes = await page.request.get(
      `/api/personas/${createdPersona.id}/ontology`,
    )
    expect(ontologyRes.status()).toBe(200)
    const ontology = (await ontologyRes.json()) as PersonaOntologyResponse
    expect(
      ontology.entities.length,
      'persona ontology must hold the accepted suggestions after the augmenter UI flow',
    ).toBeGreaterThanOrEqual(1)

    // STEP 3: Navigate to the annotation workspace for the test
    // video. Pick the journey persona in the workspace toolbar and
    // run Detect Objects against the current frame.
    await openAnnotationWorkspace(page, testVideo.id)
    await selectPersonaInWorkspace(page, journeyPersonaName)

    const detectionDialog = await openDetectionDialog(page)
    let detectionResultsDialog = await runDetectionAndWaitForResults(page, detectionDialog)
    await expect(detectionResultsDialog).toContainText(/Found \d+ objects for query:/i, {
      timeout: FAST_UI_WAIT_MS,
    })
    await detectionResultsDialog.getByRole('button', { name: /^close$/i }).first().click()
    await expect(detectionResultsDialog).toBeHidden({ timeout: FAST_UI_WAIT_MS })

    // STEP 4: Re-open the detection dialog, switch to Frame Range,
    // enable tracking, run again. The model-service returns a
    // tracked candidate set in the same Detection Results dialog.
    const detectionDialogTracking = await openDetectionDialog(page)
    const frameModeSelect = detectionDialogTracking.getByRole('combobox').first()
    await frameModeSelect.click()
    await page.getByRole('option', { name: /frame range/i }).click()
    await detectionDialogTracking
      .locator('label')
      .filter({ hasText: /^Enable Tracking$/ })
      .click()
    detectionResultsDialog = await runDetectionAndWaitForResults(
      page,
      detectionDialogTracking,
    )
    await expect(detectionResultsDialog).toContainText(/Found \d+ objects for query:/i, {
      timeout: FAST_UI_WAIT_MS,
    })
    await detectionResultsDialog.getByRole('button', { name: /^close$/i }).first().click()
    await expect(detectionResultsDialog).toBeHidden({ timeout: FAST_UI_WAIT_MS })

    // STEP 5: Open the Edit Summary dialog, pick the journey persona,
    // and let the VideoSummaryEditor generate the VLM summary. The
    // editor auto-kicks a summarize job when no summary exists for
    // the (video, persona) pair; we wait for the editor to render
    // real summary text.
    await page.getByRole('button', { name: /^edit summary$/i }).click()
    const summaryDialog = page.getByRole('dialog').filter({ hasText: 'Edit Video Summary' })
    await expect(summaryDialog).toBeVisible({ timeout: FAST_UI_WAIT_MS })

    const summaryPersonaSelect = summaryDialog.getByRole('combobox')
    await summaryPersonaSelect.click()
    const escapedPersona = journeyPersonaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await page
      .getByRole('option')
      .filter({ hasText: new RegExp(`^${escapedPersona} -`) })
      .first()
      .click()

    // Wait for either the in-editor summary text to render OR a
    // saved-status indicator to flip. The editor's Summary tab
    // renders the gloss content inside a textarea / contenteditable
    // region; the cleanest cross-implementation wait is for the
    // backend summarize job to land. Bound by LONG_INFERENCE_WAIT_MS.
    await expect(async () => {
      const summariesRes = await page.request.get(
        `/api/videos/${testVideo.id}/summaries`,
      )
      expect(summariesRes.status()).toBe(200)
      const list = (await summariesRes.json()) as VideoSummaryListItem[]
      const own = list.find((s) => s.personaId === createdPersona.id)
      expect(
        own && own.summary.length > 0 && own.summary.some((g) => g.content.trim().length > 20),
        'real VLM summary for the journey persona must persist with non-trivial content',
      ).toBe(true)
    }).toPass({ timeout: LONG_INFERENCE_WAIT_MS, intervals: [5_000, 15_000, 30_000] })

    // STEP 6: From the same dialog's Claims tab, run Extract Claims
    // and wait for >=1 claim to land.
    const claimsTab = summaryDialog.getByRole('tab', { name: /^claims/i })
    await claimsTab.click()
    const extractClaimsButton = summaryDialog.getByRole('button', {
      name: /^extract claims$/i,
    })
    await expect(extractClaimsButton).toBeEnabled({ timeout: FAST_UI_WAIT_MS })
    await extractClaimsButton.click()

    const extractionConfigDialog = page
      .getByRole('dialog')
      .filter({ hasText: /extract/i })
      .last()
    await extractionConfigDialog
      .getByRole('button', { name: /^(extract|start|run)( claims)?$/i })
      .last()
      .click()

    // Poll the canonical claims endpoint for >=1 row. Polling here
    // (rather than waiting on a UI badge) makes the assertion
    // resilient to the editor's debounced refetch; the canonical
    // store is the server view.
    await expect(async () => {
      // Resolve the summary id first; it's the (videoId,personaId)
      // primary key on VideoSummary.
      const summariesRes = await page.request.get(
        `/api/videos/${testVideo.id}/summaries`,
      )
      expect(summariesRes.status()).toBe(200)
      const list = (await summariesRes.json()) as VideoSummaryListItem[]
      const own = list.find((s) => s.personaId === createdPersona.id)
      expect(own, 'summary must exist before claims can be checked').toBeTruthy()
      const claimsRes = await page.request.get(
        `/api/summaries/${own!.id}/claims`,
      )
      expect(claimsRes.status()).toBe(200)
      const claims = (await claimsRes.json()) as Array<{ id: string; text: string }>
      expect(
        claims.length,
        'real claim extraction must produce at least one claim against the journey summary',
      ).toBeGreaterThanOrEqual(1)
    }).toPass({ timeout: LONG_INFERENCE_WAIT_MS, intervals: [5_000, 15_000, 30_000] })

    // STEP 7: Close the dialog, reload, reopen the workspace, and
    // verify the summary + claim count survive the round-trip.
    const doneSummaryButton = summaryDialog.getByRole('button', { name: /^done$/i })
    await doneSummaryButton.click()
    await expect(summaryDialog).toBeHidden({ timeout: FAST_UI_WAIT_MS })

    await page.reload()
    await openAnnotationWorkspace(page, testVideo.id)

    const summariesAfterReload = await page.request.get(
      `/api/videos/${testVideo.id}/summaries`,
    )
    expect(summariesAfterReload.status()).toBe(200)
    const reloadedList = (await summariesAfterReload.json()) as VideoSummaryListItem[]
    const reloadedOwn = reloadedList.find((s) => s.personaId === createdPersona.id)
    expect(
      reloadedOwn && reloadedOwn.summary.some((g) => g.content.trim().length > 20),
      'summary must persist across reload',
    ).toBe(true)
    const reloadedClaimsRes = await page.request.get(
      `/api/summaries/${reloadedOwn!.id}/claims`,
    )
    expect(reloadedClaimsRes.status()).toBe(200)
    const reloadedClaims = (await reloadedClaimsRes.json()) as unknown[]
    expect(
      reloadedClaims.length,
      'claims must persist across reload',
    ).toBeGreaterThanOrEqual(1)
  })
})
