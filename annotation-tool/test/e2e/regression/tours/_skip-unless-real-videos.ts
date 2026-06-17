import { test } from '../../fixtures/test-context.js'

/**
 * The end-to-end tour walkthroughs in this directory drive the real
 * microvent MP4 corpus (each tour navigates to `/app/annotate/<videoId>`
 * where `videoId = md5(filename)[0:16]` of a file in `<repo>/videos`).
 * Running them requires a backend whose STORAGE_PATH points at that corpus
 * AND a browser channel that can decode H.264 (`channel: 'chrome'`), as
 * documented in each spec header.
 *
 * The default docker E2E stack mounts only the royalty-free webm test
 * fixtures (dust-storm / mummy-dust) into Playwright's bundled Chromium,
 * which cannot decode H.264 — so the tour's annotate route never mounts a
 * video and the walkthrough cannot proceed. Detect that environment by the
 * absence of any synced `.mp4` video and skip the walkthrough there rather
 * than fail; the spec runs unchanged against the documented local setup.
 *
 * This mirrors the skip guard the public-demo tour specs use to defer to a
 * real demo deployment instead of failing against the multi-user stack.
 */
export async function skipUnlessRealVideoCorpus(
  page: import('@playwright/test').Page,
  sessionToken: string,
): Promise<void> {
  let hasMp4 = false
  try {
    const res = await page.request.get('http://localhost:3001/api/videos', {
      headers: { Cookie: `session_token=${sessionToken}` },
    })
    if (res.ok()) {
      const videos = (await res.json()) as Array<{ path?: string; filename?: string }>
      hasMp4 =
        Array.isArray(videos) &&
        videos.some((v) =>
          (v.path ?? v.filename ?? '').toLowerCase().endsWith('.mp4'),
        )
    }
  } catch {
    hasMp4 = false
  }
  test.skip(
    !hasMp4,
    'Real MP4 video corpus not synced into the backend — this end-to-end tour ' +
      'walkthrough needs STORAGE_PATH=<repo>/videos and a H.264-capable browser ' +
      '(channel: chrome); see the spec header.',
  )
}
