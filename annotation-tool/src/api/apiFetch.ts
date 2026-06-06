/**
 * Single source of truth for cookie-bearing `/api/*` fetches.
 *
 * Every same-origin `/api/*` GET / POST / PUT / PATCH / DELETE issued
 * by the SPA needs to ride along with the session cookie set by the
 * backend during anon-session bootstrap or login. Native `fetch()`
 * does NOT include cookies by default — the omission was the root
 * cause of the 2026-06-05 demo regression where `/api/videos`
 * returned 200 with 99 videos to curl but 401 to the SPA, the
 * VideoBrowser then rendered "No videos found" against a corpus
 * that actually had 99 videos, and every persona-rooted workspace
 * fell back to its empty state because `/api/personas` 401-ed too.
 *
 * Routing every same-origin `/api/*` fetch through this helper
 * removes the chance of an individual caller forgetting
 * `credentials: 'include'`. The helper also threads the request id
 * + content-type defaults so callers don't repeat boilerplate.
 *
 * **Do not import `fetch` directly when calling `/api/*`.** Use
 * apiFetch instead. An eslint rule could enforce this; until then,
 * code review + this comment are the guard.
 */

export interface ApiFetchInit extends Omit<RequestInit, 'credentials'> {
  /**
   * Override the default `credentials: 'include'`. The override is
   * only meaningful for unusual cases (a CORS-with-no-cookies probe
   * for instance); leave unset for every routine `/api/*` call.
   */
  credentials?: RequestCredentials
}

/**
 * Fetch a same-origin `/api/*` URL with cookies included by default.
 * Identical to the global `fetch` otherwise — same return type, same
 * error semantics, same Response object.
 */
export function apiFetch(
  input: string | URL | Request,
  init?: ApiFetchInit,
): Promise<Response> {
  const headers = new Headers(init?.headers ?? {})
  // Default Content-Type only for body-bearing requests where the
  // caller did not set it themselves. The downstream Fastify routes
  // reject body-bearing requests without an explicit content-type
  // even when the body is empty.
  if (
    init?.body !== undefined &&
    !headers.has('Content-Type') &&
    typeof init.body === 'string'
  ) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(input, {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers,
  })
}
