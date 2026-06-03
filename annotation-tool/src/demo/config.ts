/**
 * Frontend-side demo-mode detection. Mirrors the server-side flag (see
 * `server/src/demo/config.ts`), but read from the Vite env so the demo
 * landing page route group can be mounted at build time without the
 * frontend needing a runtime API call to know whether it's the
 * demo deployment.
 *
 * The landing page route group is the only thing this flag gates on the
 * frontend; the in-app tour menu and tour engine are product features
 * that ship in every deployment, demo or not (see plan §6.7).
 *
 * NOTE: by convention, Vite exposes `import.meta.env.VITE_*` vars to the
 * client bundle. Setting `VITE_FOVEA_DEMO_MODE=true` at build time
 * compiles in the demo routes; otherwise the demo module tree is
 * tree-shaken out by the dynamic import in App.tsx.
 */

export function isDemoModeEnabled(): boolean {
  // Cast through unknown: import.meta.env's shape isn't typed by Vite
  // without an ambient declaration, and we don't want to add one just
  // for two strings.
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
  return env.VITE_FOVEA_DEMO_MODE === 'true' || env.VITE_FOVEA_DEMO_MODE === '1'
}
