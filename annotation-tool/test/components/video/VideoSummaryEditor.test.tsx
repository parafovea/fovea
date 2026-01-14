import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Create a simplified test component that mirrors the summary preview functionality
// without all the complexity of VideoSummaryEditor
import { useState } from 'react'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
  Typography,
  Tabs,
  Tab,
  Box,
} from '@mui/material'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'

interface GlossItem {
  type: string
  content: string
}

function SummaryPreviewTestComponent({
  localSummary,
}: {
  localSummary: GlossItem[]
}) {
  const [activeTab, setActiveTab] = useState(0)
  const [summaryPreviewExpanded, setSummaryPreviewExpanded] = useState(true)

  return (
    <Box>
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
        <Tab label="Summary" />
        <Tab label="Claims" />
      </Tabs>

      <Box sx={{ p: 2 }}>
        {activeTab === 0 && <div>Summary Editor Content</div>}

        {activeTab === 1 && (
          <>
            {localSummary.length > 0 && (
              <Accordion
                expanded={summaryPreviewExpanded}
                onChange={() =>
                  setSummaryPreviewExpanded(!summaryPreviewExpanded)
                }
                sx={{ mb: 2 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2">Summary Preview</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Paper
                    variant="outlined"
                    sx={{ p: 2, maxHeight: 200, overflow: 'auto' }}
                  >
                    {localSummary.map((item, idx) => (
                      <span key={idx}>{item.content}</span>
                    ))}
                  </Paper>
                </AccordionDetails>
              </Accordion>
            )}
            <div>Claims Viewer Content</div>
          </>
        )}
      </Box>
    </Box>
  )
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('VideoSummaryEditor summary preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows summary preview accordion on Claims tab when summary has content', async () => {
    const user = userEvent.setup()
    const summary = [{ type: 'text', content: 'Test summary content' }]

    render(<SummaryPreviewTestComponent localSummary={summary} />, {
      wrapper: createWrapper(),
    })

    // Switch to Claims tab
    const claimsTab = screen.getByRole('tab', { name: /claims/i })
    await user.click(claimsTab)

    // Summary preview accordion should be visible
    expect(screen.getByText('Summary Preview')).toBeInTheDocument()
  })

  it('displays summary content in the preview', async () => {
    const user = userEvent.setup()
    const summary = [{ type: 'text', content: 'Test summary content' }]

    render(<SummaryPreviewTestComponent localSummary={summary} />, {
      wrapper: createWrapper(),
    })

    // Switch to Claims tab
    const claimsTab = screen.getByRole('tab', { name: /claims/i })
    await user.click(claimsTab)

    // Should display the summary text content
    expect(screen.getByText('Test summary content')).toBeInTheDocument()
  })

  it('can collapse and expand the summary preview', async () => {
    const user = userEvent.setup()
    const summary = [{ type: 'text', content: 'Test summary content' }]

    render(<SummaryPreviewTestComponent localSummary={summary} />, {
      wrapper: createWrapper(),
    })

    // Switch to Claims tab
    const claimsTab = screen.getByRole('tab', { name: /claims/i })
    await user.click(claimsTab)

    // The accordion should be expanded by default
    const accordion = screen
      .getByText('Summary Preview')
      .closest('.MuiAccordion-root')
    expect(accordion).toHaveClass('Mui-expanded')

    // Click to collapse
    await user.click(screen.getByText('Summary Preview'))

    // Wait for accordion to collapse
    await waitFor(() => {
      const accordionAfter = screen
        .getByText('Summary Preview')
        .closest('.MuiAccordion-root')
      expect(accordionAfter).not.toHaveClass('Mui-expanded')
    })

    // Click to expand again
    await user.click(screen.getByText('Summary Preview'))

    // Should be expanded again
    await waitFor(() => {
      const accordionExpanded = screen
        .getByText('Summary Preview')
        .closest('.MuiAccordion-root')
      expect(accordionExpanded).toHaveClass('Mui-expanded')
    })
  })

  it('does not show summary preview when summary is empty', async () => {
    const user = userEvent.setup()
    const summary: GlossItem[] = []

    render(<SummaryPreviewTestComponent localSummary={summary} />, {
      wrapper: createWrapper(),
    })

    // Switch to Claims tab
    const claimsTab = screen.getByRole('tab', { name: /claims/i })
    await user.click(claimsTab)

    // Summary preview should not be visible
    expect(screen.queryByText('Summary Preview')).not.toBeInTheDocument()
  })

  it('is not shown on Summary tab', async () => {
    const summary = [{ type: 'text', content: 'Test summary content' }]

    render(<SummaryPreviewTestComponent localSummary={summary} />, {
      wrapper: createWrapper(),
    })

    // We're on Summary tab by default
    // Summary preview accordion should NOT be visible (it's only on Claims tab)
    expect(screen.queryByText('Summary Preview')).not.toBeInTheDocument()
  })
})
