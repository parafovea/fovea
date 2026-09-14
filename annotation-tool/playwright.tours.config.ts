// Tour-run override: the regression/tours end-to-end walkthroughs drive the
// real microvent MP4 corpus and need a browser channel that decodes H.264.
// The base regression project uses Playwright's bundled Chromium (no H.264),
// so this config extends the base and swaps the regression project onto the
// installed Google Chrome (channel: 'chrome'). Run against a backend whose
// STORAGE_PATH points at <repo>/videos (see docker-compose.e2e.mp4.yml).
import type { PlaywrightTestConfig } from '@playwright/test'
import base from './playwright.config'

const projects = (base.projects ?? []).map((p) =>
  p.name === 'regression'
    ? { ...p, use: { ...(p.use ?? {}), channel: 'chrome' as const } }
    : p,
)

const config: PlaywrightTestConfig = { ...base, projects }
export default config
