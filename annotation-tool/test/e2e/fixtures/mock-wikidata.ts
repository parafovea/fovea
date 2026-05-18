import type { Page } from '@playwright/test'

/**
 * Install Playwright route handlers that intercept the two Wikidata
 * REST endpoints the frontend hits via `fetch` (services/wikidataApi.ts:
 * searchWikidata and getWikidataEntity) and return deterministic mock
 * payloads. Without this, the regression/wikidata-import.spec.ts suite
 * is at the mercy of www.wikidata.org's rate limiter (HTTP 429 after a
 * handful of parallel requests) which makes the suite flaky and slow.
 *
 * The mock dispatches on the `action` query param:
 *   - wbsearchentities returns three synthetic results whose ids /
 *     labels are derived from the `search` term so the test can assert
 *     against a known first option.
 *   - wbgetentities returns a minimal entity stub with labels,
 *     descriptions, and an empty claims map — enough for the preview
 *     card the WikidataImportFlow renders.
 *
 * Call from the test before navigating the page:
 *
 *   import { mockWikidata } from '../fixtures/mock-wikidata'
 *   test.beforeEach(async ({ page }) => { await mockWikidata(page) })
 */
export async function mockWikidata(page: Page): Promise<void> {
  await page.route('**/w/api.php*', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    if (action === 'wbsearchentities') {
      const search = url.searchParams.get('search') || 'thing'
      // Wikidata labels are lowercase for common-noun concepts (e.g. Q5
      // is "human", Q144 is "dog") and capitalised for proper nouns. The
      // wikidata-import.spec.ts tests assert against lowercase labels
      // (`expectTypeExists('human')`), so we keep the search term as-is
      // and only normalise to lowercase for the primary label.
      const cap = search.toLowerCase()
      const body = {
        searchinfo: { search },
        search: [
          {
            id: `Q${stableId(search)}`,
            label: cap,
            description: `${cap} (mocked Wikidata entity for E2E testing)`,
            concepturi: `http://www.wikidata.org/entity/Q${stableId(search)}`,
            match: { type: 'label', language: 'en', text: cap },
          },
          {
            id: `Q${stableId(search) + 1}`,
            label: `${cap} (variant)`,
            description: `Alternate ${cap}`,
            concepturi: `http://www.wikidata.org/entity/Q${stableId(search) + 1}`,
            match: { type: 'alias', language: 'en', text: cap },
          },
          {
            id: `Q${stableId(search) + 2}`,
            label: `${cap} (broad)`,
            description: `Broader sense of ${cap}`,
            concepturi: `http://www.wikidata.org/entity/Q${stableId(search) + 2}`,
            match: { type: 'description', language: 'en', text: cap },
          },
        ],
        success: 1,
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      return
    }
    if (action === 'wbgetentities') {
      const ids = (url.searchParams.get('ids') || '').split('|').filter(Boolean)
      const entities: Record<string, unknown> = {}
      for (const id of ids) {
        entities[id] = {
          type: 'item',
          id,
          labels: { en: { language: 'en', value: id } },
          descriptions: { en: { language: 'en', value: `${id} (mocked)` } },
          claims: {},
          sitelinks: {},
        }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entities, success: 1 }) })
      return
    }
    await route.continue()
  })
}

function stableId(s: string): number {
  let h = 0
  for (const c of s) h = ((h << 5) - h + c.charCodeAt(0)) | 0
  return Math.abs(h) % 100000 + 1
}
