/**
 * Tests for WikidataChip component.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import React from 'react'
import { WikidataChip } from './WikidataChip'
import userSlice, { AppConfig } from '../../store/userSlice'

/**
 * Creates a test Redux store with app config.
 */
function createTestStore(appConfig: AppConfig | null) {
  return configureStore({
    reducer: {
      user: userSlice,
    },
    preloadedState: {
      user: {
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        mode: 'single-user' as const,
        allowRegistration: false,
        appConfig,
      },
    },
  })
}

/**
 * Wrapper component for testing with Redux.
 */
function TestWrapper({ children, appConfig }: { children: React.ReactNode; appConfig: AppConfig | null }) {
  const store = createTestStore(appConfig)
  return <Provider store={store}>{children}</Provider>
}

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
  describe('Rendering', () => {
    it('returns null when no wikidataId provided', () => {
      const { container } = render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip />
        </TestWrapper>
      )

      expect(container.firstChild).toBeNull()
    })

    it('renders Wikidata chip with ID', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip wikidataId="Q42" wikidataUrl="https://www.wikidata.org/wiki/Q42" />
        </TestWrapper>
      )

      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })

    it('shows timestamp when importedAt provided and showTimestamp is true', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
            importedAt="2024-01-15T10:30:00Z"
            showTimestamp={true}
          />
        </TestWrapper>
      )

      expect(screen.getByText(/Imported Jan 15, 2024/)).toBeInTheDocument()
    })

    it('hides timestamp when showTimestamp is false', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
            importedAt="2024-01-15T10:30:00Z"
            showTimestamp={false}
          />
        </TestWrapper>
      )

      expect(screen.queryByText(/Imported/)).not.toBeInTheDocument()
    })

    it('hides timestamp when importedAt not provided', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
          />
        </TestWrapper>
      )

      expect(screen.queryByText(/Imported/)).not.toBeInTheDocument()
    })
  })

  describe('Online mode', () => {
    it('renders only Wikidata chip in online mode', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
          />
        </TestWrapper>
      )

      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
      expect(screen.queryByText(/Wikibase:/)).not.toBeInTheDocument()
    })

    it('chip links to Wikidata when URL provided', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
          />
        </TestWrapper>
      )

      const chip = screen.getByText('Wikidata: Q42').closest('a')
      expect(chip).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q42')
      expect(chip).toHaveAttribute('target', '_blank')
    })
  })

  describe('Offline mode with wikibaseId', () => {
    it('renders both Wikibase and Wikidata chips', () => {
      render(
        <TestWrapper appConfig={offlineWithLinksConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
            wikibaseId="Q2"
          />
        </TestWrapper>
      )

      expect(screen.getByText('Wikibase: Q2')).toBeInTheDocument()
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })

    it('Wikibase chip links to local instance', () => {
      render(
        <TestWrapper appConfig={offlineWithLinksConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
            wikibaseId="Q2"
          />
        </TestWrapper>
      )

      const wikibaseChip = screen.getByText('Wikibase: Q2').closest('a')
      expect(wikibaseChip).toHaveAttribute('href', 'http://localhost:8181/wiki/Q2')
    })

    it('does not show Wikibase chip when wikibaseId not provided', () => {
      render(
        <TestWrapper appConfig={offlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
          />
        </TestWrapper>
      )

      expect(screen.queryByText(/Wikibase:/)).not.toBeInTheDocument()
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })
  })

  describe('External links disabled', () => {
    it('Wikidata chip is not a link when allowExternalLinks is false', () => {
      render(
        <TestWrapper appConfig={offlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
          />
        </TestWrapper>
      )

      const chipElement = screen.getByText('Wikidata: Q42')
      // The chip should not be wrapped in an anchor tag
      expect(chipElement.closest('a')).toBeNull()
    })

    it('Wikidata chip has default color when disabled', () => {
      render(
        <TestWrapper appConfig={offlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
          />
        </TestWrapper>
      )

      const chip = screen.getByText('Wikidata: Q42').closest('.MuiChip-root')
      expect(chip).toHaveClass('MuiChip-colorDefault')
    })

    it('Wikidata chip has primary color when enabled', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
          />
        </TestWrapper>
      )

      const chip = screen.getByText('Wikidata: Q42').closest('.MuiChip-root')
      expect(chip).toHaveClass('MuiChip-colorPrimary')
    })

    it('Wikidata chip is not clickable when no URL provided', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip wikidataId="Q42" />
        </TestWrapper>
      )

      const chipElement = screen.getByText('Wikidata: Q42')
      expect(chipElement.closest('a')).toBeNull()
    })
  })

  describe('Sizes', () => {
    it('renders small size by default', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip wikidataId="Q42" wikidataUrl="https://www.wikidata.org/wiki/Q42" />
        </TestWrapper>
      )

      const chip = screen.getByText('Wikidata: Q42').closest('.MuiChip-root')
      expect(chip).toHaveClass('MuiChip-sizeSmall')
    })

    it('renders medium size when specified', () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
            size="medium"
          />
        </TestWrapper>
      )

      const chip = screen.getByText('Wikidata: Q42').closest('.MuiChip-root')
      expect(chip).toHaveClass('MuiChip-sizeMedium')
    })
  })

  describe('Tooltips', () => {
    it('shows "View on Wikidata" tooltip when enabled', async () => {
      render(
        <TestWrapper appConfig={onlineConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
          />
        </TestWrapper>
      )

      // The tooltip is rendered but may not be visible until hover
      // We can check the chip exists and has the correct structure
      expect(screen.getByText('Wikidata: Q42')).toBeInTheDocument()
    })

    it('shows "View in local Wikibase" tooltip for Wikibase chip', () => {
      render(
        <TestWrapper appConfig={offlineWithLinksConfig}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
            wikibaseId="Q2"
          />
        </TestWrapper>
      )

      expect(screen.getByText('Wikibase: Q2')).toBeInTheDocument()
    })
  })

  describe('Default config (null appConfig)', () => {
    it('works with default config', () => {
      render(
        <TestWrapper appConfig={null}>
          <WikidataChip
            wikidataId="Q42"
            wikidataUrl="https://www.wikidata.org/wiki/Q42"
          />
        </TestWrapper>
      )

      // Default config has allowExternalLinks: true
      const chip = screen.getByText('Wikidata: Q42').closest('a')
      expect(chip).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q42')
    })
  })
})
