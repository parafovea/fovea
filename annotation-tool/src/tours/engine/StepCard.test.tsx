import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StepCard } from './StepCard'
import type { Tour } from './tourSchema'

const tour: Tour = {
  id: 'transcript', title: 'Transcript', description: 'Open the transcript',
  durationMinutes: 1, tags: [],
  steps: [
    { anchor: 'transcript-dialog', narration: 'The transcript', expectAction: 'none' },
    { anchor: 'video-summary-editor', narration: 'The summary', expectAction: 'none' },
  ],
}

function renderCard(unavailableReason?: string | null) {
  return render(
    <StepCard
      tour={tour}
      index={0}
      anchor={null}
      resolving={false}
      unavailableReason={unavailableReason}
      onBack={vi.fn()}
      onNext={vi.fn()}
      onSkipStep={vi.fn()}
      onExit={vi.fn()}
      onRestart={vi.fn()}
    />,
  )
}

describe('StepCard unresolved anchor', () => {
  it('explains why the step is unavailable when the engine knows', () => {
    renderCard('This step needs the model service.')
    expect(screen.getByRole('status')).toHaveTextContent('This step needs the model service.')
    expect(screen.getByRole('button', { name: /Skip/ })).toBeInTheDocument()
  })

  it('falls back to the generic note when no reason is given', () => {
    renderCard(null)
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't find this UI element")
  })
})
