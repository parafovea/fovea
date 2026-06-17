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
 * NOTE: by convention, Vite exposes `VITE_*` vars to the client bundle.
 * Setting `VITE_FOVEA_DEMO_MODE=true` at build time compiles in the demo
 * routes; otherwise the demo module tree is tree-shaken out by the dynamic
 * import in App.tsx. The flag is resolved centrally in `src/config.ts`.
 */

import { config } from '@/config'

export function isDemoModeEnabled(): boolean {
  return config.deploymentMode.legacyDemoShell
}
