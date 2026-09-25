/**
 * The tour anchor catalog: the single source of truth for every UI surface a
 * tour step can spotlight, and the published vocabulary an admin authors tours
 * against.
 *
 * `AnchorId` is derived from this object (`keyof typeof anchorCatalog`), so a
 * step's `anchor` is type-checked for first-party tours and validated at load
 * for admin-authored tours. Each entry carries metadata the in-app anchor
 * inspector and the generated anchor-reference doc render for authors.
 */

/** Metadata for one spotlightable surface. */
export interface AnchorMeta {
  /** One-line, author-facing description shown in the inspector and generated doc. */
  readonly description: string
  /**
   * Where the anchor lives: a React Router path (e.g. `/app/annotate/:videoId`)
   * or a coarse area label (e.g. `dialog:import`). Groups the inspector and tells
   * an author which route a step needs.
   */
  readonly surface: string
  /**
   * True when the element only mounts once the workspace enters a sub-state (a
   * dialog opens, detection runs, a row exists). A step targeting a conditional
   * anchor needs a `reachedBy` chain and/or a `driver` to put the workspace in
   * that state.
   */
  readonly conditional?: boolean
  /**
   * Opener anchor id(s) the engine clicks, in order, to mount this anchor (e.g.
   * open the dialog it lives in). Each must itself be a catalog id.
   */
  readonly reachedBy?: readonly string[]
}

/**
 * The catalog. Grouped by surface for readability; the grouping has no runtime
 * meaning. `satisfies` keeps every value typed as `AnchorMeta` while preserving
 * the literal keys for the derived `AnchorId` union.
 */
export const anchorCatalog = {
  // ---- App shell + navigation (always mounted on /app) ----
  'app-shell': { description: 'The main application shell (sidebar + content).', surface: '/app' },
  'app-sidebar': { description: 'The left navigation sidebar.', surface: '/app' },

  // ---- Video browser (/app) ----
  'video-browser-root': { description: 'The video browser grid container.', surface: '/app' },
  'video-browser-card-first': { description: 'The first video card in the grid.', surface: '/app', conditional: true },

  // ---- Annotation workspace (/app/annotate/:videoId) ----
  'video-player-scrubber': { description: 'The video player timeline scrubber.', surface: '/app/annotate/:videoId' },
  'drawing-canvas': { description: 'The bounding-box drawing canvas over the video.', surface: '/app/annotate/:videoId' },
  'type-assignment-picker': { description: 'The toolbar picker for the annotation type.', surface: '/app/annotate/:videoId' },
  'event-annotation-button': { description: 'The Type/Object (event) annotation toggle.', surface: '/app/annotate/:videoId' },
  'role-assignment-panel': { description: 'The role-assignment panel for an event.', surface: '/app/annotate/:videoId', conditional: true },
  'show-timeline-button': { description: 'The button that expands the annotation timeline.', surface: '/app/annotate/:videoId', conditional: true },
  'timeline': { description: 'The annotation timeline (expanded).', surface: '/app/annotate/:videoId', conditional: true, reachedBy: ['show-timeline-button'] },
  'timeline-panel': { description: 'The timeline panel container.', surface: '/app/annotate/:videoId', conditional: true },
  'save-indicator': { description: 'The auto-save status indicator.', surface: '/app/annotate/:videoId' },
  'annotation-list-first': { description: 'The first annotation in the annotation list.', surface: '/app/annotate/:videoId', conditional: true },
  'detect-objects-button': { description: 'The "Detect Objects" model-in-the-loop button.', surface: '/app/annotate/:videoId', conditional: true },
  'annotation-candidates-list': { description: 'The list of model-proposed annotation candidates.', surface: '/app/annotate/:videoId', conditional: true, reachedBy: ['detect-objects-button'] },
  'transcribe-audio-button': { description: 'The "Transcribe Audio" button.', surface: '/app/annotate/:videoId', conditional: true },
  'transcript-dialog': { description: 'The transcript dialog.', surface: '/app/annotate/:videoId', conditional: true, reachedBy: ['transcribe-audio-button'] },
  'edit-summary-button': { description: 'The "Edit Summary" button.', surface: '/app/annotate/:videoId', conditional: true },

  // ---- Video summary + claims (dialogs off the annotation workspace) ----
  'video-summary-editor': { description: 'The video summary editor dialog.', surface: 'dialog:summary', conditional: true, reachedBy: ['edit-summary-button'] },
  'summary-tab-summary': { description: 'The "Summary" tab in the summary editor.', surface: 'dialog:summary', conditional: true },
  'summary-tab-claims': { description: 'The "Claims" tab in the summary editor.', surface: 'dialog:summary', conditional: true },
  'add-manual-claim-button': { description: 'The "Add manual claim" button in the summary editor.', surface: 'dialog:summary', conditional: true, reachedBy: ['summary-tab-claims'] },
  'extract-claims-button': { description: 'The "Extract claims" button.', surface: 'dialog:summary', conditional: true },

  // ---- Gloss editor (claim / type definition authoring) ----
  'gloss-editor': { description: 'The gloss (definition) editor textarea.', surface: 'dialog:gloss', conditional: true },
  'gloss-preview': { description: 'The rendered gloss preview.', surface: 'dialog:gloss', conditional: true },
  'gloss-autocomplete-popup': { description: 'The #/@/^ reference autocomplete popup in the gloss editor.', surface: 'dialog:gloss', conditional: true },

  // ---- Document workspace (/app/documents) ----
  'document-browser': { description: 'The document browser grid container.', surface: '/app/documents' },
  'document-card-first': { description: 'The first document card in the grid.', surface: '/app/documents', conditional: true },

  // ---- Document span annotator (/app/documents/:documentId) ----
  'document-workspace': { description: 'The single-document annotation workspace.', surface: '/app/documents/:documentId' },
  'span-annotator': { description: 'The token span-annotation surface over a document.', surface: '/app/documents/:documentId' },
  'span-label-picker': { description: 'The span label picker that opens on a token selection.', surface: '/app/documents/:documentId', conditional: true },
  'relation-type-picker': { description: 'The relation-type picker for a pending span relation.', surface: '/app/documents/:documentId', conditional: true },
  'relation-arc-overlay': { description: 'The relation-arc overlay drawn over the tokenized text.', surface: '/app/documents/:documentId', conditional: true },
  'relation-side-panel': { description: 'The span-relations side panel.', surface: '/app/documents/:documentId' },

  // ---- Video associated-text span annotation (/app/annotate/:videoId) ----
  'video-text-panel': { description: "The video's associated-text (post text / transcript) span annotator.", surface: '/app/annotate/:videoId', conditional: true },

  // ---- Ontology workspace (/app/ontology) ----
  'ontology-workspace-tabs': { description: 'The ontology workspace tab bar.', surface: '/app/ontology' },
  'ontology-tab-entities': { description: 'The "Entity types" tab.', surface: '/app/ontology' },
  'ontology-tab-events': { description: 'The "Event types" tab.', surface: '/app/ontology' },
  'ontology-tab-roles': { description: 'The "Roles" tab.', surface: '/app/ontology' },
  'ontology-tab-relations': { description: 'The "Relation types" tab.', surface: '/app/ontology' },
  'ontology-add-type-button': { description: 'The "Add type" button on the active ontology tab.', surface: '/app/ontology' },
  'entity-type-editor': { description: 'The entity-type editor dialog.', surface: 'dialog:type-editor', conditional: true, reachedBy: ['ontology-tab-entities', 'ontology-add-type-button'] },
  'event-type-editor': { description: 'The event-type editor dialog.', surface: 'dialog:type-editor', conditional: true, reachedBy: ['ontology-tab-events', 'ontology-add-type-button'] },
  'role-type-editor': { description: 'The role-type editor dialog.', surface: 'dialog:type-editor', conditional: true, reachedBy: ['ontology-tab-roles', 'ontology-add-type-button'] },
  'relation-type-editor': { description: 'The relation-type editor dialog.', surface: 'dialog:type-editor', conditional: true, reachedBy: ['ontology-tab-relations', 'ontology-add-type-button'] },
  'type-editor-mode-manual': { description: 'The "Manual" authoring-mode toggle in the type editor.', surface: 'dialog:type-editor', conditional: true },
  'type-editor-mode-wikidata': { description: 'The "Wikidata" authoring-mode toggle in the type editor.', surface: 'dialog:type-editor', conditional: true },
  'type-editor-mode-copy': { description: 'The "Copy from persona" authoring-mode toggle in the type editor.', surface: 'dialog:type-editor', conditional: true },
  'type-editor-save': { description: 'The save button in the type editor.', surface: 'dialog:type-editor', conditional: true },
  'type-editor-cancel': { description: 'The cancel button in the type editor.', surface: 'dialog:type-editor', conditional: true },

  // ---- Ontology augmentation ----
  'augmenter-search': { description: 'The Wikidata/ontology augmenter search box.', surface: 'dialog:type-editor', conditional: true },
  'augmenter-results': { description: 'The augmenter suggestion results list.', surface: 'dialog:type-editor', conditional: true },
  'augmenter-import-target': { description: 'The import-target selector in the augmenter.', surface: 'dialog:type-editor', conditional: true },

  // ---- World workspace (/app/world/:personaId) ----
  'world-panel-tabs': { description: 'The world workspace tab bar.', surface: '/app/world/:personaId' },
  'world-tab-entities': { description: 'The world "Entities" tab.', surface: '/app/world/:personaId' },
  'world-tab-events': { description: 'The world "Events" tab.', surface: '/app/world/:personaId' },
  'world-tab-locations': { description: 'The world "Locations" tab.', surface: '/app/world/:personaId' },
  'world-tab-times': { description: 'The world "Times" tab.', surface: '/app/world/:personaId' },
  'world-tab-collections': { description: 'The world "Collections" tab.', surface: '/app/world/:personaId' },
  'world-add-object-button': { description: 'The "Add object" button on the active world tab.', surface: '/app/world/:personaId' },
  'world-add-time-collection-button': { description: 'The "Add time collection" button.', surface: '/app/world/:personaId' },
  'world-add-entity-collection-button': { description: 'The "Add entity collection" button.', surface: '/app/world/:personaId' },
  'entity-editor': { description: 'The world entity editor dialog.', surface: 'dialog:world', conditional: true, reachedBy: ['world-tab-entities', 'world-add-object-button'] },
  'event-editor': { description: 'The world event editor dialog.', surface: 'dialog:world', conditional: true, reachedBy: ['world-tab-events', 'world-add-object-button'] },
  'time-editor': { description: 'The world time editor dialog.', surface: 'dialog:world', conditional: true, reachedBy: ['world-tab-times', 'world-add-object-button'] },
  'location-map-picker': { description: 'The location map picker.', surface: 'dialog:world', conditional: true },
  'entity-name-input': { description: 'The name field in the entity editor.', surface: 'dialog:world', conditional: true },
  'event-name-input': { description: 'The name field in the event editor.', surface: 'dialog:world', conditional: true },
  'location-name-input': { description: 'The name field in the location editor.', surface: 'dialog:world', conditional: true },
  'time-label-input': { description: 'The label field in the time editor.', surface: 'dialog:world', conditional: true },
  'collection-builder': { description: 'The entity-collection builder.', surface: 'dialog:world', conditional: true, reachedBy: ['world-tab-collections', 'world-add-entity-collection-button'] },
  'time-collection-builder': { description: 'The time-collection builder.', surface: 'dialog:world', conditional: true, reachedBy: ['world-tab-collections', 'world-add-time-collection-button'] },

  // ---- Claims ----
  'claim-editor': { description: 'The claim editor dialog.', surface: 'dialog:claims', conditional: true },
  'claims-viewer': { description: 'The claims viewer.', surface: 'dialog:claims', conditional: true },
  'claim-relations-viewer': { description: 'The claim-relations viewer.', surface: 'dialog:claims', conditional: true },
  'claim-span-highlighter': { description: 'The claim span highlighter.', surface: 'dialog:claims', conditional: true },
  'claims-extraction-dialog': { description: 'The claims-extraction dialog.', surface: 'dialog:claims', conditional: true },
  'annotation-world-reference': { description: 'The world-object reference badge on an annotation.', surface: '/app/annotate/:videoId', conditional: true },

  // ---- Detection / tracking ----
  'detect-dialog': { description: 'The object-detection dialog.', surface: 'dialog:detect', conditional: true, reachedBy: ['detect-objects-button'] },
  'detect-dialog-run-button': { description: 'The "Run detection" button in the detect dialog.', surface: 'dialog:detect', conditional: true },
  'object-picker-popover': { description: 'The world-object picker popover.', surface: 'dialog:annotate', conditional: true },
  'tracking-results-panel': { description: 'The tracking-results panel.', surface: '/app/annotate/:videoId', conditional: true },
  'temporal-annotator': { description: 'The temporal (event) annotator.', surface: '/app/annotate/:videoId', conditional: true },

  // ---- Audio / transcript ----
  'audio-config-panel': { description: 'The audio configuration panel.', surface: 'dialog:audio', conditional: true },
  'transcript-viewer': { description: 'The transcript viewer.', surface: 'dialog:transcript', conditional: true },

  // ---- Admin panel (/app/admin) ----
  'admin-panel': { description: 'The admin panel.', surface: '/app/admin' },
  'admin-tab-users': { description: 'The admin "Users" tab.', surface: '/app/admin' },
  'admin-tab-groups': { description: 'The admin "Groups" tab.', surface: '/app/admin' },
  'admin-tab-projects': { description: 'The admin "Projects" tab.', surface: '/app/admin' },
  'admin-tab-video-access': { description: 'The admin "Video access" tab.', surface: '/app/admin' },
  'admin-tab-permissions': { description: 'The admin "Permissions" tab.', surface: '/app/admin' },
  'admin-tab-sessions': { description: 'The admin "Sessions" tab.', surface: '/app/admin' },
  'admin-tab-models': { description: 'The admin "Models" tab.', surface: '/app/admin' },
  'admin-tab-system-config': { description: 'The admin "System config" tab.', surface: '/app/admin' },
  'admin-tab-settings': { description: 'The admin "Settings" tab.', surface: '/app/admin' },
  'user-management-page': { description: 'The user-management page.', surface: '/app/admin', reachedBy: ['admin-tab-users'] },
  'permissions-page': { description: 'The permissions page.', surface: '/app/admin', reachedBy: ['admin-tab-permissions'] },
  'session-management-page': { description: 'The session-management page.', surface: '/app/admin', reachedBy: ['admin-tab-sessions'] },
  'model-management-page': { description: 'The model-management page.', surface: '/app/admin', reachedBy: ['admin-tab-models'] },
  'model-memory-validation': { description: 'The model memory-validation surface.', surface: '/app/admin', reachedBy: ['admin-tab-models'] },
  'system-config-panel': { description: 'The system-config panel.', surface: '/app/admin', reachedBy: ['admin-tab-system-config'] },
  'api-keys-page': { description: 'The API-keys management page.', surface: '/app/admin' },
  'persona-preferences-section': { description: 'The persona-preferences section.', surface: '/app/admin' },

  // ---- Collaboration (projects / groups / shared) ----
  'projects-page': { description: 'The projects page.', surface: '/app/projects' },
  'projects-create-button': { description: 'The "Create project" button.', surface: '/app/projects' },
  'project-name-input': { description: 'The project name field.', surface: '/app/projects', conditional: true, reachedBy: ['projects-create-button'] },
  'project-video-assignment': { description: 'The project video-assignment surface.', surface: '/app/admin', conditional: true, reachedBy: ['admin-tab-video-access'] },
  'groups-page': { description: 'The groups page.', surface: '/app/groups' },
  'group-management-page': { description: 'The group-management page.', surface: '/app/admin', reachedBy: ['admin-tab-groups'] },
  'groups-create-button': { description: 'The "Create group" button.', surface: '/app/groups' },
  'group-name-input': { description: 'The group name field.', surface: '/app/groups', conditional: true, reachedBy: ['groups-create-button'] },
  'shared-annotations-page': { description: 'The shared-annotations page.', surface: '/app/shared' },

  // ---- Import / export ----
  'import-trigger': { description: 'The header "Import" button.', surface: '/app' },
  'import-dialog': { description: 'The import dialog.', surface: 'dialog:import', conditional: true, reachedBy: ['import-trigger'] },
  'import-format-spec-trigger': { description: 'The import format-spec accordion trigger.', surface: 'dialog:import', conditional: true },
  'import-result-dialog': { description: 'The import-result dialog.', surface: 'dialog:import', conditional: true },
  'export-trigger': { description: 'The header "Export" button.', surface: '/app' },
  'export-dialog': { description: 'The export dialog.', surface: 'dialog:export', conditional: true, reachedBy: ['export-trigger'] },

  // ---- Misc spotlightable surfaces ----
  'video-summary-card': { description: 'A video summary card.', surface: '/app/annotate/:videoId', conditional: true },
  'quick-actions-track': { description: 'The quick-actions track.', surface: '/app/annotate/:videoId', conditional: true },
  'interpolation-mode-selector': { description: 'The interpolation-mode selector.', surface: 'dialog:annotate', conditional: true },
  'bezier-curve-editor': { description: 'The bezier-curve editor.', surface: 'dialog:annotate', conditional: true },
  'motion-path-overlay': { description: 'The motion-path overlay.', surface: '/app/annotate/:videoId', conditional: true },
} as const satisfies Record<string, AnchorMeta>

/** Every anchor id, derived from the catalog. A tour step's `anchor` is one of these. */
export type AnchorId = keyof typeof anchorCatalog

/** Every known anchor id, as an array. */
export const allAnchorIds = Object.keys(anchorCatalog) as AnchorId[]

/** Type guard: is this string a catalog anchor id? */
export function isAnchorId(value: string): value is AnchorId {
  return value in anchorCatalog
}
