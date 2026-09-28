/**
 * Per-tour content slots a deployment can override to retheme the
 * built-in tour scripts to its own domain. The default bundle that
 * ships with Fovea (`microventContent` in ./microvent.ts) is drawn
 * from a real annotation project. news-incident clips with
 * personas like "Automated"/Analyst and "LoanDepot Park Guest
 * Services Usher", and entity types like "gunshot", "wildfire",
 * "Phillies fan Karen".
 *
 * An admin tailoring tours for their own users supplies a different
 * bundle of the same shape and passes it as the `contentBundle` prop
 * on TourProvider. every tour narration, type-name suggestion, and
 * example string updates without touching the engine or the step
 * anchors. The tour TESTS likewise read from the same bundle so a
 * deployment-specific tour suite verifies its own content.
 *
 * Each slot's `personaName` / `personaRole` are the suggested defaults
 * the booth visitor sees + the tour spec creates as the testing
 * prerequisite. Type / event / role / relation names + glosses are
 * what the visitor builds during the tour. Concrete-instance fields
 * (world-layer entity names, summary text, claim text) anchor the
 * tour's running example to a specific clip or incident.
 */

export interface TourTypeSlot {
  /** Short kebab- or single-word name; visitor types this into the editor. */
  name: string
  /** Human-readable definition that lands in the gloss field. */
  gloss: string
  /** Optional Wikidata Q-identifier (e.g. 'Q1758' for baseball game). When
   *  set the seeded type carries the grounding and the visitor can see it
   *  surfaced as a chip in the editor. */
  wikidataId?: string
}

export interface TourFirstAnnotationContent {
  personaName: string
  personaRole: string
  /** Entity type the visitor picks for their first bounding box. */
  entityType: TourTypeSlot
  /**
   * Filename of a video in the deployment's videos/ directory (or
   * STORAGE_PATH) that the booth visitor + the test land on for their
   * first annotation. Pick a clip where the entityType is plainly
   * visible. the booth narrative leans on the visitor immediately
   * seeing what to box. The loader converts this to Fovea's
   * md5(filename)[0:16] videoId at boot.
   */
  videoId: string
}

export interface TourOntologyAuthoringContent {
  personaName: string
  personaRole: string
  /** Entity type the visitor creates at step 2 + glosses at step 3. */
  entityType: TourTypeSlot
  /** Event type at step 4. */
  eventType: TourTypeSlot
  /** Role at step 5. */
  roleType: TourTypeSlot
  /** Relation type at step 6. */
  relationType: TourTypeSlot
}

/**
 * One almost-there ontology suggestion the mocked AI augmenter
 * returns in Tour 3. The whole point of the tour is the EDIT delta,
 * so admins supply suggestions that look plausible but each need a
 * specific edit to match the persona's real ontology:
 *   • genuinely useful but with the wrong name or description
 *   • thematically related but too broad/narrow
 *   • plausible distractor the analyst rejects
 */
export interface TourMockOntologySuggestion {
  name: string
  /** Closest parent type by name, or null when standalone. */
  parent: string | null
  description: string
  /** Two or three examples the suggestion would match. */
  examples: string[]
  /** Model confidence; the augmenter UI sorts/colours by this. */
  confidence: number
}

export interface TourWikidataAugmentationContent {
  personaName: string
  personaRole: string
  /** Search term the visitor types into the Wikidata search box. */
  searchTerm: string
  /**
   * Almost-there suggestions the mocked AI ontology augmenter returns.
   * The first suggestion is the one the visitor accepts (and renames /
   * re-glosses to match their existing ontology); the rest illustrate
   * the kinds of distractors a real model emits that an analyst
   * rejects. Provide 4 to 6 entries for a natural-feeling list.
   */
  mockOntologyAugmentSuggestions: TourMockOntologySuggestion[]
  /** Plain-English explanation the augmenter exposes under "reasoning". */
  mockOntologyAugmentReasoning: string
}

export interface TourEventsRolesClaimsContent {
  personaName: string
  personaRole: string
  /** Entity type assigned to the first bounding box. */
  firstActor: TourTypeSlot
  /** Entity type assigned to the second bounding box. */
  secondActor: TourTypeSlot
  /** Event type the visitor creates to bind the two actors. */
  eventType: TourTypeSlot
  /** Role on the first actor in the event (e.g. 'grabber'). */
  firstRole: TourTypeSlot
  /** Role on the second actor (e.g. 'prior-holder'). */
  secondRole: TourTypeSlot
  /** Free-text claim sentence the derivation step illustrates. */
  derivedClaimText: string
  /**
   * Specific videoId the booth visitor lands on. Must depict the
   * event from `eventType` happening between actors matching
   * `firstActor` and `secondActor`. otherwise the narration's
   * instructions ("Box the X grabbing the ball") don't map to
   * anything visible on screen.
   */
  videoId: string
}

export interface TourWorldLayerContent {
  personaName: string
  personaRole: string
  /** Named world entity created at step 2 (e.g. 'LoanDepot Park'). */
  entityName: string
  /** Type of that entity (e.g. 'Stadium'). created on the fly. */
  entityType: TourTypeSlot
  /** Coordinates for the location pin at step 3. */
  locationLatitude: number
  locationLongitude: number
  locationName: string
  /** Time collection grouping label at step 5. */
  timeCollectionName: string
  /** Entity collection grouping label at step 6. */
  entityCollectionName: string
  /**
   * Specific videoId of a clip visibly depicting the entity being
   * modeled (e.g. a wide shot of the stadium). Step 7's
   * "annotations link to world instances" demo opens in this video's
   * annotation workspace so the visitor can see the connection.
   */
  videoId: string
}

/** One bounding-box proposal the mocked detector returns. */
export interface TourMockDetectionProposal {
  label: string
  confidence: number
  /** Normalised 0..1 box coordinates. */
  boundingBox: { x: number; y: number; width: number; height: number }
  /**
   * Final entity TYPE the analyst should re-label the box to during
   * the demo (e.g. detector says "fallen shipping container", analyst
   * accepts the box and snaps it to the general type `container`).
   * Use null when the visitor is expected to REJECT this box rather
   * than accept-and-relabel. Detectors only propose boxes for
   * ENTITIES (things in the world); events are time-extent, not
   * spatial, and live elsewhere in the demo.
   *
   * Pick general types a human analyst from the matching domain
   * would carry in their ontology; "person", "ball", "container",
   * "water", "crane"; not ad-hoc descriptive phrases. Pair each
   * with its Wikidata QID via `acceptAsWikidataId` so the booth
   * visitor sees a fully grounded type-pick step at the same time.
   */
  acceptAsLabel: string | null
  /**
   * Wikidata QID for `acceptAsLabel` (e.g. `Q987767` for container,
   * `Q283` for water, `Q178692` for crane). Lets the demo present
   * each suggested type as already linked to its Wikidata entry,
   * mirroring how a real analyst would import a type from the
   * Wikidata-Augmentation flow. Null when `acceptAsLabel` is null
   * or the type does not have a meaningful Wikidata anchor.
   */
  acceptAsWikidataId: string | null
}

/** One tracker keyframe in the demo's 30-frame trajectory. */
export interface TourMockTrackingKeyframe {
  frameNumber: number
  timestamp: number
  boundingBox: { x: number; y: number; width: number; height: number }
  confidence: number
  /**
   * Whether the demo expects the visitor to manually correct this
   * keyframe (because the tracker drifted off the subject). The
   * trajectory editor uses this flag to render the keyframe in red.
   */
  flagged: boolean
}

export interface TourModelInTheLoopContent {
  personaName: string
  personaRole: string
  /**
   * Specific videoId. pick a clip with a clear moving subject the
   * tracker can usefully extend a starting bbox across (e.g. a
   * falling object, a person moving across frame). Static clips are
   * boring demos because the tracker just sits there.
   */
  videoId: string
  /**
   * The natural-language query that gets passed to the open-vocabulary
   * detector when the visitor clicks "Detect Objects" in this tour.
   */
  mockDetectionQuery: string
  /**
   * Almost-there detector output for the keyframe the visitor is on
   * when they click Detect. Include 2 genuine high-confidence boxes
   * the visitor accepts (and may rename via `acceptAsLabel`) plus 1
   * or 2 spurious low-confidence boxes the visitor rejects, so the
   * accept-some/reject-some editing loop has both kinds to practice
   * against.
   */
  mockDetectionProposals: TourMockDetectionProposal[]
  /** Frame number the detection proposals were computed against. */
  mockDetectionFrame: number
  /**
   * Almost-there tracker keyframes the visitor inspects + edits.
   * Convention: the first contiguous run of `flagged: false` is the
   * good prefix the visitor accepts; the tail of `flagged: true`
   * keyframes is where the tracker drifted and the visitor manually
   * re-anchors the box at the first flagged frame.
   */
  mockTrackingKeyframes: TourMockTrackingKeyframe[]
}

/** One diarized transcript segment in the mocked ASR output. */
export interface TourMockTranscriptSegment {
  start: number
  end: number
  text: string
  confidence: number
  /** Speaker label as the mocked diarizer emits it (e.g. SPEAKER_00). */
  speaker: string
  /**
   * Optional intended speaker label for the demo: if the mocked
   * diarizer assigns this segment to the wrong speaker, this is the
   * speaker the visitor should flip the chip to. Use null when the
   * segment's assignment is correct.
   */
  intendedSpeaker: string | null
  /**
   * Optional intended text the visitor should edit the segment to
   * during the inline-edit step. Use null when the recognised text
   * is already correct.
   */
  intendedText: string | null
}

/** One claim atom that a non-atomic mock claim splits into. */
export interface TourMockClaimAtom {
  text: string
  /** Time range in seconds. */
  start: number
  end: number
}

export interface TourSummariesAndClaimsContent {
  personaName: string
  personaRole: string
  /** Summary text the visitor types into the summary editor at step 3. */
  summaryText: string
  /** Sample claim sentence the extraction step lifts from the summary. */
  claimText: string
  /**
   * Specific videoId. must be a clip the `summaryText` is genuinely
   * describing, otherwise the visitor types narration that has
   * nothing to do with what's on the screen.
   */
  videoId: string
  /**
   * Almost-there transcript the mocked ASR + diarization returns. Two
   * speakers, four segments is a comfortable demo length; pick a clip
   * with audible cross-talk so the diarization story has something to
   * show. Use `intendedSpeaker` / `intendedText` to encode the deltas
   * the analyst edits.
   */
  mockTranscript: {
    language: string
    duration: number
    speakers: string[]
    segments: TourMockTranscriptSegment[]
  }
  /**
   * Almost-there VLM summary text the model returns. Compose this by
   * stitching together the eventual atomic claims listed below, then
   * introducing exactly ONE believable factual error the analyst will
   * correct (a wrong locative, a wrong role label, etc.). The
   * narration walks the visitor through the edit step by step.
   */
  mockVlmSummaryText: string
  /**
   * One non-atomic compound claim the mocked claim-extraction model
   * returns. The visitor splits this into the atoms in
   * `mockClaimSplitAtoms`. This is the editing loop the tour is built
   * around.
   */
  mockCompoundClaimText: string
  /** Two to four atomic claims the compound claim splits into. */
  mockClaimSplitAtoms: TourMockClaimAtom[]
}

export interface TourDocumentAnnotationContent {
  personaName: string
  personaRole: string
  /**
   * Fixed UUID for the demo document the tour creates and walks. A client-
   * supplied id makes the create idempotent (re-running the tour reuses the
   * same row) and lets every per-document step route to
   * /app/documents/:documentId without waiting to learn a server-generated id.
   * Must be a valid UUID; the documents endpoint validates the format.
   */
  documentId: string
  /** Title for the demo document, shown on its browser card and in narration. */
  documentTitle: string
  /**
   * Text tokenized into the demo document. Pick a sentence with clear entity
   * spans and a plausible relation between two of them so the span-labeling and
   * relation beats land on something meaningful when the visitor tries them.
   */
  documentText: string
  /** Example ontology type name a visitor labels a span with (narration only). */
  spanTypeName: string
  /** Example relation-type name a visitor draws between two spans (narration only). */
  relationTypeName: string
}

export interface TourCollaborationContent {
  /** Project name the visitor creates at step 1/2. */
  projectName: string
  /** Group name at step 3. */
  groupName: string
}

export interface TourImportExportContent {
  /**
   * Path (relative to the test fixtures dir OR an absolute URL the
   * admin's tour environment knows how to resolve) to an import bundle
   * the visitor uploads at step 1. The default microvent bundle points
   * at the JSONL file shipped with the E2E test fixtures.
   */
  importBundlePath: string
}

/**
 * World-object seed. Materialized into the persona's WorldState at
 * demo-seed time so the gloss-editor's @-popup, the ClaimEditor's
 * time / location pickers, and the world workspace all have non-empty
 * data on first paint. Tour 2's narration references @LoanDepotPark
 * and @2025-09-05; the seed has to contain matching rows or those
 * references resolve to "No objects found".
 */
export interface TourWorldSeedLocation {
  /** Display name shown in pickers and gloss badges. */
  name: string
  /** Wikidata Q-identifier (e.g. 'Q1366085' for LoanDepot Park). */
  wikidataId?: string
  /** Free-text gloss / description. */
  description?: string
  latitude?: number
  longitude?: number
}

export interface TourWorldSeedTime {
  /** ISO 8601 timestamp. */
  timestamp: string
  /** Short human label (e.g. '2025-09-05'). */
  label?: string
}

export interface TourWorldSeedEntity {
  name: string
  wikidataId?: string
  description?: string
}

export interface TourWorldSeed {
  locations?: TourWorldSeedLocation[]
  times?: TourWorldSeedTime[]
  entities?: TourWorldSeedEntity[]
  entityCollections?: { name: string; description?: string }[]
}

/**
 * Aggregate. An admin tailoring tours for their users provides a
 * complete bundle of this shape and passes it as TourProvider's
 * `contentBundle` prop. Partial bundles aren't supported. every
 * tour's content has to be filled in so the booth experience is
 * coherent.
 */
export interface TourContentBundle {
  firstAnnotation: TourFirstAnnotationContent
  ontologyAuthoring: TourOntologyAuthoringContent
  wikidataAugmentation: TourWikidataAugmentationContent
  eventsRolesClaims: TourEventsRolesClaimsContent
  worldLayer: TourWorldLayerContent
  modelInTheLoop: TourModelInTheLoopContent
  summariesAndClaims: TourSummariesAndClaimsContent
  documentAnnotation: TourDocumentAnnotationContent
  collaboration: TourCollaborationContent
  importExport: TourImportExportContent
  /** Optional pre-seeded world objects (locations, times, entities) that
   *  the @-popup, ClaimEditor pickers, and world workspace read on
   *  first paint. Omit to ship an empty world. */
  world?: TourWorldSeed
}
