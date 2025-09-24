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

  return {
    id: entity.id,
    label,
    description,
    instanceOf,
    subclassOf,
    aliases,
    wikidataUrl: `https://www.wikidata.org/wiki/${entity.id}`
  }
}