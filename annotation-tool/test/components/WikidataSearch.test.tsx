import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import WikidataSearch from '../../src/components/WikidataSearch'

// Mock the wikidataApi module
vi.mock('../../src/services/wikidataApi', () => ({
  searchWikidata: vi.fn().mockResolvedValue([]),
  getWikidataEntity: vi.fn().mockResolvedValue(null),
  extractWikidataInfo: vi.fn().mockReturnValue(null),
}))

// Mock lodash debounce to execute immediately
vi.mock('lodash/debounce', () => ({
  default: (fn: (query: string) => Promise<void>) => fn,
}))

describe('WikidataSearch', () => {
  const defaultProps = {
    onImport: vi.fn(),
    entityType: 'type' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Help Text Labels', () => {
    it('displays "entity types" for entity-type import', () => {
      render(<WikidataSearch {...defaultProps} importType="entity-type" />)

      expect(screen.getByText(/import entity types into your ontology/i)).toBeInTheDocument()
    })

    it('displays "event types" for event-type import', () => {
      render(<WikidataSearch {...defaultProps} importType="event-type" />)

      expect(screen.getByText(/import event types into your ontology/i)).toBeInTheDocument()
    })

    it('displays "role types" for role-type import', () => {
      render(<WikidataSearch {...defaultProps} importType="role-type" />)

      expect(screen.getByText(/import role types into your ontology/i)).toBeInTheDocument()
    })

    it('displays "relation types" for relation-type import', () => {
      render(<WikidataSearch {...defaultProps} importType="relation-type" />)

      expect(screen.getByText(/import relation types into your ontology/i)).toBeInTheDocument()
    })

    it('displays "entities" for entity import', () => {
      render(<WikidataSearch {...defaultProps} entityType="object" importType="entity" />)

      expect(screen.getByText(/import entities into your ontology/i)).toBeInTheDocument()
    })

    it('displays "events" for event import', () => {
      render(<WikidataSearch {...defaultProps} entityType="object" importType="event" />)

      expect(screen.getByText(/import events into your ontology/i)).toBeInTheDocument()
    })

    it('displays "locations" for location import', () => {
      render(<WikidataSearch {...defaultProps} entityType="object" importType="location" />)

      expect(screen.getByText(/import locations into your ontology/i)).toBeInTheDocument()
    })

    it('displays "temporal data" for time import', () => {
      render(<WikidataSearch {...defaultProps} entityType="time" importType="time" />)

      expect(screen.getByText(/import temporal data into your ontology/i)).toBeInTheDocument()
    })

    it('displays generic "items" when importType is not provided', () => {
      render(<WikidataSearch {...defaultProps} />)

      expect(screen.getByText(/import items into your ontology/i)).toBeInTheDocument()
    })
  })

  describe('Placeholder Text', () => {
    it('shows entity type placeholder for entity-type import', () => {
      render(<WikidataSearch {...defaultProps} importType="entity-type" />)

      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('concepts'))
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('Person'))
    })

    it('shows event type placeholder for event-type import', () => {
      render(<WikidataSearch {...defaultProps} importType="event-type" />)

      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('event concepts'))
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('Protest'))
    })

    it('shows role type placeholder for role-type import', () => {
      render(<WikidataSearch {...defaultProps} importType="role-type" />)

      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('role concepts'))
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('Participant'))
    })

    it('shows relation type placeholder for relation-type import', () => {
      render(<WikidataSearch {...defaultProps} importType="relation-type" />)

      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('relation concepts'))
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('Part of'))
    })

    it('shows generic placeholder when importType is not provided', () => {
      render(<WikidataSearch {...defaultProps} />)

      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('items'))
    })
  })
})
