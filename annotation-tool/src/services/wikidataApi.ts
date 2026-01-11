import {
  getWikidataUrl,
  getWikidataConfig,
  getReverseIdMapping,
} from './wikidataConfig'

// Wikidata API type definitions
interface WikidataDataValue {
  value: {
    id?: string
    latitude?: number
    longitude?: number
    altitude?: number
    precision?: number
    globe?: string
    time?: string
    timezone?: number
    calendarmodel?: string
  } | string
  type: string
}

interface WikidataMainSnak {
  snaktype: string
  property: string
  datavalue?: WikidataDataValue
}

interface WikidataQualifiers {
  [property: string]: Array<{
    snaktype: string
    property: string
    datavalue?: WikidataDataValue
  }>
}

interface WikidataClaim {
  mainsnak: WikidataMainSnak
  type: string
  id?: string
  rank?: string
  qualifiers?: WikidataQualifiers
}

interface WikidataClaims {
  [property: string]: WikidataClaim[]
}

interface WikidataSitelinks {
  [site: string]: {
    site: string
    title: string
    badges: string[]
  }
}

interface WikidataSearchItem {
  id: string
  label?: string
  description?: string
  concepturi: string
  match?: {
    text: string
    type: string
  }
}

interface WikidataTimeValue {
  time: string
  precision: number
  calendarmodel?: string
  timezone?: number
}

interface ParsedWikidataTime {
  timestamp: string
  precision: number
  granularity: string
  timezone: number
  calendarModel?: string
  originalValue: string
}

interface LocationDataItem {
  property: string
  wikidataId: string
}

interface ParticipantDataItem {
  property: string
  wikidataId: string
  role?: string | null
}

interface TemporalData {
  pointInTime?: ParsedWikidataTime | null
  startTime?: ParsedWikidataTime | null
  endTime?: ParsedWikidataTime | null
  inception?: ParsedWikidataTime | null
  dissolved?: ParsedWikidataTime | null
  publicationDate?: ParsedWikidataTime | null
  earliestDate?: ParsedWikidataTime | null
  latestDate?: ParsedWikidataTime | null
  multipleOccurrences?: (ParsedWikidataTime | null)[]
  circa?: boolean
  disputed?: boolean
  presumably?: boolean
}

interface WikidataSearchResult {
  /** Local ID (may be auto-assigned in offline mode) */
  id: string
  /**
   * Original Wikidata ID (e.g., Q42).
   * In online mode, this equals `id`.
   * In offline mode, this is the original Wikidata ID mapped from the local ID.
   */
  wikidataId: string
  label: string
  description?: string
  concepturi: string
  match?: {
    text: string
    type: string
  }
}

interface WikidataEntity {
  id: string
  type: string
  labels: {
    [lang: string]: {
      language: string
      value: string
    }
  }
  descriptions?: {
    [lang: string]: {
      language: string
      value: string
    }
  }
  claims?: WikidataClaims
  sitelinks?: WikidataSitelinks
}

export async function searchWikidata(query: string, limit: number = 10): Promise<WikidataSearchResult[]> {
  if (!query || query.length < 2) {
    return []
  }

  const wikidataApi = await getWikidataUrl()
  const config = await getWikidataConfig()

  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    limit: limit.toString(),
    format: 'json',
    origin: '*'
  })

  try {
    const response = await fetch(`${wikidataApi}?${params}`)
    const data = await response.json()

    // In offline mode, map local IDs back to original Wikidata IDs
    const reverseMapping = config.mode === 'offline' ? await getReverseIdMapping() : null

    return data.search?.map((item: WikidataSearchItem) => {
      const localId = item.id
      // Look up original Wikidata ID from reverse mapping
      const wikidataId = reverseMapping?.[localId] || localId
      return {
        id: localId,
        wikidataId,
        label: item.label || localId,
        description: item.description,
        concepturi: item.concepturi,
        match: item.match
      }
    }) || []
  } catch (error) {
    console.error('Error searching Wikidata:', error)
    return []
  }
}

export async function getWikidataEntity(id: string): Promise<WikidataEntity | null> {
  const wikidataApi = await getWikidataUrl()

  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: id,
    format: 'json',
    origin: '*',
    props: 'labels|descriptions|claims|sitelinks'
  })

  try {
    const response = await fetch(`${wikidataApi}?${params}`)
    const data = await response.json()

    if (data.entities && data.entities[id]) {
      return data.entities[id]
    }
    return null
  } catch (error) {
    console.error('Error fetching Wikidata entity:', error)
    return null
  }
}

// Helper to extract ID from claim value
function getClaimValueId(claim: WikidataClaim): string | undefined {
  const value = claim.mainsnak?.datavalue?.value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return value.id
  }
  return undefined
}

// Extract location data from a Wikidata entity
export function extractLocationData(entity: WikidataEntity): LocationDataItem[] {
  const locations: LocationDataItem[] = []

  // P276 - location (general location of an event or object)
  if (entity.claims?.P276) {
    entity.claims.P276.forEach((claim: WikidataClaim) => {
      const wikidataId = getClaimValueId(claim)
      if (wikidataId) {
        locations.push({
          property: 'location',
          wikidataId,
        })
      }
    })
  }

  // P17 - country
  if (entity.claims?.P17) {
    entity.claims.P17.forEach((claim: WikidataClaim) => {
      const wikidataId = getClaimValueId(claim)
      if (wikidataId) {
        locations.push({
          property: 'country',
          wikidataId,
        })
      }
    })
  }

  // P131 - located in the administrative territorial entity
  if (entity.claims?.P131) {
    entity.claims.P131.forEach((claim: WikidataClaim) => {
      const wikidataId = getClaimValueId(claim)
      if (wikidataId) {
        locations.push({
          property: 'administrative_location',
          wikidataId,
        })
      }
    })
  }

  // P706 - located on terrain feature
  if (entity.claims?.P706) {
    entity.claims.P706.forEach((claim: WikidataClaim) => {
      const wikidataId = getClaimValueId(claim)
      if (wikidataId) {
        locations.push({
          property: 'terrain_feature',
          wikidataId,
        })
      }
    })
  }

  return locations
}

// Helper to extract qualifier value ID
function getQualifierValueId(claim: WikidataClaim, qualifierProperty: string): string | undefined {
  const qualifiers = claim.qualifiers?.[qualifierProperty]
  if (qualifiers && qualifiers.length > 0) {
    const value = qualifiers[0].datavalue?.value
    if (typeof value === 'object' && value !== null && 'id' in value) {
      return value.id
    }
  }
  return undefined
}

// Extract participant data from a Wikidata entity
export function extractParticipantData(entity: WikidataEntity): ParticipantDataItem[] {
  const participants: ParticipantDataItem[] = []

  // P710 - participant (entities that participated in an event)
  if (entity.claims?.P710) {
    entity.claims.P710.forEach((claim: WikidataClaim) => {
      const wikidataId = getClaimValueId(claim)
      if (wikidataId) {
        participants.push({
          property: 'participant',
          wikidataId,
          // Check for qualifiers like P3831 (object has role)
          role: getQualifierValueId(claim, 'P3831') || null
        })
      }
    })
  }

  // P1923 - participating teams
  if (entity.claims?.P1923) {
    entity.claims.P1923.forEach((claim: WikidataClaim) => {
      const wikidataId = getClaimValueId(claim)
      if (wikidataId) {
        participants.push({
          property: 'participating_team',
          wikidataId,
        })
      }
    })
  }

  // P664 - organizer
  if (entity.claims?.P664) {
    entity.claims.P664.forEach((claim: WikidataClaim) => {
      const wikidataId = getClaimValueId(claim)
      if (wikidataId) {
        participants.push({
          property: 'organizer',
          wikidataId,
        })
      }
    })
  }

  // P112 - founder
  if (entity.claims?.P112) {
    entity.claims.P112.forEach((claim: WikidataClaim) => {
      const wikidataId = getClaimValueId(claim)
      if (wikidataId) {
        participants.push({
          property: 'founder',
          wikidataId,
        })
      }
    })
  }

  return participants
}

/**
 * Options for extracting Wikidata info.
 */
interface ExtractWikidataInfoOptions {
  /** Optional base URL for wiki links (defaults to public Wikidata) */
  baseUrl?: string
  /**
   * Original Wikidata ID (e.g., Q42) if different from entity.id.
   * Used in offline mode where entity.id is an auto-assigned local ID.
   */
  wikidataId?: string
}

/**
 * Extracts structured information from a Wikidata entity.
 *
 * @param entity - The Wikidata entity to extract info from
 * @param options - Optional extraction options including baseUrl and wikidataId
 * @returns Extracted entity information including labels, types, coordinates, and temporal data
 */
export function extractWikidataInfo(entity: WikidataEntity, options?: ExtractWikidataInfoOptions | string) {
  // Handle legacy signature where second param is baseUrl string
  const opts: ExtractWikidataInfoOptions = typeof options === 'string'
    ? { baseUrl: options }
    : options || {}

  const wikidataBaseUrl = opts.baseUrl || 'https://www.wikidata.org'
  // Use provided wikidataId or fall back to entity.id
  const wikidataId = opts.wikidataId || entity.id
  const label = entity.labels?.en?.value || entity.id
  const description = entity.descriptions?.en?.value || ''
  
  // Extract instance of (P31) and subclass of (P279) for type information
  const instanceOf = entity.claims?.P31?.map((claim: WikidataClaim) =>
    getClaimValueId(claim)
  ).filter((id): id is string => !!id) || []

  const subclassOf = entity.claims?.P279?.map((claim: WikidataClaim) =>
    getClaimValueId(claim)
  ).filter((id): id is string => !!id) || []

  // Extract aliases (Also known as)
  const aliases = entity.claims?.P742?.map((claim: WikidataClaim) => {
    const value = claim.mainsnak?.datavalue?.value
    return typeof value === 'string' ? value : undefined
  }).filter((v): v is string => !!v) || []

  // Extract coordinates (P625 - coordinate location)
  let coordinates: {
    latitude?: number
    longitude?: number
    altitude?: number
    precision?: number
    globe?: string
  } | null = null
  const coordinateClaim = entity.claims?.P625?.[0]
  if (coordinateClaim?.mainsnak?.datavalue?.value) {
    const coordValue = coordinateClaim.mainsnak.datavalue.value
    if (typeof coordValue === 'object' && coordValue !== null) {
      coordinates = {
        latitude: coordValue.latitude,
        longitude: coordValue.longitude,
        altitude: coordValue.altitude,
        precision: coordValue.precision,
        globe: coordValue.globe
      }
    }
  }

  // Extract bounding box coordinates if available
  // P1332: northernmost point, P1333: southernmost point
  // P1334: westernmost point, P1335: easternmost point
  let boundingBox: {
    minLatitude?: number
    maxLatitude?: number
    minLongitude?: number
    maxLongitude?: number
  } | null = null

  const getCoordFromClaim = (claim: WikidataClaim | undefined) => {
    const value = claim?.mainsnak?.datavalue?.value
    if (typeof value === 'object' && value !== null) {
      return value
    }
    return undefined
  }

  const northClaim = getCoordFromClaim(entity.claims?.P1332?.[0])
  const southClaim = getCoordFromClaim(entity.claims?.P1333?.[0])
  const westClaim = getCoordFromClaim(entity.claims?.P1334?.[0])
  const eastClaim = getCoordFromClaim(entity.claims?.P1335?.[0])

  if (northClaim || southClaim || westClaim || eastClaim) {
    boundingBox = {
      minLatitude: southClaim?.latitude,
      maxLatitude: northClaim?.latitude,
      minLongitude: westClaim?.longitude,
      maxLongitude: eastClaim?.longitude
    }
  }

  // Extract temporal data
  const temporalData = extractTemporalData(entity)
  
  // Extract location data
  const locationData = extractLocationData(entity)
  
  // Extract participant data
  const participantData = extractParticipantData(entity)

  return {
    id: entity.id,
    wikidataId,
    label,
    description,
    instanceOf,
    subclassOf,
    aliases,
    coordinates,
    boundingBox,
    temporalData,
    locationData,
    participantData,
    wikidataUrl: `${wikidataBaseUrl}/wiki/${entity.id}`
  }
}

// Helper function to parse Wikidata time format
function parseWikidataTime(timeValue: WikidataTimeValue | string | null | undefined): ParsedWikidataTime | null {
  if (!timeValue) return null

  // Wikidata time format: +YYYY-MM-DDT00:00:00Z
  // Precision: 9=year, 10=month, 11=day, 12=hour, 13=minute, 14=second
  const time = typeof timeValue === 'object' ? (timeValue.time || '') : String(timeValue)
  const precision = typeof timeValue === 'object' ? (timeValue.precision ?? 11) : 11
  const calendarmodel = typeof timeValue === 'object' ? timeValue.calendarmodel : undefined
  const timezone = typeof timeValue === 'object' ? (timeValue.timezone ?? 0) : 0

  // Parse the time string
  const match = time.match(/^([+-]?\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z?$/)
  if (!match) return null

  const [, yearWithSign, month, day, hour, minute] = match

  // Remove + prefix from year for valid ISO string
  const year = yearWithSign.replace(/^\+/, '')

  // Determine granularity based on precision
  let granularity = 'day'
  let isoString = time.replace(/^\+/, '') // Remove + prefix for valid ISO format

  switch (precision) {
    case 9: // Year
      granularity = 'year'
      isoString = `${year}-01-01T00:00:00Z`
      break
    case 10: // Month
      granularity = 'month'
      isoString = `${year}-${month}-01T00:00:00Z`
      break
    case 11: // Day
      granularity = 'day'
      isoString = `${year}-${month}-${day}T00:00:00Z`
      break
    case 12: // Hour
      granularity = 'hour'
      isoString = `${year}-${month}-${day}T${hour}:00:00Z`
      break
    case 13: // Minute
      granularity = 'minute'
      isoString = `${year}-${month}-${day}T${hour}:${minute}:00Z`
      break
    case 14: // Second
      granularity = 'second'
      isoString = time.replace(/^\+/, '') // Remove + prefix for valid ISO format
      break
  }

  return {
    timestamp: isoString,
    precision,
    granularity,
    timezone,
    calendarModel: calendarmodel,
    originalValue: time
  }
}

// Helper to extract time value from claim
function getClaimTimeValue(claim: WikidataClaim | undefined): WikidataTimeValue | null {
  const value = claim?.mainsnak?.datavalue?.value
  if (typeof value === 'object' && value !== null && 'time' in value) {
    return value as WikidataTimeValue
  }
  return null
}

// Extract all temporal properties from a Wikidata entity
export function extractTemporalData(entity: WikidataEntity): TemporalData | null {
  const temporalData: TemporalData = {}

  // P585 - Point in time
  if (entity.claims?.P585) {
    const pointInTime = getClaimTimeValue(entity.claims.P585[0])
    if (pointInTime) {
      temporalData.pointInTime = parseWikidataTime(pointInTime)

      // Check for qualifiers like "circa" (P1480)
      const sourcingCircumstances = entity.claims.P585[0]?.qualifiers?.P1480
      if (sourcingCircumstances) {
        const qualifierValue = sourcingCircumstances[0]?.datavalue?.value
        const qualifier = typeof qualifierValue === 'object' && qualifierValue !== null && 'id' in qualifierValue
          ? qualifierValue.id
          : undefined
        if (qualifier === 'Q5727902') temporalData.circa = true
        if (qualifier === 'Q18122778') temporalData.disputed = true
        if (qualifier === 'Q56644435') temporalData.presumably = true
      }
    }
  }

  // P580 - Start time
  if (entity.claims?.P580) {
    const startTime = getClaimTimeValue(entity.claims.P580[0])
    if (startTime) {
      temporalData.startTime = parseWikidataTime(startTime)
    }
  }

  // P582 - End time
  if (entity.claims?.P582) {
    const endTime = getClaimTimeValue(entity.claims.P582[0])
    if (endTime) {
      temporalData.endTime = parseWikidataTime(endTime)
    }
  }

  // P571 - Inception (date of establishment/creation)
  if (entity.claims?.P571) {
    const inception = getClaimTimeValue(entity.claims.P571[0])
    if (inception) {
      temporalData.inception = parseWikidataTime(inception)
    }
  }

  // P576 - Dissolved, abolished or demolished date
  if (entity.claims?.P576) {
    const dissolved = getClaimTimeValue(entity.claims.P576[0])
    if (dissolved) {
      temporalData.dissolved = parseWikidataTime(dissolved)
    }
  }

  // P577 - Publication date
  if (entity.claims?.P577) {
    const publicationDate = getClaimTimeValue(entity.claims.P577[0])
    if (publicationDate) {
      temporalData.publicationDate = parseWikidataTime(publicationDate)
    }
  }

  // P1319 - Earliest date
  if (entity.claims?.P1319) {
    const earliestDate = getClaimTimeValue(entity.claims.P1319[0])
    if (earliestDate) {
      temporalData.earliestDate = parseWikidataTime(earliestDate)
    }
  }

  // P1326 - Latest date
  if (entity.claims?.P1326) {
    const latestDate = getClaimTimeValue(entity.claims.P1326[0])
    if (latestDate) {
      temporalData.latestDate = parseWikidataTime(latestDate)
    }
  }

  // Multiple P585 values could indicate recurring events
  if (entity.claims?.P585 && entity.claims.P585.length > 1) {
    temporalData.multipleOccurrences = entity.claims.P585.map((claim: WikidataClaim) => {
      const timeValue = getClaimTimeValue(claim)
      return timeValue ? parseWikidataTime(timeValue) : null
    }).filter((t): t is ParsedWikidataTime => t !== null)
  }

  return Object.keys(temporalData).length > 0 ? temporalData : null
}