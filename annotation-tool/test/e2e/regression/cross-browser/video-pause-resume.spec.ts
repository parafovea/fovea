import { test, expect } from '../../fixtures/test-context.js'

/**
 * Cross-browser regression coverage for video playback when paused and
 * resumed in the annotation workspace. These specs run under chromium,
 * webkit, and firefox (see the `video-*` projects in playwright.config.ts)
 * because the failure they guard against was WebKit-only: paused videos
 * blacked out and jumped position on resume while Chrome played fine.
 *
 * Two root causes are covered:
 *
 * 1. The stream endpoint crashed on the suffix / open-ended `Range` requests
 *    WebKit issues (Chrome rarely does), so the media element received an
 *    error mid-playback and blacked out. The range specs assert the endpoint
 *    answers those requests correctly across every engine.
 * 2. The paused frame must stay decoded and the playhead must not jump, which
 *    the interaction spec verifies directly.
 */
test.describe('Video pause and resume', () => {
  test('serves the suffix and edge byte ranges WebKit requests', async ({
    annotationWorkspace,
    testUser,
    testPersona,
    testVideo,
  }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    const streamUrl = `/api/videos/${testVideo.id}/stream`

    // Suffix range: the last N bytes (WebKit uses this to read the trailing
    // moov atom). The old parser produced NaN bounds and 404'd the request.
    const suffix = await annotationWorkspace.page.request.get(streamUrl, {
      headers: { Range: 'bytes=-1024' },
    })
    expect(suffix.status()).toBe(206)
    const suffixBody = await suffix.body()
    expect(suffixBody.length).toBe(1024)
    const suffixRange = suffix.headers()['content-range']
    expect(suffixRange).toMatch(/^bytes \d+-\d+\/\d+$/)
    const [, end, total] = suffixRange.match(/^bytes \d+-(\d+)\/(\d+)$/)!
    expect(Number(end)).toBe(Number(total) - 1)

    // A plain bounded probe range stays correct.
    const probe = await annotationWorkspace.page.request.get(streamUrl, {
      headers: { Range: 'bytes=0-1' },
    })
    expect(probe.status()).toBe(206)
    expect((await probe.body()).length).toBe(2)

    // A range that starts past EOF is unsatisfiable: 416 (not a 404 that
    // strict clients treat as a fatal media error).
    const past = await annotationWorkspace.page.request.get(streamUrl, {
      headers: { Range: 'bytes=999999999-' },
    })
    expect(past.status()).toBe(416)
    expect(past.headers()['content-range']).toMatch(/^bytes \*\/\d+$/)
  })

  test('keeps the frame decoded and the playhead steady across pause/resume', async ({
    annotationWorkspace,
    page,
    testUser,
    testPersona,
    testVideo,
  }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    const video = annotationWorkspace.video

    // Play and let real playback advance so there is a decoded frame and a
    // non-zero playhead to freeze.
    await video.play()
    await video.waitForPlaying()
    await expect
      .poll(async () => video.getCurrentTime(), { timeout: 5000 })
      .toBeGreaterThan(0.1)
    const timeAtPause = await video.getCurrentTime()

    await video.pause()
    await expect(video.videoElement).toHaveJSProperty('paused', true)

    // The playhead must not jump on pause.
    const timeAfterPause = await video.getCurrentTime()
    expect(Math.abs(timeAfterPause - timeAtPause)).toBeLessThan(0.5)

    // The paused frame must still be decoded. drawImage reads the decoder
    // surface, so a non-black sample proves the source did not error out and
    // tear down the frame (the WebKit black-out failure mode). The video is
    // served same-origin through the app proxy, so the canvas is not tainted.
    const frame = await video.videoElement.evaluate((v: HTMLVideoElement) => {
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !v.videoWidth) return { ok: false, brightness: -1 }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let sum = 0
      // Sample a sparse grid of pixels; the test fixture footage is not black.
      for (let i = 0; i < data.length; i += 4 * 997) {
        sum += data[i] + data[i + 1] + data[i + 2]
      }
      return { ok: true, brightness: sum }
    })
    expect(frame.ok).toBe(true)
    expect(frame.brightness).toBeGreaterThan(0)

    // Resume continues from where it paused rather than seeking seconds away.
    await video.play()
    await video.waitForPlaying()
    const timeOnResume = await video.getCurrentTime()
    expect(timeOnResume).toBeGreaterThanOrEqual(timeAfterPause - 0.5)
    expect(timeOnResume).toBeLessThan(timeAfterPause + 1.0)

    await page.waitForTimeout(200)
  })
})
