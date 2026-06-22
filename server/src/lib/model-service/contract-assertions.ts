/**
 * Compile-time compatibility assertions between the model-service contract
 * (the producer) and the server's hand-written expectations (the consumer).
 *
 * The model-service owns the request/response shapes it produces. Those shapes
 * are emitted as an OpenAPI 3.1 document (`model-service/openapi.json`) and
 * turned into the generated `./contract.ts` types. This module asserts, at
 * `tsc` time, that the generated producer types still satisfy the shapes the
 * server reads and sends. If the model-service drops, renames, or retypes a
 * field the server depends on, regenerating the contract makes one of the
 * assertions below fail with an error naming the offending field.
 *
 * Nothing here runs at runtime: every binding is a `type` or a `never`-typed
 * `const` that exists only so the compiler evaluates the constraint. The file
 * has no runtime side effects and is excluded from coverage by being free of
 * executable statements.
 *
 * Direction of each assertion
 * ---------------------------
 * - For **responses** (the model-service is the producer, the server the
 *   consumer), every field the server reads must be present on the generated
 *   response type with a compatible value type. A dropped/renamed/retyped
 *   field is a breaking change for the server.
 * - For **requests** (the server is the producer, the model-service the
 *   consumer), every field the model-service requires must be one the server
 *   sends. A newly-required request field the server does not send is a
 *   breaking change.
 *
 * Optionality spelling (`T | null` from a Pydantic `T | None` default vs `T?`
 * in a hand-written interface) is deliberately treated as compatible: both mean
 * "this field may be absent/empty". The assertions still fail on a genuinely
 * missing key, a renamed key, or an incompatible base type.
 */

import type { components } from './contract.js'
import type {
  ModelClaimExtractionResponse,
  ModelSynthesisResponse,
  ModelSummarizeResponse,
  ModelSummarizeRequest,
} from '../../queues/setup.js'

type Schemas = components['schemas']

/* -------------------------------------------------------------------------- */
/* Type utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Strip `null` and `undefined` from a type so optionality spelling does not
 * affect the base-type comparison. `T | null` (Pydantic optional) and `T?`
 * (hand-written optional) both reduce to `T`.
 */
type Defined<T> = T extends null | undefined ? never : T

/** True when `T` is a plain object type (not an array, primitive, or function). */
type IsRecord<T> = T extends readonly unknown[]
  ? false
  : T extends object
    ? T extends (...args: never[]) => unknown
      ? false
      : true
    : false

/** The keys of `T` that are required (cannot be omitted). */
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K
}[keyof T]

/**
 * Recursive, null/undefined-tolerant base-type compatibility between a single
 * producer field and the consumer field it must satisfy. Resolves to `true`
 * when the producer value can stand in for the consumer value; `false`
 * otherwise. Recurses through objects and array element types so a renamed or
 * retyped nested field is still caught, while optionality spelling differences
 * (`T | null` vs `T?`) are ignored.
 */
type FieldCompatible<Producer, Consumer> =
  Defined<Consumer> extends infer C
    ? Defined<Producer> extends infer P
      ? // Arrays: compare element types recursively.
        C extends readonly (infer CElement)[]
        ? P extends readonly (infer PElement)[]
          ? FieldCompatible<PElement, CElement>
          : false
        : // Records: every consumer key must be compatible on the producer.
          IsRecord<C> extends true
          ? IsRecord<P> extends true
            ? Compatible<P, C>
            : false
          : // Leaves: accept when either direction is assignable (tolerant of
            // widened/narrowed primitive unions such as `string` vs a literal
            // union).
            P extends C
            ? true
            : C extends P
              ? true
              : false
      : never
    : never

/**
 * The set of keys the consumer requires that the producer either omits or
 * provides with an incompatible value type. Only the consumer's REQUIRED keys
 * are enforced: a field the consumer treats as optional may be absent on the
 * producer without being a violation. An empty `never` means the producer
 * satisfies the consumer.
 */
type IncompatibleKeys<Producer, Consumer> = {
  [K in RequiredKeys<Consumer>]: K extends keyof Producer
    ? FieldCompatible<Producer[K], Consumer[K]> extends true
      ? never
      : K
    : K
}[RequiredKeys<Consumer>]

/** True when the producer satisfies every required key of the consumer. */
type Compatible<Producer, Consumer> =
  IncompatibleKeys<Producer, Consumer> extends never ? true : false

/**
 * Assert that `Producer` satisfies `Consumer`: every required field the
 * consumer reads is present on the producer with a compatible value type. When
 * a field is dropped, renamed, or retyped, `IncompatibleKeys` is non-`never`,
 * so this type is forced to a branded error object whose `offendingKeys`
 * surfaces the field name in the `tsc` diagnostic.
 */
type AssertSatisfies<Producer, Consumer> =
  IncompatibleKeys<Producer, Consumer> extends never
    ? true
    : {
        ContractDriftError: 'Producer is missing or retyped a field the consumer depends on'
        offendingKeys: IncompatibleKeys<Producer, Consumer>
      }

/**
 * Anchor for an `AssertSatisfies` result. A satisfied assertion resolves to
 * `true` and assigns cleanly; a violated one resolves to the error object and
 * fails to assign `true`, producing a compile error.
 */
const assertCompatible = <T extends true>(): T => true as T

/* -------------------------------------------------------------------------- */
/* Server-side wire expectations not already declared as interfaces           */
/*                                                                            */
/* Detection and ontology are consumed at the route layer after a snake -> */
/* camel rename, so the server has no snake_case interface for them. These   */
/* mirror exactly the snake_case wire fields the server reads/sends, so they  */
/* line up with the generated snake_case contract with no casing transform.  */
/* -------------------------------------------------------------------------- */

/** Snake_case request body the server POSTs to `/api/detection/detect`. */
interface DetectionWireRequest {
  video_id: string
  video_path: string
  query: string
  confidence_threshold: number
  frame_numbers: number[]
  enable_tracking: boolean
}

/** Snake_case detection response the server reads before camelcasing. */
interface DetectionWireResponse {
  id: string
  video_id: string
  query: string
  frames: Array<{
    frame_number: number
    timestamp: number
    detections: Array<{
      label: string
      bounding_box: { x: number; y: number; width: number; height: number }
      confidence: number
      track_id: string | null
    }>
  }>
  total_detections: number
  processing_time: number
}

/** Snake_case request body the server POSTs to `/api/ontology/augment`. */
interface OntologyAugmentWireRequest {
  persona_id: string
  domain: string
  existing_types: string[]
  target_category: string
  max_suggestions: number
}

/** Snake_case ontology response the server reads before camelcasing. */
interface OntologyAugmentWireResponse {
  id: string
  persona_id: string
  target_category: string
  suggestions: Array<{
    name: string
    description: string
    parent: string | null
    confidence: number
    examples: string[]
  }>
  reasoning: string
}

/**
 * Snake_case synthesis request body the server builds (camelCase then
 * `snakecaseKeys`) and POSTs to `/api/synthesize-summary`. Only the fields the
 * server always sends are asserted as required.
 */
interface SynthesisWireRequest {
  summary_id: string
  claim_sources: Array<{
    source_id: string
    source_type: string
    claims: Array<Record<string, unknown>>
  }>
  synthesis_strategy: string
  max_length: number
  include_conflicts: boolean
  include_citations: boolean
}

/**
 * Snake_case claim-extraction request body the server builds inline and POSTs
 * to `/api/extract-claims`. Only the fields the server always sends are
 * asserted as required.
 */
interface ClaimExtractionWireRequest {
  summary_id: string
  summary_text: string
  extraction_strategy: string
  max_claims: number
  min_confidence: number
}

/* -------------------------------------------------------------------------- */
/* Response assertions: generated producer type satisfies the server's        */
/* consumer expectation.                                                      */
/* -------------------------------------------------------------------------- */

const _detectionResponse = assertCompatible<
  AssertSatisfies<Schemas['DetectionResponse'], DetectionWireResponse>
>()

const _ontologyAugmentResponse = assertCompatible<
  AssertSatisfies<Schemas['AugmentResponse'], OntologyAugmentWireResponse>
>()

const _claimExtractionResponse = assertCompatible<
  AssertSatisfies<Schemas['ClaimExtractionResponse'], ModelClaimExtractionResponse>
>()

const _synthesisResponse = assertCompatible<
  AssertSatisfies<Schemas['SummarySynthesisResponse'], ModelSynthesisResponse>
>()

const _summarizeResponse = assertCompatible<
  AssertSatisfies<Schemas['SummarizeResponse'], ModelSummarizeResponse>
>()

/* -------------------------------------------------------------------------- */
/* Request assertions: the server's producer body satisfies the generated     */
/* model-service consumer expectation (a newly-required model-service field    */
/* the server does not send is caught).                                       */
/* -------------------------------------------------------------------------- */

const _detectionRequest = assertCompatible<
  AssertSatisfies<DetectionWireRequest, Schemas['DetectionRequest']>
>()

const _ontologyAugmentRequest = assertCompatible<
  AssertSatisfies<OntologyAugmentWireRequest, Schemas['AugmentRequest']>
>()

const _claimExtractionRequest = assertCompatible<
  AssertSatisfies<ClaimExtractionWireRequest, Schemas['ClaimExtractionRequest']>
>()

const _synthesisRequest = assertCompatible<
  AssertSatisfies<SynthesisWireRequest, Schemas['SummarySynthesisRequest']>
>()

const _summarizeRequest = assertCompatible<
  AssertSatisfies<ModelSummarizeRequest, Schemas['SummarizeRequest']>
>()

/* The bindings above exist only to force the compiler to evaluate each
 * assertion. Re-export them as a tuple so `noUnusedLocals` does not flag them
 * and so importers can `import './contract-assertions.js'` for the side-effect
 * of type-checking without a lint complaint. */
export const modelServiceContractAssertions = [
  _detectionResponse,
  _ontologyAugmentResponse,
  _claimExtractionResponse,
  _synthesisResponse,
  _summarizeResponse,
  _detectionRequest,
  _ontologyAugmentRequest,
  _claimExtractionRequest,
  _synthesisRequest,
  _summarizeRequest,
] as const
