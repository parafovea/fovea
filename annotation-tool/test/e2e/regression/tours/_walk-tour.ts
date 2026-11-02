import { expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    __foveaTour?: {
      launch: (id: string) => Promise<boolean> | boolean
      activeId: () => string | null
      telemetry: Array<{ kind: string; [key: string]: unknown }>
      clearTelemetry?: () => void
    }
  }
}

/** Launch a tour through the test handle, asserting the handle exists and the launch succeeds. */
export async function launchTour(page: Page, tourId: string): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })
  const launched = await page.evaluate((id) => Promise.resolve(window.__foveaTour!.launch(id)), tourId)
  expect(launched, `__foveaTour.launch('${tourId}') succeeds`).toBe(true)
}

export interface TourWalk {
  /** Total steps the tour declares, read from the step card counter. */
  total: number
  /** Steps the walk advanced through. */
  walked: number
  /** Steps whose anchor never resolved (the card showed the missing-anchor note). */
  unresolved: string[]
}

/**
 * Walk every step of the active tour through the engine: assert the step card
 * is visible, record any step whose anchor does not resolve, advance with the
 * card's primary action, and confirm the card closes when the tour ends. Reads
 * the total step count from the card so it stays correct as tours change.
 */
export async function walkActiveTour(page: Page): Promise<TourWalk> {
  const card = page.locator('[data-fovea-tour-step-card]')
  await expect(card).toBeVisible({ timeout: 15000 })

  const counter = card.locator('[aria-label^="Step "]').first()
  const label = (await counter.getAttribute('aria-label')) ?? ''
  const total = Number(label.match(/of (\d+)/)?.[1] ?? '0')
  expect(total, 'the step card exposes a total step count').toBeGreaterThan(0)

  const unresolved: string[] = []
  let walked = 0
  for (let i = 0; i < total + 3; i += 1) {
    if (!(await card.isVisible().catch(() => false))) break
    walked += 1
    // Let the engine resolve this step's anchor (navigate, reveal chain, driver).
    await page.waitForTimeout(600)
    if ((await card.getByText(/Couldn't find this UI element/i).count()) > 0) {
      const stepLabel = (await counter.getAttribute('aria-label').catch(() => null)) ?? `step ${i + 1}`
      const narration = (await card.locator('p').first().textContent().catch(() => '')) ?? ''
      unresolved.push(`${stepLabel}: ${narration.trim().slice(0, 70)}`)
    }
    const primary = card.getByRole('button', { name: /^(Next|Finish|Skip)$/ }).first()
    if (!(await primary.isVisible().catch(() => false))) break
    await primary.click()
    await page.waitForTimeout(300)
  }

  await expect(card, 'the tour card closes when the tour finishes').toBeHidden({ timeout: 10000 })
  return { total, walked, unresolved }
}

/** Walk the active tour and assert every step resolved its anchor and the tour completed. */
export async function expectTourWalksClean(page: Page): Promise<TourWalk> {
  const walk = await walkActiveTour(page)
  expect(walk.unresolved, `every step anchor resolves (unresolved: ${walk.unresolved.join(' | ') || 'none'})`).toEqual([])

  // Confirm completion from the engine's telemetry rather than the press count:
  // a step whose action auto-advances (expectAction 'click') moves the tour on
  // without a Next press, so counting presses undercounts. The engine records a
  // `completed` analytics event only when the runner advances past the final
  // step, so its presence proves the walk reached the end.
  const telemetry = await page.evaluate(() => window.__foveaTour?.telemetry ?? [])
  const completed = telemetry.some((event) => event.kind === 'completed')
  expect(completed, 'the tour finishes by completing').toBe(true)
  return walk
}
