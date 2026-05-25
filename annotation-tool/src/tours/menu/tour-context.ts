/**
 * Tour context value + hook — split out from `TourProvider.tsx` so that
 * file exports React components only (otherwise the Vite react-refresh
 * plugin warns and Fast Refresh stops working in dev for that module).
 */

import { createContext, useContext } from 'react'
import type { TourScript } from '../engine/types'

export interface TourContextValue {
  openMenu: () => void
  closeMenu: () => void
  launch: (tour: TourScript) => void
  active: TourScript | null
}

export const TourContext = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) {
    throw new Error('useTour must be used inside <TourProvider>')
  }
  return ctx
}
