/**
 * ClipAttribution — visible "Source: Nils Frahm, Live at KEXP (CC-BY-NC-SA)"
 * caption that the demo overlays on every video frame.
 *
 * This is load-bearing for CC-BY-NC-SA 3.0's Attribution requirement.
 * The annotated `<video>` element renders this badge as a sibling so
 * presenter mode and tour-runner mode both show it.
 *
 * Reads the clip metadata from `clips.json` at build time (via Vite's
 * JSON import), looks up the clip id, and renders the appropriate
 * source credit + license + link back to docs/demo-attribution.md.
 *
 * If a clip id isn't in the manifest (which shouldn't happen — the
 * fixture seeder references manifest clip ids, and the manifest is
 * the source of truth), the component renders nothing rather than a
 * scary "unknown source" label. The link to the attribution doc is
 * always one click away from the demo footer regardless.
 */

import clipsManifest from '../../demo/scripts/clips.json'

interface ClipsManifest {
  sources: Array<{
    id: string
    title: string
    uploader: string
    sourceUrl: string
    license: string
    licenseUrl: string
    artist: string
  }>
  clips: Array<{ id: string; sourceId: string }>
}

const manifest = clipsManifest as ClipsManifest

export function ClipAttribution({ clipId }: { clipId: string }) {
  const clip = manifest.clips.find((c) => c.id === clipId)
  const source = clip ? manifest.sources.find((s) => s.id === clip.sourceId) : undefined
  if (!source) return null

  return (
    <p
      data-demo-attribution=""
      className="absolute bottom-2 right-2 text-[10px] leading-tight text-white/85 bg-black/55 rounded px-2 py-1 pointer-events-auto"
    >
      Source:{' '}
      <a
        href={source.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {source.artist}, {source.title}
      </a>{' '}
      &nbsp;·&nbsp;{' '}
      <a
        href={source.licenseUrl}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {source.license}
      </a>
      &nbsp;·&nbsp;{' '}
      <a href="/docs/demo-attribution" className="underline">
        attribution
      </a>
    </p>
  )
}
