/**
 * @interface Time
 * @description Base interface for temporal references in the annotation system.
 * Supports both instant and interval time types with optional vagueness handling.
 *
 * @remarks
 * Time objects can reference specific video frames, real-world timestamps,
 * or abstract temporal concepts. They support multiple video references
 * (same event captured from different angles) and deictic expressions
 * (relative time references like "yesterday" or "before the event").
 */
export interface Time {
  /** Unique identifier for the time object */
  id: string
  /** Human-readable label for display in the UI */
  label?: string
  /** Whether this represents a single instant or a duration */
  type: 'instant' | 'interval'
  /** Q-identifier from Wikidata (original ID) */
  wikidataId?: string
  /** Local Wikibase ID (only set when using offline Wikibase) */
  wikibaseId?: string
  /** Full URL to Wikidata entry */
  wikidataUrl?: string
  /** Source of the import (wikidata or persona) */
  importedFrom?: 'wikidata' | 'persona'
  /** ISO timestamp when imported */
  importedAt?: string

  /**
   * References to video locations representing this time.
   * Multiple videos can capture the same temporal moment.
   */
  videoReferences?: Array<{
    /** ID of the video */
    videoId: string
    /** Specific frame number (for instants) */
    frameNumber?: number
    /** Frame range [start, end] (for intervals) */
    frameRange?: [number, number]
    /** Time in milliseconds (for instants) */
    milliseconds?: number
    /** Time range in milliseconds (for intervals) */
    millisecondRange?: [number, number]
  }>

  /**
   * Vagueness handling for uncertain temporal references.
   * Supports approximate times, bounded ranges, and fuzzy logic.
   */
  vagueness?: {
    /** Type of vagueness */
    type: 'approximate' | 'bounded' | 'fuzzy'
    /** Human-readable description of the vagueness */
    description?: string
    /** Temporal bounds for bounded vagueness */
    bounds?: {
      /** Earliest possible time (ISO 8601) */
      earliest?: string
      /** Latest possible time (ISO 8601) */
      latest?: string
      /** Most likely time (ISO 8601) */
      typical?: string
    }
    /** Granularity level for this time reference */
    granularity?: 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
  }

  /**
   * Deictic reference configuration for relative time expressions.
   * Handles expressions like "yesterday", "before the meeting", etc.
   */
  deictic?: {
    /** Type of anchor for the deictic reference */
    anchorType: 'annotation_time' | 'video_time' | 'reference_time'
    /** Anchor time (ISO 8601) */
    anchorTime?: string
    /** Natural language expression for the deictic reference */
    expression?: string
  }

  /** Certainty score for this time reference (0-1) */
  certainty?: number
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * @interface TimeInstant
 * @description Represents a single point in time.
 * Extends Time with a specific timestamp.
 */
export interface TimeInstant extends Time {
  /** Discriminator for instant type */
  type: 'instant'
  /** ISO 8601 timestamp for this instant */
  timestamp: string
}

/**
 * @interface TimeInterval
 * @description Represents a duration or period of time.
 * Extends Time with start and end timestamps.
 */
export interface TimeInterval extends Time {
  /** Discriminator for interval type */
  type: 'interval'
  /** ISO 8601 timestamp for the start of the interval */
  startTime?: string
  /** ISO 8601 timestamp for the end of the interval */
  endTime?: string
}

/**
 * @description Recurrence frequency values based on iCalendar RFC 5545.
 */
export type RecurrenceFrequency = 'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY'

/**
 * @description Day of week abbreviations for recurrence rules.
 */
export type DayOfWeek = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

/**
 * @description Habitual frequency descriptors for annotation research.
 * Used to describe how often something typically occurs.
 */
export type HabitualFrequency = 'always' | 'usually' | 'often' | 'sometimes' | 'rarely' | 'never'

/**
 * @interface RecurrenceByDay
 * @description Specifies a day of the week with optional nth occurrence.
 *
 * @example
 * ```typescript
 * // Second Monday of the month
 * const secondMonday: RecurrenceByDay = { day: 'MO', nth: 2 };
 * // Last Friday of the month
 * const lastFriday: RecurrenceByDay = { day: 'FR', nth: -1 };
 * ```
 */
export interface RecurrenceByDay {
  /** Day of the week */
  day: DayOfWeek
  /** Nth occurrence (e.g., 2 for "2nd Monday", -1 for "last Friday") */
  nth?: number
}

/**
 * @interface RecurrenceRule
 * @description Enhanced recurrence pattern based on iCalendar RRULE (RFC 5545).
 * Supports complex recurring patterns with exceptions and modifications.
 *
 * @example
 * ```typescript
 * // Every 2 weeks on Monday and Wednesday, ending after 10 occurrences
 * const rule: RecurrenceRule = {
 *   frequency: 'WEEKLY',
 *   interval: 2,
 *   endCondition: { type: 'count', count: 10 },
 *   byRules: {
 *     byDay: [{ day: 'MO' }, { day: 'WE' }]
 *   }
 * };
 * ```
 */
export interface RecurrenceRule {
  /** Base frequency of recurrence */
  frequency: RecurrenceFrequency
  /** Interval between occurrences (e.g., every 2 weeks) */
  interval?: number

  /**
   * End condition for the recurrence.
   * Can be a count, until date, or never (infinite).
   */
  endCondition?: {
    /** Type of end condition */
    type: 'count' | 'until' | 'never'
    /** Number of occurrences (for 'count' type) */
    count?: number
    /** End date (ISO 8601, for 'until' type) */
    until?: string
  }

  /**
   * BY rules for fine-grained control over recurrence.
   */
  byRules?: {
    /** Days of the week */
    byDay?: RecurrenceByDay[]
    /** Days of the month (1-31, -1 for last day) */
    byMonthDay?: number[]
    /** Months of the year (1-12) */
    byMonth?: number[]
    /** Hours of the day (0-23) */
    byHour?: number[]
    /** Minutes of the hour (0-59) */
    byMinute?: number[]
    /** Position in set (1st, 2nd, -1 for last) */
    bySetPos?: number[]
  }

  /** First day of the week for weekly recurrence */
  weekStart?: DayOfWeek

  /** Dates to exclude from the recurrence (ISO 8601) */
  exceptions?: string[]
  /**
   * Modifications to specific occurrences.
   * Allows rescheduling or cancelling individual instances.
   */
  modifications?: Array<{
    /** Original date (ISO 8601) */
    date: string
    /** New time for rescheduled occurrence */
    newTime?: string
    /** Whether this occurrence is cancelled */
    cancelled?: boolean
  }>
}

/**
 * @interface HabitualPattern
 * @description Represents habitual or typical patterns in natural language.
 * Used for annotation research to capture expressions like "every morning".
 */
export interface HabitualPattern {
  /** Frequency descriptor */
  frequency: HabitualFrequency
  /** Typicality score (0-1 scale) */
  typicality: number

  /**
   * Natural language pattern description.
   * Captures colloquial temporal expressions.
   */
  naturalLanguage?: {
    /** The expression (e.g., "every morning", "on weekends") */
    expression: string
    /** Cultural context affecting interpretation */
    culturalContext?: string
    /** How precise the expression is */
    vagueness?: 'precise' | 'approximate' | 'fuzzy'
  }

  /**
   * Contextual anchors for the habitual pattern.
   * References to events, times of day, seasons, or cultural events.
   */
  anchors?: Array<{
    /** Type of anchor */
    type: 'event' | 'time_of_day' | 'season' | 'cultural'
    /** Reference description */
    reference: string
    /** Offset from the anchor (ISO 8601 duration) */
    offset?: string
  }>
}

/**
 * @interface CyclicalPattern
 * @description Represents cyclical or phase-based temporal patterns.
 * Used for patterns like seasons, lunar cycles, or project phases.
 */
export interface CyclicalPattern {
  /** Ordered list of phases in the cycle */
  phases: Array<{
    /** Name of the phase */
    name: string
    /** Duration of the phase (ISO 8601 duration) */
    duration?: string
    /** Description of the phase */
    description?: string
  }>
  /** Index of the current phase (0-based) */
  currentPhase?: number
  /** Start time of the cycle (ISO 8601) */
  startTime?: string
}

/**
 * @interface TimeCollection
 * @description A collection of time objects with optional pattern information.
 * Supports periodic, calendar, irregular, anchored, and habitual collections.
 *
 * @remarks
 * Time collections can represent recurring events, schedules, or arbitrary
 * sets of time points. They support both concrete instances and pattern-based
 * definitions.
 */
export interface TimeCollection {
  /** Unique identifier for the collection */
  id: string
  /** Display name for the collection */
  name: string
  /** Description of what this collection represents */
  description: string
  /** Concrete time instances (can be empty for pure patterns) */
  times: Time[]
  /** Type of collection */
  collectionType: 'periodic' | 'calendar' | 'irregular' | 'anchored' | 'habitual'

  /** Enhanced recurrence pattern based on iCalendar RRULE */
  recurrence?: RecurrenceRule

  /** Linguistic/habitual patterns (for annotation research) */
  habituality?: HabitualPattern

  /** Cyclical/phase-based pattern configuration */
  cycle?: CyclicalPattern

  /** Additional metadata */
  metadata?: Record<string, unknown>
}

