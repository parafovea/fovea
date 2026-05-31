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

export interface TourWikidataAugmentationContent {
  personaName: string
  personaRole: string
  /** Search term the visitor types into the Wikidata search box. */
  searchTerm: string
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
  collaboration: TourCollaborationContent
  importExport: TourImportExportContent
}
