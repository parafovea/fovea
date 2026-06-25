/**
 * The workspace state seeders: the concrete capabilities a tour step's `driver`
 * runs to put the annotation workspace into the state a step needs before its
 * anchor resolves. Each is registered under a stable id with `registerCapability`
 * and drives the real UI the way a visitor would: it clicks the workspace's own
 * controls (resolved through the anchor registry, with a DOM marker fallback for
 * surfaces an authored step does not anchor) and reads or writes the same Zustand
 * slices the workspace renders from. A capability awaits each surface through the
 * registry rather than a fixed sleep wherever the target is a registered anchor,
 * so it proceeds the instant the surface mounts.
 *
 * Importing this module registers every capability for its side effect; the
 * engine's public surface imports it once so a host that loads the engine has
 * the workspace drivers available without a separate wiring step.
 *
 * Registered capabilities:
 *   - `select-first-video`             open the first video in the browser
 *   - `ensure-annotation-exists`       seed one annotation on the open video
 *   - `open-summary-editor`            open the video summary editor dialog
 *   - `open-claim-editor-with-gloss`   open the claim editor with its gloss field
 *   - `run-detection`                  open the detect dialog and run detection
 *   - `run-transcription`              run transcription and open the transcript dialog
 *   - `open-type-editor`               open an ontology type editor for a category
 *   - `open-world-entity-editor`       open the world entity editor
 *   - `open-world-location-editor`     open the world location editor
 *   - `open-world-event-editor`        open the world event editor
 *   - `open-world-time-editor`         open the world time editor
 *   - `open-entity-collection-builder` open the entity-collection builder
 *   - `open-time-collection-builder`   open the time-collection builder
 *   - `open-import-dialog`             open the data import dialog
 *   - `open-project-video-assignment`  open the project video-assignment surface
 */

import { anchorCatalog } from './anchorCatalog'
import type { AnchorId, AnchorMeta } from './anchorCatalog'
import type { AnchorRegistry } from './anchorRegistry'
import { registerCapability } from './capabilities'
import type { TourCapability, TourCapabilityContext } from './capabilities'

/** How long a seeder waits for a surface to register before giving up. */
const SURFACE_WAIT_MS = 8000
/** Settle between driving a control and reading the surface it opens. */
const SETTLE_MS = 250

/** The element registered for `id` in the anchor registry, or null. */
function findControl(ctx: TourCapabilityContext, id: AnchorId): HTMLElement | null {
  return ctx.getAnchor(id)
}

/**
 * Resolve once an element registers for `id`, waking on the registry's change
 * notification. Resolves with null when nothing registers within `SURFACE_WAIT_MS`.
 */
function waitForSurface(registry: AnchorRegistry, id: AnchorId): Promise<HTMLElement | null> {
  const existing = registry.get(id)
  if (existing) return Promise.resolve(existing)

  return new Promise<HTMLElement | null>((resolve) => {
    let settled = false
    const finish = (element: HTMLElement | null) => {
      if (settled) return
      settled = true
      unsubscribe()
      window.clearTimeout(deadline)
      resolve(element)
    }
    const unsubscribe = registry.subscribe((changedId) => {
      if (changedId === id) finish(registry.get(id))
    })
    const deadline = window.setTimeout(() => finish(null), SURFACE_WAIT_MS)
  })
}

/** Click a workspace control and settle so the surface it opens can mount. */
async function clickControl(ctx: TourCapabilityContext, id: AnchorId): Promise<boolean> {
  const control = findControl(ctx, id)
  if (!control) return false
  control.click()
  await ctx.sleep(SETTLE_MS)
  return true
}

/**
 * Open `target` by clicking the catalog `reachedBy` openers it declares, in
 * order, skipping any opener whose surface is already present and stopping early
 * once the target itself registers. Returns the target's element, or null when
 * it never mounts.
 */
async function reachSurface(
  ctx: TourCapabilityContext,
  target: AnchorId,
): Promise<HTMLElement | null> {
  const already = ctx.getAnchor(target)
  if (already) return already

  const reachedBy = (anchorCatalog[target] as AnchorMeta).reachedBy ?? []
  for (const openerId of reachedBy) {
    if (ctx.getAnchor(target)) break
    if (!(openerId in anchorCatalog)) continue
    await clickControl(ctx, openerId as AnchorId)
  }
  return waitForSurface(ctx.registry, target)
}

/** The active annotation-workspace video id, read from the current route. */
function currentVideoId(): string | null {
  const match = window.location.pathname.match(/\/app\/annotate\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

/** The persona the workspace toolbar currently has selected, if any. */
async function selectedPersonaId(): Promise<string | null> {
  const store = await import('@/store/zustand/annotationUiStore')
  return store.useAnnotationUiStore.getState().selectedPersonaId
}

// ---------------------------------------------------------------------------
// select-first-video
// ---------------------------------------------------------------------------

/**
 * Open the first video in the browser. Navigates to the browser, clicks the
 * first video card, and resolves once the annotation workspace mounts, so a tour
 * that starts on a per-video surface has a concrete `:videoId` to anchor against.
 */
registerCapability('select-first-video', async (ctx) => {
  if (currentVideoId()) return
  ctx.navigate('/app')
  const card = await waitForSurface(ctx.registry, 'video-browser-card-first')
  if (!card) return
  card.click()
  await waitForSurface(ctx.registry, 'drawing-canvas')
})

// ---------------------------------------------------------------------------
// ensure-annotation-exists
// ---------------------------------------------------------------------------

/**
 * Guarantee the open video has at least one annotation, so steps that anchor the
 * annotation list, the timeline, or a per-annotation surface have a row to land
 * on. Reads the video's annotations and, only when none exist, posts a single
 * one-keyframe type annotation under the selected persona through the same save
 * path the editor uses, then invalidates the cache so the workspace renders it.
 */
registerCapability('ensure-annotation-exists', async () => {
  const videoId = currentVideoId()
  if (!videoId) return

  const { api } = await import('@services/api')
  const existing = await api.getAnnotations(videoId)
  if (existing.length > 0) return

  const personaId = await selectedPersonaId()
  if (!personaId) return

  const { generateId } = await import('@utils/uuid')
  const now = new Date().toISOString()
  await api.saveAnnotation({
    id: generateId(),
    videoId,
    annotationType: 'type',
    personaId,
    typeCategory: 'entity',
    typeId: '',
    boundingBoxSequence: {
      boxes: [{ x: 0.2, y: 0.2, width: 0.2, height: 0.2, frameNumber: 0 }],
      interpolationSegments: [],
      visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
      totalFrames: 1,
      keyframeCount: 1,
      interpolatedFrameCount: 0,
    },
    createdAt: now,
    updatedAt: now,
  })

  const { queryClient } = await import('@/main')
  const { annotationKeys } = await import('@store/queries/useAnnotations')
  await queryClient.invalidateQueries({ queryKey: annotationKeys.video(videoId) })
})

// ---------------------------------------------------------------------------
// open-summary-editor
// ---------------------------------------------------------------------------

/**
 * Open the video summary editor dialog by clicking the workspace's Edit Summary
 * control, and resolve once the editor mounts, so summary and claim steps anchor
 * inside the open dialog.
 */
registerCapability('open-summary-editor', async (ctx) => {
  await reachSurface(ctx, 'video-summary-editor')
})

// ---------------------------------------------------------------------------
// open-claim-editor-with-gloss
// ---------------------------------------------------------------------------

/**
 * Open the claim editor with its gloss field, the surface for authoring a
 * claim's definition. Opens the summary editor, switches to its Claims tab, adds
 * a manual claim, and resolves once the gloss field mounts inside the claim
 * editor dialog.
 */
registerCapability('open-claim-editor-with-gloss', async (ctx) => {
  const editor = await reachSurface(ctx, 'video-summary-editor')
  if (!editor) return
  await clickControl(ctx, 'summary-tab-claims')
  await clickControl(ctx, 'add-manual-claim-button')
  const claimEditor = await waitForSurface(ctx.registry, 'claim-editor')
  if (!claimEditor) return
  await waitForSurface(ctx.registry, 'gloss-editor')
})

// ---------------------------------------------------------------------------
// run-detection
// ---------------------------------------------------------------------------

/**
 * Open the detect dialog and run detection so the model-proposed candidates
 * mount. Opens the dialog from the workspace, clicks Run detection, and resolves
 * once the candidates list appears (or the wait elapses, leaving the dialog open
 * for the visitor to run it themselves on a deployment without a model).
 */
registerCapability('run-detection', async (ctx) => {
  await reachSurface(ctx, 'detect-dialog')
  await clickControl(ctx, 'detect-dialog-run-button')
  await waitForSurface(ctx.registry, 'annotation-candidates-list')
})

// ---------------------------------------------------------------------------
// open-type-editor
// ---------------------------------------------------------------------------

/** The ontology tab index and editor anchor for each authorable type category. */
const TYPE_EDITOR_BY_CATEGORY: Record<string, { tabIndex: number; editor: AnchorId }> = {
  entity: { tabIndex: 0, editor: 'entity-type-editor' },
  role: { tabIndex: 1, editor: 'role-type-editor' },
  event: { tabIndex: 2, editor: 'event-type-editor' },
  relation: { tabIndex: 3, editor: 'relation-type-editor' },
}

/**
 * Open an ontology type editor for the `category` param (entity, role, event, or
 * relation, defaulting to entity). Navigates to the ontology workspace, selects
 * a persona and the category's tab through the workspace's own state so the type
 * list mounts, clicks Add type, and resolves once that category's editor dialog
 * appears.
 */
registerCapability('open-type-editor', async (ctx, params) => {
  const category = typeof params?.category === 'string' ? params.category : 'entity'
  const target = TYPE_EDITOR_BY_CATEGORY[category] ?? TYPE_EDITOR_BY_CATEGORY.entity

  ctx.navigate('/app/ontology')

  const store = await import('@/store/zustand/annotationUiStore')
  const state = store.useAnnotationUiStore.getState()
  if (!state.ontologySelectedPersonaId) {
    const persona = (await selectedPersonaId()) ?? (await firstPersonaId())
    if (persona) state.setOntologySelectedPersonaId(persona)
  }
  state.setOntologyTabIndex(target.tabIndex)

  await waitForSurface(ctx.registry, 'ontology-workspace-tabs')
  await clickControl(ctx, 'ontology-add-type-button')
  await waitForSurface(ctx.registry, target.editor)
})

/** The first persona id the deployment exposes, for picking a default. */
async function firstPersonaId(): Promise<string | null> {
  try {
    const res = await fetch('/api/personas', { credentials: 'include' })
    if (!res.ok) return null
    const personas = (await res.json()) as Array<{ id: string }>
    return personas[0]?.id ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// world-object editors
// ---------------------------------------------------------------------------

/**
 * Build a capability that opens a world-object editor on the objects workspace.
 * It navigates to the objects route, selects the editor's tab so that tab's add
 * control mounts, clicks the add control, and resolves once the editor's first
 * field registers. The objects workspace keeps its active tab in local state, so
 * the tab is selected by clicking its control rather than writing a store.
 */
function worldEditorOpener(tab: AnchorId, add: AnchorId, target: AnchorId): TourCapability {
  return async (ctx) => {
    ctx.navigate('/app/objects')
    await waitForSurface(ctx.registry, 'world-panel-tabs')
    if (ctx.getAnchor(target)) return
    await clickControl(ctx, tab)
    await waitForSurface(ctx.registry, add)
    await clickControl(ctx, add)
    await waitForSurface(ctx.registry, target)
  }
}

registerCapability(
  'open-world-entity-editor',
  worldEditorOpener('world-tab-entities', 'world-add-object-button', 'entity-name-input'),
)
registerCapability(
  'open-world-location-editor',
  worldEditorOpener('world-tab-locations', 'world-add-object-button', 'location-name-input'),
)
registerCapability(
  'open-world-event-editor',
  worldEditorOpener('world-tab-events', 'world-add-object-button', 'event-name-input'),
)
registerCapability(
  'open-world-time-editor',
  worldEditorOpener('world-tab-times', 'world-add-object-button', 'time-label-input'),
)
registerCapability(
  'open-entity-collection-builder',
  worldEditorOpener('world-tab-collections', 'world-add-entity-collection-button', 'collection-builder'),
)
registerCapability(
  'open-time-collection-builder',
  worldEditorOpener('world-tab-collections', 'world-add-time-collection-button', 'time-collection-builder'),
)

// ---------------------------------------------------------------------------
// open-import-dialog
// ---------------------------------------------------------------------------

/**
 * Open the data import dialog from the app header, so import steps anchor inside
 * the open dialog.
 */
registerCapability('open-import-dialog', async (ctx) => {
  await reachSurface(ctx, 'import-dialog')
})

// ---------------------------------------------------------------------------
// open-project-video-assignment
// ---------------------------------------------------------------------------

/**
 * Open the project video-assignment surface. Navigates to the admin route,
 * selects its Video Access tab, and resolves once the assignment surface mounts.
 */
registerCapability('open-project-video-assignment', async (ctx) => {
  ctx.navigate('/app/admin')
  await waitForSurface(ctx.registry, 'admin-tab-video-access')
  await clickControl(ctx, 'admin-tab-video-access')
  await waitForSurface(ctx.registry, 'project-video-assignment')
})

// ---------------------------------------------------------------------------
// run-transcription
// ---------------------------------------------------------------------------

/**
 * Run transcription from the workspace toolbar and open the transcript dialog, so
 * transcript steps anchor inside it. On a deployment without a model service the
 * transcribe control is inert and the dialog stays closed, leaving the surface
 * for the visitor to run themselves.
 */
registerCapability('run-transcription', async (ctx) => {
  await reachSurface(ctx, 'transcript-dialog')
})
