/**
 * Demo runtime mode flags — read from the URL query string at boot.
 *
 * Two flags the demo deployment respects:
 *
 *   ?presenter=1   Hide the landing-page chrome (no header text, no
 *                  footer, no email-capture). Used for clean screen
 *                  recordings / projector loops. Telemetry routes to a
 *                  no-op endpoint so presenter sessions don't pollute
 *                  the booth's actual abandon-rate analytics.
 *
 *   ?safe=1        Swap live model-service calls in tour fixtures for
 *                  pre-recorded responses. The model-in-the-loop tour
 *                  needs live inference; turn this on at the booth if
 *                  WiFi is flaky and that tile keeps timing out.
 *                  (The actual swap lives in the relevant tour
 *                  scripts / runner hooks; this module just exposes
 *                  the flag so they can read it.)
 *
 * Flags are sticky for the session: read once at module load (via the
 * initial URL), stored in sessionStorage so a soft-nav inside the demo
 * shell doesn't drop them.
 */

const PRESENTER_KEY = 'fovea.demo.presenter'
const SAFE_KEY = 'fovea.demo.safe'

const flags = readFlags()

function readFlags() {
  let presenter = false
  let safe = false
  try {
    const params = new URLSearchParams(window.location.search)
    presenter = params.get('presenter') === '1' || sessionStorage.getItem(PRESENTER_KEY) === '1'
    safe = params.get('safe') === '1' || sessionStorage.getItem(SAFE_KEY) === '1'
    if (presenter) sessionStorage.setItem(PRESENTER_KEY, '1')
    if (safe) sessionStorage.setItem(SAFE_KEY, '1')
  } catch {
    // window/sessionStorage can be missing under SSR or test harnesses.
  }
  return { presenter, safe }
}

export function isPresenterMode(): boolean {
  return flags.presenter
}

export function isSafeMode(): boolean {
  return flags.safe
}
