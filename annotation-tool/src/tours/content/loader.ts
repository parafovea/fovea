/**
 * Tour content loader.
 *
 * Admin tailoring path:
 *   1. Drop your video files into the deployment's STORAGE_PATH
 *      directory (the same directory the backend serves clips from).
 *   2. Trigger /api/videos/sync so Fovea registers Video rows for
 *      each file. videoIds are derived from md5(filename)[0:16].
 *   3. Edit `annotation-tool/public/tour-content.json` to reference
 *      the video FILENAMES you want each tour to use (the JSON
 *      Schema at /tour-content.schema.json gives IDE autocomplete).
 *   4. Reload. the loader picks up the JSON at boot, computes
 *      videoIds from the filenames, and hands the resolved bundle
 *      to TourProvider.
 *
 * No code edit, no rebuild, no TypeScript fork. The JSON file is the
 * complete admin surface.
 */

import type { TourContentBundle } from './types'

/**
 * Compute the videoId Fovea will assign to a file with this filename.
 * Mirrors `server/src/services/videoSync.ts:createVideoId` so the
 * admin can reference videos by filename in tour-content.json and
 * the loader resolves to the same id the backend writes.
 */
async function videoIdFromFilename(filename: string): Promise<string> {
  const bytes = new TextEncoder().encode(filename)
  const digest = await crypto.subtle.digest('MD5', bytes)
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex.slice(0, 16)
}

/**
 * Browser fallback for the (rare) UA without crypto.subtle MD5
 * support. node-style hash via a small pure-JS implementation. The
 * one in use here is documented at https://www.myersdaily.org/joseph/
 * javascript/md5-text.html; reproduced inline so the loader has no
 * runtime dependency.
 */
function md5SyncHex(input: string): string {
  // ---- start MD5 implementation (public-domain) ----
  function add32(a: number, b: number): number {
    return (a + b) & 0xffffffff
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    a = add32(add32(a, q), add32(x, t))
    return add32((a << s) | (a >>> (32 - s)), b)
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t)
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t)
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t)
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t)
  }
  function md5cycle(x: number[], k: number[]): void {
    let [a, b, c, d] = x
    a = ff(a, b, c, d, k[0], 7, -680876936)
    d = ff(d, a, b, c, k[1], 12, -389564586)
    c = ff(c, d, a, b, k[2], 17, 606105819)
    b = ff(b, c, d, a, k[3], 22, -1044525330)
    a = ff(a, b, c, d, k[4], 7, -176418897)
    d = ff(d, a, b, c, k[5], 12, 1200080426)
    c = ff(c, d, a, b, k[6], 17, -1473231341)
    b = ff(b, c, d, a, k[7], 22, -45705983)
    a = ff(a, b, c, d, k[8], 7, 1770035416)
    d = ff(d, a, b, c, k[9], 12, -1958414417)
    c = ff(c, d, a, b, k[10], 17, -42063)
    b = ff(b, c, d, a, k[11], 22, -1990404162)
    a = ff(a, b, c, d, k[12], 7, 1804603682)
    d = ff(d, a, b, c, k[13], 12, -40341101)
    c = ff(c, d, a, b, k[14], 17, -1502002290)
    b = ff(b, c, d, a, k[15], 22, 1236535329)
    a = gg(a, b, c, d, k[1], 5, -165796510)
    d = gg(d, a, b, c, k[6], 9, -1069501632)
    c = gg(c, d, a, b, k[11], 14, 643717713)
    b = gg(b, c, d, a, k[0], 20, -373897302)
    a = gg(a, b, c, d, k[5], 5, -701558691)
    d = gg(d, a, b, c, k[10], 9, 38016083)
    c = gg(c, d, a, b, k[15], 14, -660478335)
    b = gg(b, c, d, a, k[4], 20, -405537848)
    a = gg(a, b, c, d, k[9], 5, 568446438)
    d = gg(d, a, b, c, k[14], 9, -1019803690)
    c = gg(c, d, a, b, k[3], 14, -187363961)
    b = gg(b, c, d, a, k[8], 20, 1163531501)
    a = gg(a, b, c, d, k[13], 5, -1444681467)
    d = gg(d, a, b, c, k[2], 9, -51403784)
    c = gg(c, d, a, b, k[7], 14, 1735328473)
    b = gg(b, c, d, a, k[12], 20, -1926607734)
    a = hh(a, b, c, d, k[5], 4, -378558)
    d = hh(d, a, b, c, k[8], 11, -2022574463)
    c = hh(c, d, a, b, k[11], 16, 1839030562)
    b = hh(b, c, d, a, k[14], 23, -35309556)
    a = hh(a, b, c, d, k[1], 4, -1530992060)
    d = hh(d, a, b, c, k[4], 11, 1272893353)
    c = hh(c, d, a, b, k[7], 16, -155497632)
    b = hh(b, c, d, a, k[10], 23, -1094730640)
    a = hh(a, b, c, d, k[13], 4, 681279174)
    d = hh(d, a, b, c, k[0], 11, -358537222)
    c = hh(c, d, a, b, k[3], 16, -722521979)
    b = hh(b, c, d, a, k[6], 23, 76029189)
    a = hh(a, b, c, d, k[9], 4, -640364487)
    d = hh(d, a, b, c, k[12], 11, -421815835)
    c = hh(c, d, a, b, k[15], 16, 530742520)
    b = hh(b, c, d, a, k[2], 23, -995338651)
    a = ii(a, b, c, d, k[0], 6, -198630844)
    d = ii(d, a, b, c, k[7], 10, 1126891415)
    c = ii(c, d, a, b, k[14], 15, -1416354905)
    b = ii(b, c, d, a, k[5], 21, -57434055)
    a = ii(a, b, c, d, k[12], 6, 1700485571)
    d = ii(d, a, b, c, k[3], 10, -1894986606)
    c = ii(c, d, a, b, k[10], 15, -1051523)
    b = ii(b, c, d, a, k[1], 21, -2054922799)
    a = ii(a, b, c, d, k[8], 6, 1873313359)
    d = ii(d, a, b, c, k[15], 10, -30611744)
    c = ii(c, d, a, b, k[6], 15, -1560198380)
    b = ii(b, c, d, a, k[13], 21, 1309151649)
    a = ii(a, b, c, d, k[4], 6, -145523070)
    d = ii(d, a, b, c, k[11], 10, -1120210379)
    c = ii(c, d, a, b, k[2], 15, 718787259)
    b = ii(b, c, d, a, k[9], 21, -343485551)
    x[0] = add32(a, x[0])
    x[1] = add32(b, x[1])
    x[2] = add32(c, x[2])
    x[3] = add32(d, x[3])
  }
  function md5blk(s: string): number[] {
    const md5blks: number[] = []
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] =
        s.charCodeAt(i) +
        (s.charCodeAt(i + 1) << 8) +
        (s.charCodeAt(i + 2) << 16) +
        (s.charCodeAt(i + 3) << 24)
    }
    return md5blks
  }
  function md51(s: string): number[] {
    const n = s.length
    const state = [1732584193, -271733879, -1732584194, 271733878]
    let i: number
    for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)))
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const rest = s.substring(i - 64)
    let j = 0
    for (j = 0; j < rest.length; j++) {
      tail[j >> 2] |= rest.charCodeAt(j) << (j % 4 << 3)
    }
    tail[j >> 2] |= 0x80 << (j % 4 << 3)
    if (j > 55) {
      md5cycle(state, tail)
      for (let k = 0; k < 16; k++) tail[k] = 0
    }
    tail[14] = n * 8
    md5cycle(state, tail)
    return state
  }
  function rhex(n: number): string {
    const hex_chr = '0123456789abcdef'
    let s = ''
    for (let j = 0; j < 4; j++) {
      s +=
        hex_chr.charAt((n >> (j * 8 + 4)) & 0x0f) +
        hex_chr.charAt((n >> (j * 8)) & 0x0f)
    }
    return s
  }
  // Encode as UTF-8 first so non-ASCII filenames hash the same way
  // node's createHash('md5').update(filename, 'utf-8') does.
  function utf8(s: string): string {
    return unescape(encodeURIComponent(s))
  }
  const state = md51(utf8(input))
  return state.map(rhex).join('')
  // ---- end MD5 implementation ----
}

async function resolveVideoId(filename: string): Promise<string> {
  // Prefer the platform crypto API where available (modern browsers
  // + node 18+). Fall back to the pure-JS implementation if MD5
  // isn't supported (some browsers omit MD5 from subtle.digest).
  try {
    return await videoIdFromFilename(filename)
  } catch {
    return md5SyncHex(filename).slice(0, 16)
  }
}

/**
 * The on-disk JSON shape. same as TourContentBundle but with
 * videoFilename in place of videoId. The loader transforms one to
 * the other so the rest of the codebase only sees TourContentBundle.
 */
export interface TourContentBundleRaw {
  $schema?: string
  firstAnnotation: Omit<TourContentBundle['firstAnnotation'], 'videoId'> & {
    videoFilename: string
  }
  ontologyAuthoring: TourContentBundle['ontologyAuthoring']
  wikidataAugmentation: TourContentBundle['wikidataAugmentation']
  eventsRolesClaims: Omit<TourContentBundle['eventsRolesClaims'], 'videoId'> & {
    videoFilename: string
  }
  worldLayer: Omit<TourContentBundle['worldLayer'], 'videoId'> & {
    videoFilename: string
  }
  modelInTheLoop: Omit<TourContentBundle['modelInTheLoop'], 'videoId'> & {
    videoFilename: string
  }
  summariesAndClaims: Omit<TourContentBundle['summariesAndClaims'], 'videoId'> & {
    videoFilename: string
  }
  collaboration: TourContentBundle['collaboration']
  importExport: TourContentBundle['importExport']
}

async function resolveBundle(raw: TourContentBundleRaw): Promise<TourContentBundle> {
  const [v1, v4, v5, v6, v7] = await Promise.all([
    resolveVideoId(raw.firstAnnotation.videoFilename),
    resolveVideoId(raw.eventsRolesClaims.videoFilename),
    resolveVideoId(raw.worldLayer.videoFilename),
    resolveVideoId(raw.modelInTheLoop.videoFilename),
    resolveVideoId(raw.summariesAndClaims.videoFilename),
  ])
  return {
    firstAnnotation: { ...raw.firstAnnotation, videoFilename: raw.firstAnnotation.videoFilename, videoId: v1 } as unknown as TourContentBundle['firstAnnotation'],
    ontologyAuthoring: raw.ontologyAuthoring,
    wikidataAugmentation: raw.wikidataAugmentation,
    eventsRolesClaims: { ...raw.eventsRolesClaims, videoId: v4 } as unknown as TourContentBundle['eventsRolesClaims'],
    worldLayer: { ...raw.worldLayer, videoId: v5 } as unknown as TourContentBundle['worldLayer'],
    modelInTheLoop: { ...raw.modelInTheLoop, videoId: v6 } as unknown as TourContentBundle['modelInTheLoop'],
    summariesAndClaims: { ...raw.summariesAndClaims, videoId: v7 } as unknown as TourContentBundle['summariesAndClaims'],
    collaboration: raw.collaboration,
    importExport: raw.importExport,
  }
}

/**
 * Boot-time fetch of /tour-content.json. THROWS on missing or invalid
 * file. silent fallback to a bundled default would be worse than
 * useless because the default references videos a different
 * deployment doesn't have, which means the booth visitor lands on
 * /annotate/{some-video-id-not-in-this-deployment} and stares at a
 * 404 instead of the running example.
 *
 * The shipped public/tour-content.json file ensures every fresh
 * deployment has a starting bundle (microvent's Phillies-Karen
 * running example). admins REPLACE that file with their own JSON
 * for their domain. Deletion or corruption raises a visible error
 * at boot so the admin knows the configuration is broken.
 */
export class TourContentLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'TourContentLoadError'
  }
}

export async function loadTourContentBundle(): Promise<TourContentBundle> {
  let response: Response
  try {
    response = await fetch('/tour-content.json', { cache: 'no-store' })
  } catch (err) {
    throw new TourContentLoadError(
      '/tour-content.json is unreachable. See docs/tour-customization.md.',
      err,
    )
  }
  if (!response.ok) {
    throw new TourContentLoadError(
      `/tour-content.json fetch failed (${response.status}). The file must exist at the annotation-tool's public/ root; see docs/tour-customization.md.`,
    )
  }
  let raw: TourContentBundleRaw
  try {
    raw = (await response.json()) as TourContentBundleRaw
  } catch (err) {
    throw new TourContentLoadError(
      '/tour-content.json is not valid JSON. Validate against /tour-content.schema.json and reload.',
      err,
    )
  }
  try {
    return await resolveBundle(raw)
  } catch (err) {
    throw new TourContentLoadError(
      '/tour-content.json is structurally invalid (missing required slots or wrong field shapes). See /tour-content.schema.json for the contract.',
      err,
    )
  }
}

/**
 * In-process fallback for tests + dev tooling that need the default
 * microvent bundle without an HTTP round-trip. NOT used by main.tsx.
 */
export { microventContent } from './microvent'
