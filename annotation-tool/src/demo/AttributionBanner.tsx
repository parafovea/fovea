/**
 * Persistent CC-BY attribution banner — mounted by DemoShell across
 * every demo route. This is the load-bearing visible credit for the
 * KEXP source clips per CC-BY-NC-SA 3.0; do not remove without
 * re-sourcing the demo content under a different license.
 *
 * Lives at the top of the viewport as a thin bar that doesn't intrude
 * on the workspace chrome but is unambiguously present and links
 * directly to the full attribution doc. Hidden in presenter mode for
 * clean screen recordings — the recordings themselves carry the
 * attribution via the per-clip ClipAttribution overlay (mounted by
 * DemoShell wherever a clip plays).
 *
 * The banner reads the set of source artists / venues from clips.json
 * so adding a new source means updating the manifest only; the banner
 * picks up the new credit automatically.
 */

import clipsManifest from '../../demo/scripts/clips.json'
import { isPresenterMode } from './mode-flags'

interface ClipsManifest {
  sources: Array<{ id: string; title: string; artist: string; license: string; sourceUrl: string }>
}

const manifest = clipsManifest as ClipsManifest

export function AttributionBanner() {
  if (isPresenterMode()) return null

  // Dedupe by artist — most demos will reuse the same artist across
  // multiple sources (the two KEXP Frahm sessions). Show each artist
  // once with a license tag so the banner stays scannable.
  const credits = Array.from(
    new Map(
      manifest.sources.map((s) => [s.artist, { artist: s.artist, license: s.license }]),
    ).values(),
  )

  if (credits.length === 0) return null

  return (
    <div
      data-demo-attribution-banner=""
      className="w-full bg-muted/70 backdrop-blur border-b text-xs text-muted-foreground"
    >
      <div className="mx-auto max-w-6xl px-4 py-1.5 flex items-center justify-between gap-2">
        <span>
          Demo footage:{' '}
          {credits.map((c, i) => (
            <span key={c.artist}>
              {i > 0 ? ' · ' : ''}
              <span className="font-medium text-foreground">{c.artist}</span> (
              {c.license})
            </span>
          ))}
        </span>
        <a
          href="/docs/demo-attribution"
          target="_blank"
          rel="noreferrer"
          className="underline whitespace-nowrap"
        >
          Sources &amp; attribution
        </a>
      </div>
    </div>
  )
}
