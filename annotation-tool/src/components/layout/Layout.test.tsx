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

vi.mock('@hooks/commands', () => ({
  useCommands: vi.fn(),
  useCommandContext: vi.fn(),
}))

vi.mock('@services/api', () => ({
  api: { saveOntology: vi.fn() },
}))

vi.mock('@components/shared/KeyboardShortcutsDialog', () => ({
  default: () => null,
}))

vi.mock('@components/shared/BreadcrumbNavigation', () => ({
  default: () => null,
}))

vi.mock('@components/data-management/ImportDataDialog', () => ({
  default: () => null,
}))

vi.mock('@components/data-management/ExportDialog', () => ({
  default: () => null,
}))

vi.mock('@components/auth/UserMenu', () => ({
  default: () => <div data-testid="user-menu" />,
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

      // The MUI Chip renders a delete icon as an SVG with data-testid="CancelIcon"
      const deleteIcon = screen.getByTestId('CancelIcon')
      await user.click(deleteIcon)

      await waitFor(() => {
        expect(screen.queryByText('Draft Claim')).not.toBeInTheDocument()
      })

      // Verify the store was also cleared
      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
    })

    it('renders the chip with warning color', () => {
      useClaimsUiStore.getState().saveDraftClaim(createTestDraft())

      render(<Layout />, { wrapper: createWrapper() })

      const chip = screen.getByText('Draft Claim').closest('.MuiChip-root')
      expect(chip).toHaveClass('MuiChip-colorWarning')
    })
  })
})
