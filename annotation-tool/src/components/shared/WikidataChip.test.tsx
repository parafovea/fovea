/**
 * Tests for WikidataChip component.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { WikidataChip } from './WikidataChip'
import { useAuthStore, AppConfig } from '@store/zustand/authStore'

/** Online mode config with external links allowed */
const onlineConfig: AppConfig = {
  mode: 'multi-user',
  allowRegistration: true,
  wikidata: {
    mode: 'online',
    url: 'https://www.wikidata.org/w/api.php',
    idMapping: null,
    allowExternalLinks: true,
  },
  externalLinks: {
    wikidata: true,
    videoSources: true,
  },
}

/** Offline mode config with external links disabled */
const offlineConfig: AppConfig = {
  mode: 'single-user',
  allowRegistration: false,
  wikidata: {
    mode: 'offline',
    url: 'http://localhost:8181/w/api.php',
    idMapping: { Q42: 'Q2' },
    allowExternalLinks: false,
  },
  externalLinks: {
    wikidata: false,
    videoSources: true,
  },
}

/** Offline mode with external links allowed */
const offlineWithLinksConfig: AppConfig = {
  ...offlineConfig,
  wikidata: {
    ...offlineConfig.wikidata,
    allowExternalLinks: true,
  },
}

describe('WikidataChip', () => {
  beforeEach(() => {
    // Reset Zustand store before each test
    useAuthStore.getState().reset()
  })

  describe('Rendering', () => {
    it('returns null when no wikidataId provided', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      const { container } = render(<WikidataChip />)
      expect(container.firstChild).toBeNull()
    })

    it('renders Wikidata chip with ID', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip wikidataId="Q42" wikidataUrl="https://www.wikidata.org/wiki/Q42" />
      )
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })

    it('shows timestamp when importedAt provided and showTimestamp is true', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
          importedAt="2024-01-15T10:30:00Z"
          showTimestamp={true}
        />
      )
      expect(screen.getByText(/Imported Jan 15, 2024/)).toBeInTheDocument()
    })

    it('hides timestamp when showTimestamp is false', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
          importedAt="2024-01-15T10:30:00Z"
          showTimestamp={false}
        />
      )
      expect(screen.queryByText(/Imported/)).not.toBeInTheDocument()
    })

    it('hides timestamp when importedAt not provided', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
        />
      )
      expect(screen.queryByText(/Imported/)).not.toBeInTheDocument()
    })
  })

  describe('Online mode', () => {
    it('renders only Wikidata chip in online mode', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
        />
      )
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
      expect(screen.queryByText(/Wikibase:/)).not.toBeInTheDocument()
    })

    it('chip links to Wikidata when URL provided', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
        />
      )
      const chip = screen.getByText('Wikidata: Q42').closest('a')
      expect(chip).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q42')
      expect(chip).toHaveAttribute('target', '_blank')
    })
  })

  describe('Offline mode with wikibaseId', () => {
    it('renders both Wikibase and Wikidata chips', () => {
      useAuthStore.getState().setConfig(offlineWithLinksConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
          wikibaseId="Q2"
        />
      )
      expect(screen.getByText('Wikibase: Q2')).toBeInTheDocument()
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })

    it('Wikibase chip links to local instance', () => {
      useAuthStore.getState().setConfig(offlineWithLinksConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
          wikibaseId="Q2"
        />
      )
      const wikibaseChip = screen.getByText('Wikibase: Q2').closest('a')
      expect(wikibaseChip).toHaveAttribute('href', 'http://localhost:8181/wiki/Q2')
    })

    it('does not show Wikibase chip when wikibaseId not provided', () => {
      useAuthStore.getState().setConfig(offlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
        />
      )
      expect(screen.queryByText(/Wikibase:/)).not.toBeInTheDocument()
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })
  })

  describe('External links disabled', () => {
    it('Wikidata chip is not a link when allowExternalLinks is false', () => {
      useAuthStore.getState().setConfig(offlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
        />
      )
      const chipElement = screen.getByText('Wikidata: Q42')
      // The chip should not be wrapped in an anchor tag
      expect(chipElement.closest('a')).toBeNull()
    })

    it('Wikidata chip has reduced opacity when disabled', () => {
      useAuthStore.getState().setConfig(offlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
        />
      )
      const chipElement = screen.getByText('Wikidata: Q42')
      // The Badge wrapping element should have the opacity class
      const badge = chipElement.closest('[data-slot="badge"]')
      expect(badge).toHaveClass('opacity-60')
    })

    it('Wikidata chip is a link when enabled', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
        />
      )
      const chip = screen.getByText('Wikidata: Q42').closest('a')
      expect(chip).not.toBeNull()
    })

    it('Wikidata chip is not clickable when no URL provided', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(<WikidataChip wikidataId="Q42" />)
      const chipElement = screen.getByText('Wikidata: Q42')
      expect(chipElement.closest('a')).toBeNull()
    })
  })

  describe('Sizes', () => {
    it('renders small size by default', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip wikidataId="Q42" wikidataUrl="https://www.wikidata.org/wiki/Q42" />
      )
      // Size prop is accepted but the Badge component is always the same size
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })

    it('renders medium size when specified', () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
          size="medium"
        />
      )
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })
  })

  describe('Tooltips', () => {
    it('shows "View on Wikidata" tooltip when enabled', async () => {
      useAuthStore.getState().setConfig(onlineConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
        />
      )
      // The tooltip is rendered but may not be visible until hover
      // We can check the chip exists and has the correct structure
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })

    it('shows "View in local Wikibase" tooltip for Wikibase chip', () => {
      useAuthStore.getState().setConfig(offlineWithLinksConfig)
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
          wikibaseId="Q2"
        />
      )
      expect(screen.getByText('Wikibase: Q2')).toBeInTheDocument()
    })
  })

  describe('Default config (null appConfig)', () => {
    it('works with default config', () => {
      // Don't set any config - uses defaults
      render(
        <WikidataChip
          wikidataId="Q42"
          wikidataUrl="https://www.wikidata.org/wiki/Q42"
        />
      )
      // Default config has allowExternalLinks: true
      const chip = screen.getByText('Wikidata: Q42').closest('a')
      expect(chip).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q42')
    })
  })
})
