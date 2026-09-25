/**
 * Tests for the Layout component's Draft Claim chip.
 *
 * Tests that the "Draft Claim" chip renders when a draft is present
 * in the claimsUiStore, and disappears when cleared.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useClaimsUiStore } from '@store/zustand/claimsUiStore'
import type { DraftClaim } from '@store/zustand/claimsUiStore'
import type { GlossItem } from '@models/types'
import Layout from './Layout'

// Mock heavy dependencies that Layout imports but are not needed for chip tests
vi.mock('@store/queries', () => ({
  usePersonas: vi.fn(() => ({ data: [] })),
  useAllPersonaOntologies: vi.fn(() => ({ data: [] })),
  useWorld: vi.fn(() => ({ data: undefined })),
}))

vi.mock('@store/queries/useProjects', () => ({
  useMyProjects: vi.fn(() => ({ data: [] })),
}))

vi.mock('@hooks/commands', () => ({
  useCommands: vi.fn(),
  useCommandContext: vi.fn(),
}))

vi.mock('@services/api', () => ({
  api: { saveOntology: vi.fn() },
}))

vi.mock('@components/shared/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: () => null,
}))

vi.mock('@components/shared/BreadcrumbNavigation', () => ({
  BreadcrumbNavigation: () => null,
}))

vi.mock('@components/data-management/ImportDataDialog', () => ({
  ImportDataDialog: () => null,
}))

vi.mock('@components/data-management/ExportDialog', () => ({
  ExportDialog: () => null,
}))

vi.mock('@components/data-management/ImportCorpusDialog', () => ({
  ImportCorpusDialog: () => null,
}))

vi.mock('@components/data-management/ExportLayersDialog', () => ({
  ExportLayersDialog: () => null,
}))

vi.mock('@components/auth/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}))

vi.mock('@components/settings/UserSettingsDialog', () => ({
  default: () => null,
}))

vi.mock('@components/settings/ModelSettingsDialog', () => ({
  default: () => null,
}))

vi.mock('@components/settings/AboutDialog', () => ({
  default: () => null,
}))

vi.mock('@components/settings/AdminPanelDialog', () => ({
  default: () => null,
}))

/**
 * Creates a test DraftClaim with required fields.
 */
function createTestDraft(): DraftClaim {
  return {
    gloss: [{ type: 'text', content: 'Draft content' }] satisfies GlossItem[],
    confidence: 0.9,
    claimerType: null,
    claimerGloss: [],
    claimRelation: [],
    claimEventId: '',
    claimTimeId: '',
    claimLocationId: '',
    audio: ['speech'],
    video: [],
    metadata: [],
    comment: '',
    videoId: 'video-abc',
    personaId: 'persona-123',
    summaryId: 'summary-456',
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('Layout', () => {
  beforeEach(() => {
    useClaimsUiStore.getState().reset()
    vi.clearAllMocks()
  })

  describe('Draft Claim Chip', () => {
    it('does not show the chip when no draft claim exists', () => {
      render(<Layout />, { wrapper: createWrapper() })

      expect(screen.queryByText('Draft Claim')).not.toBeInTheDocument()
    })

    it('shows the "Draft Claim" chip when a draft is present', () => {
      useClaimsUiStore.getState().saveDraftClaim(createTestDraft())

      render(<Layout />, { wrapper: createWrapper() })

      expect(screen.getByText('Draft Claim')).toBeInTheDocument()
    })

    it('removes the chip when the draft is cleared via the delete button', async () => {
      const user = userEvent.setup()
      useClaimsUiStore.getState().saveDraftClaim(createTestDraft())

      render(<Layout />, { wrapper: createWrapper() })

      expect(screen.getByText('Draft Claim')).toBeInTheDocument()

      // The discard button has aria-label="Discard draft claim"
      const deleteButton = screen.getByRole('button', { name: /discard draft claim/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(screen.queryByText('Draft Claim')).not.toBeInTheDocument()
      })

      // Verify the store was also cleared
      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
    })

    it('renders the chip with warning color', () => {
      useClaimsUiStore.getState().saveDraftClaim(createTestDraft())

      render(<Layout />, { wrapper: createWrapper() })

      // The Badge has amber/warning color classes
      const chip = screen.getByText('Draft Claim').closest('[class]')
      expect(chip).toHaveClass('border-amber-500')
      expect(chip).toHaveClass('text-amber-600')
    })
  })
})
