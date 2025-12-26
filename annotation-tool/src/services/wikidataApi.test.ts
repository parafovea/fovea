/**
 * Tests for the Wikidata API service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  searchWikidata,
  getWikidataEntity,
  extractLocationData,
  extractParticipantData,
  extractTemporalData,
  extractWikidataInfo,
} from './wikidataApi'

// Mock the wikidataConfig module
vi.mock('./wikidataConfig', () => ({
  getWikidataUrl: vi.fn(),
  getWikidataConfig: vi.fn(),
  getReverseIdMapping: vi.fn(),
}))

import { getWikidataUrl, getWikidataConfig, getReverseIdMapping } from './wikidataConfig'

const mockGetWikidataUrl = vi.mocked(getWikidataUrl)
const mockGetWikidataConfig = vi.mocked(getWikidataConfig)
const mockGetReverseIdMapping = vi.mocked(getReverseIdMapping)

describe('wikidataApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to online mode
    mockGetWikidataUrl.mockResolvedValue('https://www.wikidata.org/w/api.php')
    mockGetWikidataConfig.mockResolvedValue({
      url: 'https://www.wikidata.org/w/api.php',
      mode: 'online',
      idMapping: null,
      allowExternalLinks: true,
    })
    mockGetReverseIdMapping.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('searchWikidata', () => {
    it('returns empty array for empty query', async () => {
      const results = await searchWikidata('')
      expect(results).toEqual([])
    })

    it('returns empty array for query shorter than 2 characters', async () => {
      const results = await searchWikidata('a')
      expect(results).toEqual([])
    })

    it('returns matching entities for query', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            search: [
              {
                id: 'Q42',
                label: 'Douglas Adams',
                description: 'English writer and humourist',
                concepturi: 'http://www.wikidata.org/entity/Q42',
                match: { text: 'Douglas Adams', type: 'label' },
              },
            ],
          }),
      })

      const results = await searchWikidata('Douglas Adams')

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual({
        id: 'Q42',
        wikidataId: 'Q42',
        label: 'Douglas Adams',
        description: 'English writer and humourist',
        concepturi: 'http://www.wikidata.org/entity/Q42',
        match: { text: 'Douglas Adams', type: 'label' },
      })
    })

    it('handles empty results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ search: [] }),
      })

      const results = await searchWikidata('xyznonexistent')
      expect(results).toEqual([])
    })

    it('handles missing search array in response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const results = await searchWikidata('test')
      expect(results).toEqual([])
    })

    it('applies ID mapping in offline mode', async () => {
      mockGetWikidataConfig.mockResolvedValue({
        url: 'http://localhost:8181/w/api.php',
        mode: 'offline',
        idMapping: { Q42: 'Q2' },
        allowExternalLinks: false,
      })
      // Reverse mapping: local ID -> Wikidata ID
      mockGetReverseIdMapping.mockResolvedValue({ Q2: 'Q42' })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            search: [
              {
                id: 'Q2', // Local Wikibase ID
                label: 'Douglas Adams',
                description: 'English writer and humourist',
                concepturi: 'http://localhost:8181/entity/Q2',
              },
            ],
          }),
      })

      const results = await searchWikidata('Douglas Adams')

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('Q2') // Local ID
      expect(results[0].wikidataId).toBe('Q42') // Original Wikidata ID
    })

    it('includes wikidataId equal to id in online mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            search: [{ id: 'Q42', label: 'Test', concepturi: 'http://test' }],
          }),
      })

      const results = await searchWikidata('test')

      expect(results[0].id).toBe('Q42')
      expect(results[0].wikidataId).toBe('Q42')
    })

    it('handles network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const results = await searchWikidata('test')
      expect(results).toEqual([])
    })

    it('uses default limit of 10', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ search: [] }),
      })

      await searchWikidata('test')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10')
      )
    })

    it('uses custom limit when specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ search: [] }),
      })

      await searchWikidata('test', 5)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5')
      )
    })

    it('uses label as fallback when missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            search: [{ id: 'Q123', concepturi: 'http://test' }],
          }),
      })

      const results = await searchWikidata('test')

      expect(results[0].label).toBe('Q123') // Falls back to ID
    })
  })

  describe('getWikidataEntity', () => {
    it('fetches single entity by ID', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            entities: {
              Q42: {
                id: 'Q42',
                type: 'item',
                labels: { en: { language: 'en', value: 'Douglas Adams' } },
                descriptions: {
                  en: { language: 'en', value: 'English writer and humourist' },
                },
              },
            },
          }),
      })

      const entity = await getWikidataEntity('Q42')

      expect(entity).not.toBeNull()
      expect(entity?.id).toBe('Q42')
      expect(entity?.labels.en.value).toBe('Douglas Adams')
    })

    it('returns null for missing entity', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entities: {} }),
      })

      const entity = await getWikidataEntity('Q999999999')
      expect(entity).toBeNull()
    })

    it('returns null when entities object is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const entity = await getWikidataEntity('Q42')
      expect(entity).toBeNull()
    })

    it('handles network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const entity = await getWikidataEntity('Q42')
      expect(entity).toBeNull()
    })

    it('includes correct props in request', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entities: {} }),
      })

      await getWikidataEntity('Q42')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('props=labels%7Cdescriptions%7Cclaims%7Csitelinks')
      )
    })
  })

  describe('extractLocationData', () => {
    it('extracts P276 location property', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P276: [
            { mainsnak: { datavalue: { value: { id: 'Q60' } } } },
          ],
        },
      }

      const locations = extractLocationData(entity)

      expect(locations).toHaveLength(1)
      expect(locations[0]).toEqual({
        property: 'location',
        wikidataId: 'Q60',
      })
    })

    it('extracts P17 country property', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P17: [{ mainsnak: { datavalue: { value: { id: 'Q30' } } } }],
        },
      }

      const locations = extractLocationData(entity)

      expect(locations).toHaveLength(1)
      expect(locations[0]).toEqual({
        property: 'country',
        wikidataId: 'Q30',
      })
    })

    it('extracts P131 administrative location', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P131: [{ mainsnak: { datavalue: { value: { id: 'Q65' } } } }],
        },
      }

      const locations = extractLocationData(entity)

      expect(locations).toHaveLength(1)
      expect(locations[0].property).toBe('administrative_location')
    })

    it('extracts P706 terrain feature', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P706: [{ mainsnak: { datavalue: { value: { id: 'Q9430' } } } }],
        },
      }

      const locations = extractLocationData(entity)

      expect(locations).toHaveLength(1)
      expect(locations[0].property).toBe('terrain_feature')
    })

    it('extracts multiple locations from different properties', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P276: [{ mainsnak: { datavalue: { value: { id: 'Q60' } } } }],
          P17: [{ mainsnak: { datavalue: { value: { id: 'Q30' } } } }],
        },
      }

      const locations = extractLocationData(entity)

      expect(locations).toHaveLength(2)
    })

    it('handles missing location data', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {},
      }

      const locations = extractLocationData(entity)
      expect(locations).toEqual([])
    })

    it('handles undefined claims', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
      }

      const locations = extractLocationData(entity)
      expect(locations).toEqual([])
    })
  })

  describe('extractParticipantData', () => {
    it('extracts P710 participant property', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P710: [
            { mainsnak: { datavalue: { value: { id: 'Q5' } } } },
          ],
        },
      }

      const participants = extractParticipantData(entity)

      expect(participants).toHaveLength(1)
      expect(participants[0]).toEqual({
        property: 'participant',
        wikidataId: 'Q5',
        role: null,
      })
    })

    it('extracts participant role from qualifiers', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P710: [
            {
              mainsnak: { datavalue: { value: { id: 'Q5' } } },
              qualifiers: {
                P3831: [{ datavalue: { value: { id: 'Q123' } } }],
              },
            },
          ],
        },
      }

      const participants = extractParticipantData(entity)

      expect(participants[0].role).toBe('Q123')
    })

    it('extracts P1923 participating teams', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P1923: [{ mainsnak: { datavalue: { value: { id: 'Q100' } } } }],
        },
      }

      const participants = extractParticipantData(entity)

      expect(participants).toHaveLength(1)
      expect(participants[0].property).toBe('participating_team')
    })

    it('extracts P664 organizer', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P664: [{ mainsnak: { datavalue: { value: { id: 'Q200' } } } }],
        },
      }

      const participants = extractParticipantData(entity)

      expect(participants[0].property).toBe('organizer')
    })

    it('extracts P112 founder', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P112: [{ mainsnak: { datavalue: { value: { id: 'Q300' } } } }],
        },
      }

      const participants = extractParticipantData(entity)

      expect(participants[0].property).toBe('founder')
    })

    it('handles missing participant data', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {},
      }

      const participants = extractParticipantData(entity)
      expect(participants).toEqual([])
    })
  })

  describe('extractTemporalData', () => {
    it('extracts P585 point in time', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P585: [
            {
              mainsnak: {
                datavalue: {
                  value: {
                    time: '+2024-01-15T00:00:00Z',
                    precision: 11,
                    calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
                  },
                },
              },
            },
          ],
        },
      }

      const temporal = extractTemporalData(entity)

      expect(temporal).not.toBeNull()
      expect(temporal?.pointInTime).toBeDefined()
      expect(temporal?.pointInTime?.timestamp).toBe('2024-01-15T00:00:00Z')
      expect(temporal?.pointInTime?.granularity).toBe('day')
    })

    it('extracts P580 start time', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P580: [
            {
              mainsnak: {
                datavalue: {
                  value: {
                    time: '+2024-01-01T00:00:00Z',
                    precision: 11,
                  },
                },
              },
            },
          ],
        },
      }

      const temporal = extractTemporalData(entity)

      expect(temporal?.startTime).toBeDefined()
      expect(temporal?.startTime?.timestamp).toBe('2024-01-01T00:00:00Z')
    })

    it('extracts P582 end time', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P582: [
            {
              mainsnak: {
                datavalue: {
                  value: {
                    time: '+2024-12-31T00:00:00Z',
                    precision: 11,
                  },
                },
              },
            },
          ],
        },
      }

      const temporal = extractTemporalData(entity)

      expect(temporal?.endTime).toBeDefined()
      expect(temporal?.endTime?.timestamp).toBe('2024-12-31T00:00:00Z')
    })

    it('handles year precision (9)', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P585: [
            {
              mainsnak: {
                datavalue: {
                  value: { time: '+2024-00-00T00:00:00Z', precision: 9 },
                },
              },
            },
          ],
        },
      }

      const temporal = extractTemporalData(entity)

      expect(temporal?.pointInTime?.granularity).toBe('year')
      expect(temporal?.pointInTime?.timestamp).toBe('2024-01-01T00:00:00Z')
    })

    it('handles month precision (10)', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P585: [
            {
              mainsnak: {
                datavalue: {
                  value: { time: '+2024-03-00T00:00:00Z', precision: 10 },
                },
              },
            },
          ],
        },
      }

      const temporal = extractTemporalData(entity)

      expect(temporal?.pointInTime?.granularity).toBe('month')
      expect(temporal?.pointInTime?.timestamp).toBe('2024-03-01T00:00:00Z')
    })

    it('detects circa qualifier (Q5727902)', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P585: [
            {
              mainsnak: {
                datavalue: {
                  value: { time: '+2024-01-15T00:00:00Z', precision: 11 },
                },
              },
              qualifiers: {
                P1480: [{ datavalue: { value: { id: 'Q5727902' } } }],
              },
            },
          ],
        },
      }

      const temporal = extractTemporalData(entity)

      expect(temporal?.circa).toBe(true)
    })

    it('extracts P571 inception date', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P571: [
            {
              mainsnak: {
                datavalue: {
                  value: { time: '+1990-01-01T00:00:00Z', precision: 11 },
                },
              },
            },
          ],
        },
      }

      const temporal = extractTemporalData(entity)

      expect(temporal?.inception).toBeDefined()
    })

    it('extracts P576 dissolved date', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P576: [
            {
              mainsnak: {
                datavalue: {
                  value: { time: '+2020-12-31T00:00:00Z', precision: 11 },
                },
              },
            },
          ],
        },
      }

      const temporal = extractTemporalData(entity)

      expect(temporal?.dissolved).toBeDefined()
    })

    it('extracts multiple P585 values as multipleOccurrences', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {
          P585: [
            {
              mainsnak: {
                datavalue: {
                  value: { time: '+2024-01-01T00:00:00Z', precision: 11 },
                },
              },
            },
            {
              mainsnak: {
                datavalue: {
                  value: { time: '+2024-06-01T00:00:00Z', precision: 11 },
                },
              },
            },
          ],
        },
      }

      const temporal = extractTemporalData(entity)

      expect(temporal?.multipleOccurrences).toBeDefined()
      expect(temporal?.multipleOccurrences).toHaveLength(2)
    })

    it('returns null for missing temporal data', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: {},
        claims: {},
      }

      const temporal = extractTemporalData(entity)
      expect(temporal).toBeNull()
    })
  })

  describe('extractWikidataInfo', () => {
    const sampleEntity = {
      id: 'Q42',
      type: 'item',
      labels: { en: { language: 'en', value: 'Douglas Adams' } },
      descriptions: {
        en: { language: 'en', value: 'English writer and humourist' },
      },
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
        P279: [{ mainsnak: { datavalue: { value: { id: 'Q36180' } } } }],
        P742: [{ mainsnak: { datavalue: { value: 'DNA' } } }],
      },
    }

    it('extracts labels and descriptions', () => {
      const info = extractWikidataInfo(sampleEntity)

      expect(info.label).toBe('Douglas Adams')
      expect(info.description).toBe('English writer and humourist')
    })

    it('falls back to ID for missing label', () => {
      const entity = { id: 'Q42', type: 'item', labels: {} }
      const info = extractWikidataInfo(entity)

      expect(info.label).toBe('Q42')
    })

    it('returns empty string for missing description', () => {
      const entity = {
        id: 'Q42',
        type: 'item',
        labels: { en: { language: 'en', value: 'Test' } },
      }
      const info = extractWikidataInfo(entity)

      expect(info.description).toBe('')
    })

    it('extracts instanceOf (P31)', () => {
      const info = extractWikidataInfo(sampleEntity)

      expect(info.instanceOf).toContain('Q5')
    })

    it('extracts subclassOf (P279)', () => {
      const info = extractWikidataInfo(sampleEntity)

      expect(info.subclassOf).toContain('Q36180')
    })

    it('extracts aliases (P742)', () => {
      const info = extractWikidataInfo(sampleEntity)

      expect(info.aliases).toContain('DNA')
    })

    it('extracts coordinates from P625', () => {
      const entity = {
        id: 'Q60',
        type: 'item',
        labels: { en: { language: 'en', value: 'New York City' } },
        claims: {
          P625: [
            {
              mainsnak: {
                datavalue: {
                  value: {
                    latitude: 40.7128,
                    longitude: -74.006,
                    altitude: null,
                    precision: 0.0001,
                    globe: 'http://www.wikidata.org/entity/Q2',
                  },
                },
              },
            },
          ],
        },
      }

      const info = extractWikidataInfo(entity)

      expect(info.coordinates).toEqual({
        latitude: 40.7128,
        longitude: -74.006,
        altitude: null,
        precision: 0.0001,
        globe: 'http://www.wikidata.org/entity/Q2',
      })
    })

    it('returns null coordinates when not present', () => {
      const info = extractWikidataInfo(sampleEntity)

      expect(info.coordinates).toBeNull()
    })

    it('uses default Wikidata base URL', () => {
      const info = extractWikidataInfo(sampleEntity)

      expect(info.wikidataUrl).toBe('https://www.wikidata.org/wiki/Q42')
    })

    it('accepts custom base URL as string (legacy signature)', () => {
      const info = extractWikidataInfo(sampleEntity, 'http://localhost:8181')

      expect(info.wikidataUrl).toBe('http://localhost:8181/wiki/Q42')
    })

    it('accepts options object with baseUrl', () => {
      const info = extractWikidataInfo(sampleEntity, {
        baseUrl: 'http://localhost:8181',
      })

      expect(info.wikidataUrl).toBe('http://localhost:8181/wiki/Q42')
    })

    it('uses provided wikidataId over entity.id', () => {
      const entity = {
        id: 'Q2', // Local Wikibase ID
        type: 'item',
        labels: { en: { language: 'en', value: 'Test' } },
      }

      const info = extractWikidataInfo(entity, { wikidataId: 'Q42' })

      expect(info.id).toBe('Q2')
      expect(info.wikidataId).toBe('Q42')
    })

    it('includes temporalData when present', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: { en: { language: 'en', value: 'Test Event' } },
        claims: {
          P585: [
            {
              mainsnak: {
                datavalue: {
                  value: { time: '+2024-01-15T00:00:00Z', precision: 11 },
                },
              },
            },
          ],
        },
      }

      const info = extractWikidataInfo(entity)

      expect(info.temporalData).not.toBeNull()
      expect(info.temporalData?.pointInTime).toBeDefined()
    })

    it('includes locationData when present', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: { en: { language: 'en', value: 'Test Event' } },
        claims: {
          P276: [{ mainsnak: { datavalue: { value: { id: 'Q60' } } } }],
        },
      }

      const info = extractWikidataInfo(entity)

      expect(info.locationData).toHaveLength(1)
    })

    it('includes participantData when present', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: { en: { language: 'en', value: 'Test Event' } },
        claims: {
          P710: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
        },
      }

      const info = extractWikidataInfo(entity)

      expect(info.participantData).toHaveLength(1)
    })

    it('extracts bounding box coordinates', () => {
      const entity = {
        id: 'Q1',
        type: 'item',
        labels: { en: { language: 'en', value: 'Test' } },
        claims: {
          P1332: [
            {
              mainsnak: { datavalue: { value: { latitude: 42.0 } } },
            },
          ],
          P1333: [
            {
              mainsnak: { datavalue: { value: { latitude: 40.0 } } },
            },
          ],
          P1334: [
            {
              mainsnak: { datavalue: { value: { longitude: -75.0 } } },
            },
          ],
          P1335: [
            {
              mainsnak: { datavalue: { value: { longitude: -73.0 } } },
            },
          ],
        },
      }

      const info = extractWikidataInfo(entity)

      expect(info.boundingBox).toEqual({
        minLatitude: 40.0,
        maxLatitude: 42.0,
        minLongitude: -75.0,
        maxLongitude: -73.0,
      })
    })

    it('returns null boundingBox when not present', () => {
      const info = extractWikidataInfo(sampleEntity)

      expect(info.boundingBox).toBeNull()
    })
  })
})
