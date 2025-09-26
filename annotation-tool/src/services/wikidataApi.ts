interface WikidataSearchResult {
  id: string
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
  claims?: any
  sitelinks?: any
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'

export async function searchWikidata(query: string, limit: number = 10): Promise<WikidataSearchResult[]> {
  if (!query || query.length < 2) {
    return []
  }

  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    limit: limit.toString(),
    format: 'json',
    origin: '*'
  })

  try {
    const response = await fetch(`${WIKIDATA_API}?${params}`)
    const data = await response.json()
    
    return data.search?.map((item: any) => ({
      id: item.id,
      label: item.label || item.id,
      description: item.description,
      concepturi: item.concepturi,
      match: item.match
    })) || []
  } catch (error) {
    console.error('Error searching Wikidata:', error)
    return []
  }
}

export async function getWikidataEntity(id: string): Promise<WikidataEntity | null> {
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: id,
    format: 'json',
    origin: '*',
    props: 'labels|descriptions|claims|sitelinks'
  })

  try {
    const response = await fetch(`${WIKIDATA_API}?${params}`)
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

// Extract location data from a Wikidata entity
export function extractLocationData(entity: WikidataEntity) {
  const locations: any[] = []
  
  // P276 - location (general location of an event or object)
  if (entity.claims?.P276) {
    entity.claims.P276.forEach((claim: any) => {
      if (claim.mainsnak?.datavalue?.value?.id) {
        locations.push({
          property: 'location',
          wikidataId: claim.mainsnak.datavalue.value.id,
          // We'll need to fetch the actual entity details later
        })
      }
    })
  }
  
  // P17 - country
  if (entity.claims?.P17) {
    entity.claims.P17.forEach((claim: any) => {
      if (claim.mainsnak?.datavalue?.value?.id) {
        locations.push({
          property: 'country',
          wikidataId: claim.mainsnak.datavalue.value.id,
        })
      }
    })
  }
  
  // P131 - located in the administrative territorial entity
  if (entity.claims?.P131) {
    entity.claims.P131.forEach((claim: any) => {
      if (claim.mainsnak?.datavalue?.value?.id) {
        locations.push({
          property: 'administrative_location',
          wikidataId: claim.mainsnak.datavalue.value.id,
        })
      }
    })
  }
  
  // P706 - located on terrain feature
  if (entity.claims?.P706) {
    entity.claims.P706.forEach((claim: any) => {
      if (claim.mainsnak?.datavalue?.value?.id) {
        locations.push({
          property: 'terrain_feature',
          wikidataId: claim.mainsnak.datavalue.value.id,
        })
      }
    })
  }
  
  return locations
}

// Extract participant data from a Wikidata entity
export function extractParticipantData(entity: WikidataEntity) {
  const participants: any[] = []
  
  // P710 - participant (entities that participated in an event)
  if (entity.claims?.P710) {
    entity.claims.P710.forEach((claim: any) => {
      if (claim.mainsnak?.datavalue?.value?.id) {
        participants.push({
          property: 'participant',
          wikidataId: claim.mainsnak.datavalue.value.id,
          // Check for qualifiers like P3831 (object has role)
          role: claim.qualifiers?.P3831?.[0]?.datavalue?.value?.id || null
        })
      }
    })
  }
  
  // P1923 - participating teams
  if (entity.claims?.P1923) {
    entity.claims.P1923.forEach((claim: any) => {
      if (claim.mainsnak?.datavalue?.value?.id) {
        participants.push({
          property: 'participating_team',
          wikidataId: claim.mainsnak.datavalue.value.id,
        })
      }
    })
  }
  
  // P664 - organizer
  if (entity.claims?.P664) {
    entity.claims.P664.forEach((claim: any) => {
      if (claim.mainsnak?.datavalue?.value?.id) {
        participants.push({
          property: 'organizer',
          wikidataId: claim.mainsnak.datavalue.value.id,
        })
      }
    })
  }
  
  // P112 - founder
  if (entity.claims?.P112) {
    entity.claims.P112.forEach((claim: any) => {
      if (claim.mainsnak?.datavalue?.value?.id) {
        participants.push({
          property: 'founder',
          wikidataId: claim.mainsnak.datavalue.value.id,
        })
      }
    })
  }
  
  return participants
}

export function extractWikidataInfo(entity: WikidataEntity) {
  const label = entity.labels?.en?.value || entity.id
  const description = entity.descriptions?.en?.value || ''
  
  // Extract instance of (P31) and subclass of (P279) for type information
  const instanceOf = entity.claims?.P31?.map((claim: any) => 
    claim.mainsnak?.datavalue?.value?.id
  ).filter(Boolean) || []
  
  const subclassOf = entity.claims?.P279?.map((claim: any) => 
    claim.mainsnak?.datavalue?.value?.id
  ).filter(Boolean) || []

  // Extract aliases (Also known as)
  const aliases = entity.claims?.P742?.map((claim: any) => 
    claim.mainsnak?.datavalue?.value
  ).filter(Boolean) || []

  // Extract coordinates (P625 - coordinate location)
  let coordinates = null
  const coordinateClaim = entity.claims?.P625?.[0]
  if (coordinateClaim?.mainsnak?.datavalue?.value) {
    const coordValue = coordinateClaim.mainsnak.datavalue.value
    coordinates = {
      latitude: coordValue.latitude,
      longitude: coordValue.longitude,
      altitude: coordValue.altitude,
      precision: coordValue.precision,
      globe: coordValue.globe
    }
  }

  // Extract bounding box coordinates if available
  // P1332: northernmost point, P1333: southernmost point
  // P1334: westernmost point, P1335: easternmost point
  let boundingBox = null
  const northClaim = entity.claims?.P1332?.[0]?.mainsnak?.datavalue?.value
  const southClaim = entity.claims?.P1333?.[0]?.mainsnak?.datavalue?.value
  const westClaim = entity.claims?.P1334?.[0]?.mainsnak?.datavalue?.value
  const eastClaim = entity.claims?.P1335?.[0]?.mainsnak?.datavalue?.value
  
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
    wikidataUrl: `https://www.wikidata.org/wiki/${entity.id}`
  }
}

// Helper function to parse Wikidata time format
function parseWikidataTime(timeValue: any) {
  if (!timeValue) return null
  
  // Wikidata time format: +YYYY-MM-DDT00:00:00Z
  // Precision: 9=year, 10=month, 11=day, 12=hour, 13=minute, 14=second
  const time = timeValue.time || timeValue
  const precision = timeValue.precision || 11
  const calendarmodel = timeValue.calendarmodel
  const timezone = timeValue.timezone || 0
  
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

// Extract all temporal properties from a Wikidata entity
export function extractTemporalData(entity: WikidataEntity) {
  const temporalData: any = {}
  
  // P585 - Point in time
  if (entity.claims?.P585) {
    const pointInTime = entity.claims.P585[0]?.mainsnak?.datavalue?.value
    if (pointInTime) {
      temporalData.pointInTime = parseWikidataTime(pointInTime)
      
      // Check for qualifiers like "circa" (P1480)
      const sourcingCircumstances = entity.claims.P585[0]?.qualifiers?.P1480
      if (sourcingCircumstances) {
        const qualifier = sourcingCircumstances[0]?.datavalue?.value?.id
        if (qualifier === 'Q5727902') temporalData.circa = true
        if (qualifier === 'Q18122778') temporalData.disputed = true
        if (qualifier === 'Q56644435') temporalData.presumably = true
      }
    }
  }
  
  // P580 - Start time
  if (entity.claims?.P580) {
    const startTime = entity.claims.P580[0]?.mainsnak?.datavalue?.value
    if (startTime) {
      temporalData.startTime = parseWikidataTime(startTime)
    }
  }
  
  // P582 - End time
  if (entity.claims?.P582) {
    const endTime = entity.claims.P582[0]?.mainsnak?.datavalue?.value
    if (endTime) {
      temporalData.endTime = parseWikidataTime(endTime)
    }
  }
  
  // P571 - Inception (date of establishment/creation)
  if (entity.claims?.P571) {
    const inception = entity.claims.P571[0]?.mainsnak?.datavalue?.value
    if (inception) {
      temporalData.inception = parseWikidataTime(inception)
    }
  }
  
  // P576 - Dissolved, abolished or demolished date
  if (entity.claims?.P576) {
    const dissolved = entity.claims.P576[0]?.mainsnak?.datavalue?.value
    if (dissolved) {
      temporalData.dissolved = parseWikidataTime(dissolved)
    }
  }
  
  // P577 - Publication date
  if (entity.claims?.P577) {
    const publicationDate = entity.claims.P577[0]?.mainsnak?.datavalue?.value
    if (publicationDate) {
      temporalData.publicationDate = parseWikidataTime(publicationDate)
    }
  }
  
  // P1319 - Earliest date
  if (entity.claims?.P1319) {
    const earliestDate = entity.claims.P1319[0]?.mainsnak?.datavalue?.value
    if (earliestDate) {
      temporalData.earliestDate = parseWikidataTime(earliestDate)
    }
  }
  
  // P1326 - Latest date
  if (entity.claims?.P1326) {
    const latestDate = entity.claims.P1326[0]?.mainsnak?.datavalue?.value
    if (latestDate) {
      temporalData.latestDate = parseWikidataTime(latestDate)
    }
  }
  
  // Multiple P585 values could indicate recurring events
  if (entity.claims?.P585 && entity.claims.P585.length > 1) {
    temporalData.multipleOccurrences = entity.claims.P585.map((claim: any) => {
      const timeValue = claim.mainsnak?.datavalue?.value
      return timeValue ? parseWikidataTime(timeValue) : null
    }).filter(Boolean)
  }
  
  return Object.keys(temporalData).length > 0 ? temporalData : null
}