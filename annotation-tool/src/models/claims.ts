import type { GlossItem } from './gloss'

/**
 * @description Types of claim sources.
 * Identifies who or what is making a claim.
 */
export type ClaimerType =
  /** Single entity from world state making the claim */
  | 'entity'
  /** Entity type from ontology (generic claimer) */
  | 'entity_type'
  /** Video creator explicitly asserts this claim */
  | 'author'
  /** Mix of text, types, and objects */
  | 'mixed'

/**
 * @description Strategies for extracting claims from summaries.
 * Determines how claims are identified and structured.
 */
export type ExtractionStrategy =
  /** One claim per sentence, decompose into subclaims */
  | 'sentence-based'
  /** Extract claims from semantic chunks */
  | 'semantic-units'
  /** Top-down hierarchical decomposition */
  | 'hierarchical'
  /** User-created claim (not auto-extracted) */
  | 'manual'

/**
 * @interface ClaimSpan
 * @description Span within claim text for discontiguous selections.
 * Used to highlight specific portions of claim text.
 */
export interface ClaimSpan {
  /** Starting character position (0-indexed) */
  charStart: number
  /** Ending character position (exclusive) */
  charEnd: number
}

/**
 * @interface ClaimTextSpan
 * @description Text span with optional sentence index.
 * Extends ClaimSpan with sentence-level information.
 */
export interface ClaimTextSpan extends ClaimSpan {
  /** Index of the sentence this span belongs to */
  sentenceIndex?: number
}

/**
 * @interface Claim
 * @description An atomic factual statement extracted from a summary.
 * Can be hierarchically decomposed into subclaims.
 *
 * @remarks
 * Claims are the fundamental unit of information extraction. They represent
 * statements that can be verified, attributed to a source, and related to
 * other claims. Claims support rich text with references to ontology types
 * and world objects using # @ ^ $ notation.
 *
 * @example
 * ```typescript
 * const claim: Claim = {
 *   id: 'claim-123',
 *   summaryId: 'summary-456',
 *   summaryType: 'video',
 *   text: 'The speaker discusses climate change.',
 *   gloss: [
 *     { type: 'text', content: 'The speaker discusses ' },
 *     { type: 'typeRef', content: 'climate change', refType: 'event' }
 *   ],
 *   claimerType: 'author',
 *   confidence: 0.9,
 *   extractionStrategy: 'sentence-based',
 *   createdAt: '2024-01-01T00:00:00Z',
 *   updatedAt: '2024-01-01T00:00:00Z'
 * };
 * ```
 */
export interface Claim {
  /** Unique identifier for the claim */
  id: string
  /** ID of the summary this claim was extracted from */
  summaryId: string
  /** Type of summary (video or collection) */
  summaryType: 'video' | 'collection'

  /** Plain text content of the claim */
  text: string
  /** Rich text content with optional references */
  gloss: GlossItem[]

  /** ID of parent claim for hierarchical decomposition */
  parentClaimId?: string
  /** Child claims (subclaims) */
  subclaims?: Claim[]

  /** Text spans mapping claim to source text (discontiguous) */
  textSpans?: ClaimTextSpan[]

  /** Type of entity making this claim */
  claimerType?: ClaimerType | null
  /** Rich text identifying who is making the claim */
  claimerGloss?: GlossItem[]
  /** How the claimer relates to the claim content */
  claimRelation?: GlossItem[]

  /** Event during which this claim was made */
  claimEventId?: string
  /** Time when this claim was made */
  claimTimeId?: string
  /** Location where this claim was made */
  claimLocationId?: string

  /** Confidence score for this claim (0-1) */
  confidence?: number
  /** Model used to extract this claim */
  modelUsed?: string
  /** Strategy used for extraction */
  extractionStrategy?: ExtractionStrategy

  /** Modality metadata - indicates what sources support the claim */
  /** Array of "speech" and/or "non-speech" - claim is based at least in part on audio */
  audio?: ('speech' | 'non-speech')[] | null
  /** Array of "text" and/or "non-text" - claim is based at least in part on non-audio video information */
  video?: ('text' | 'non-text')[] | null
  /** Array of "text" (caption metadata) and/or "non-text" (other metadata like location from .info.json) */
  metadata?: ('text' | 'non-text')[] | null
  /** Optional comment about this claim */
  comment?: string | null

  /** Relations where this claim is the source */
  sourceClaimRelations?: ClaimRelation[]
  /** Relations where this claim is the target */
  targetClaimRelations?: ClaimRelation[]

  /** ID of user who created this claim */
  createdBy?: string
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
}

/**
 * @interface ClaimRelation
 * @description Relation between claims or claim spans.
 * Represents how claims relate to each other (e.g., supports, contradicts).
 */
export interface ClaimRelation {
  /** Unique identifier for this relation */
  id: string
  /** ID of the source claim */
  sourceClaimId: string
  /** ID of the target claim */
  targetClaimId: string
  /** ID of the relation type from ontology */
  relationTypeId: string

  /** Specific spans in source claim involved in relation */
  sourceSpans?: ClaimSpan[]
  /** Specific spans in target claim involved in relation */
  targetSpans?: ClaimSpan[]

  /** Confidence score for this relation (0-1) */
  confidence?: number
  /** User notes about this relation */
  notes?: string
  /** ID of user who created this relation */
  createdBy?: string
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
}

/**
 * @interface ClaimExtractionConfig
 * @description Configuration for automated claim extraction.
 * Controls what sources to use, extraction strategy, and post-processing.
 */
export interface ClaimExtractionConfig {
  /**
   * Input sources for extraction.
   */
  inputSources: {
    /** Include the summary text as input */
    includeSummaryText: boolean
    /** Include annotation data as context */
    includeAnnotations: boolean
    /** Include ontology definitions as context */
    includeOntology: boolean
    /** How much ontology detail to include */
    ontologyDepth: 'names-only' | 'names-and-glosses' | 'full-definitions'
  }

  /** Strategy for identifying and structuring claims */
  extractionStrategy: ExtractionStrategy
  /** Maximum claims to extract per summary (default: 50) */
  maxClaimsPerSummary?: number
  /** Maximum subclaim nesting depth (default: 3) */
  maxSubclaimDepth?: number
  /** Minimum confidence threshold (default: 0.5) */
  minConfidence?: number

  /** Specific LLM model ID to use */
  modelId?: string

  /** Remove duplicate claims (default: true) */
  deduplicateClaims?: boolean
  /** Merge highly similar claims (default: false) */
  mergeSimilarClaims?: boolean
}

/**
 * @interface ClaimStructure
 * @description Denormalized claim structure stored in JSON field.
 * Contains all claims with metadata about the extraction.
 */
export interface ClaimStructure {
  /** Schema version (e.g., "1.0") */
  version: string
  /** Root claims with nested subclaims */
  claims: Claim[]
  /** Metadata about the extraction */
  metadata: {
    /** ISO 8601 timestamp of extraction */
    extractedAt: string
    /** Model used for extraction */
    modelUsed: string
    /** Configuration used for extraction */
    config: ClaimExtractionConfig
    /** Total number of root claims */
    totalClaims: number
    /** Total number of subclaims (all levels) */
    totalSubclaims: number
    /** Maximum nesting depth reached */
    maxDepth: number
  }
}

/**
 * @interface VideoSummaryWithClaims
 * @description VideoSummary extended with extracted claims.
 * Combines summary content with claim extraction results.
 */
export interface VideoSummaryWithClaims {
  /** Unique identifier for the summary */
  id: string
  /** ID of the video being summarized */
  videoId: string
  /** ID of the persona who wrote this summary */
  personaId: string
  /** Rich text summary with optional references */
  summary: GlossItem[]
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
  /** ID of the user who created this summary */
  createdBy?: string
  /** Extracted claims (denormalized) */
  claims?: Claim[]
  /** Full claim structure with metadata */
  claimsJson?: ClaimStructure
  /** Version of claim extraction schema */
  claimsVersion?: string
  /** When claims were extracted */
  claimsExtractedAt?: string
}

/**
 * @interface ExtractClaimsRequest
 * @description Request to extract claims from a summary.
 */
export interface ExtractClaimsRequest {
  /** ID of the summary to extract from */
  summaryId: string
  /** Type of summary (video or collection) */
  summaryType: 'video' | 'collection'
  /** Extraction configuration */
  config: ClaimExtractionConfig
}

/**
 * @interface ExtractClaimsResponse
 * @description Response from claim extraction request.
 * Returns job information for async processing.
 */
export interface ExtractClaimsResponse {
  /** Unique job identifier */
  jobId: string
  /** Current job status */
  status: 'queued' | 'processing' | 'completed' | 'failed'
  /** ID of the summary being processed */
  summaryId: string
  /** Type of summary being processed */
  summaryType: string
}

/**
 * @interface ClaimExtractionJobStatus
 * @description Status of a claim extraction job.
 * Used for polling job progress.
 */
export interface ClaimExtractionJobStatus {
  /** Unique job identifier */
  jobId: string
  /** Current job status */
  status: 'queued' | 'processing' | 'completed' | 'failed'
  /** Progress percentage (0-100) */
  progress?: number
  /** Extraction result (when completed) */
  result?: ClaimStructure
  /** Error message (when failed) */
  error?: string
}

/**
 * @interface CreateClaimRequest
 * @description Request to create a claim manually.
 */
export interface CreateClaimRequest {
  /** ID of the summary this claim belongs to */
  summaryId: string
  /** Type of summary */
  summaryType: 'video' | 'collection'
  /** Plain text content of the claim */
  text: string
  /** Rich text content with references */
  gloss?: GlossItem[]
  /** Parent claim ID for hierarchical structure */
  parentClaimId?: string
  /** Text spans in source summary */
  textSpans?: ClaimTextSpan[]
  /** Type of claimer */
  claimerType?: ClaimerType | null
  /** Rich text claimer identification */
  claimerGloss?: GlossItem[]
  /** How claimer relates to claim */
  claimRelation?: GlossItem[]
  /** Associated event ID */
  claimEventId?: string
  /** Associated time ID */
  claimTimeId?: string
  /** Associated location ID */
  claimLocationId?: string
  /** Confidence score */
  confidence?: number
  /** Modality metadata */
  audio?: ('speech' | 'non-speech')[] | null
  video?: ('text' | 'non-text')[] | null
  metadata?: ('text' | 'non-text')[] | null
  /** Optional comment about this claim */
  comment?: string | null
}

/**
 * @interface UpdateClaimRequest
 * @description Request to update an existing claim.
 * All fields are optional - only provided fields are updated.
 */
export interface UpdateClaimRequest {
  /** Updated plain text content */
  text?: string
  /** Updated rich text content */
  gloss?: GlossItem[]
  /** Updated text spans */
  textSpans?: ClaimTextSpan[]
  /** Updated claimer type */
  claimerType?: ClaimerType | null
  /** Updated claimer gloss */
  claimerGloss?: GlossItem[]
  /** Updated claim relation */
  claimRelation?: GlossItem[]
  /** Updated event ID */
  claimEventId?: string
  /** Updated time ID */
  claimTimeId?: string
  /** Updated location ID */
  claimLocationId?: string
  /** Updated confidence score */
  confidence?: number
  /** Updated modality metadata */
  audio?: ('speech' | 'non-speech')[] | null
  video?: ('text' | 'non-text')[] | null
  metadata?: ('text' | 'non-text')[] | null
  /** Updated comment */
  comment?: string | null
}
