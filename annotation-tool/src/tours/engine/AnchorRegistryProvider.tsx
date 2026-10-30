import { useMemo, type ReactNode, type ReactElement } from 'react'
import { AnchorRegistry, AnchorRegistryContext } from './anchorRegistry'

/** Provides one anchor registry shared by the engine and its anchored components. */
export function AnchorRegistryProvider({ children }: { children: ReactNode }): ReactElement {
  const registry = useMemo(() => new AnchorRegistry(), [])
  return <AnchorRegistryContext.Provider value={registry}>{children}</AnchorRegistryContext.Provider>
}
