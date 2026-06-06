import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GlossEditor from './GlossEditor'
import type { GlossItem } from '@models/types'

/**
 * Reproduces the controlled-input race the relation-type-references.spec.ts
 * Playwright spec hit at line 40 of its docblock: GlossEditor owns a
 * local `inputValue` state seeded from the `gloss` prop via an effect
 * keyed on [gloss, glossToString]. Every keystroke fires
 * `onChange(stringToGloss(value))`, the parent re-renders with the new
 * gloss (the React-Query auto-save round-trip), and the effect would
 * then overwrite `inputValue` with the round-tripped serialization,
 * losing any character the user typed in the interval. The fix tracks
 * the most recently emitted gloss in a ref and suppresses the prop-sync
 * effect when the incoming gloss structurally matches the ref's value;
 * this test holds the contract that the local input state survives a
 * parent re-render that echoes the gloss we just emitted.
 *
 * The test reads the textarea's value rather than the rendered DOM
 * because the textarea is the single source of truth for the visible
 * character sequence.
 */

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

/**
 * Wraps GlossEditor in a stateful parent that mirrors the React-Query
 * auto-save pattern: every onChange updates parent state, which feeds
 * back into the GlossEditor as the `gloss` prop. Returns the parent's
 * current gloss state so the test can assert what the parent saw.
 */
function ControlledHarness({ initialGloss }: { initialGloss: GlossItem[] }) {
  const [gloss, setGloss] = useState<GlossItem[]>(initialGloss)
  return (
    <div>
      <GlossEditor
        gloss={gloss}
        onChange={setGloss}
        availableTypes={[]}
        personaId={null}
        label="Test Gloss"
      />
      <pre data-testid="parent-gloss">{JSON.stringify(gloss)}</pre>
    </div>
  )
}

describe('GlossEditor controlled-input echo-loop guard', () => {
  it('preserves every character of a rapidly typed sequence even when the parent echoes each keystroke back as the gloss prop', async () => {
    const qc = makeQueryClient()
    const user = userEvent.setup({ delay: 0 })
    render(
      <QueryClientProvider client={qc}>
        <ControlledHarness initialGloss={[]} />
      </QueryClientProvider>,
    )
    const textarea = screen.getByLabelText('Test Gloss') as HTMLTextAreaElement
    expect(textarea.value).toBe('')

    // Type a 12-character sequence with no autocomplete trigger chars
    // (#, @, ^, $). userEvent dispatches one keystroke at a time and
    // awaits each React render — same shape as Playwright's keyboard
    // simulation. Without the lastEmittedGlossRef guard the effect at
    // [gloss, glossToString] would intermittently reset inputValue to
    // the parent's round-tripped serialization, losing characters.
    await user.type(textarea, 'hello world!')

    expect(textarea.value).toBe('hello world!')
    // The parent should see the same string back via its gloss state.
    const parentDump = screen.getByTestId('parent-gloss').textContent ?? ''
    expect(parentDump).toContain('hello world!')
  })

  it('still resyncs inputValue when the gloss prop changes for an EXTERNAL reason (parent does not just echo our own onChange)', async () => {
    const qc = makeQueryClient()
    function ExternalResetHarness() {
      const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: 'initial' }])
      return (
        <div>
          <button onClick={() => setGloss([{ type: 'text', content: 'reset by parent' }])}>reset</button>
          <GlossEditor
            gloss={gloss}
            onChange={setGloss}
            availableTypes={[]}
            personaId={null}
            label="External Reset"
          />
        </div>
      )
    }
    const user = userEvent.setup({ delay: 0 })
    render(
      <QueryClientProvider client={qc}>
        <ExternalResetHarness />
      </QueryClientProvider>,
    )

    const textarea = screen.getByLabelText('External Reset') as HTMLTextAreaElement
    expect(textarea.value).toBe('initial')

    // External parent reset: clicking the button updates gloss to a
    // payload that does NOT match the lastEmittedGlossRef. The effect
    // must fire and re-sync inputValue.
    await user.click(screen.getByRole('button', { name: 'reset' }))
    expect(textarea.value).toBe('reset by parent')
  })

  it('forwarding onChange does not throw when no onChange handler ever changes the gloss (idempotent guard)', () => {
    // Defensive: a consumer that ignores onChange (read-only preview
    // mode) must not crash on the ref/guard plumbing.
    const qc = makeQueryClient()
    const noop = vi.fn()
    render(
      <QueryClientProvider client={qc}>
        <GlossEditor
          gloss={[{ type: 'text', content: 'static' }]}
          onChange={noop}
          availableTypes={[]}
          personaId={null}
          label="Static"
        />
      </QueryClientProvider>,
    )
    const textarea = screen.getByLabelText('Static') as HTMLTextAreaElement
    expect(textarea.value).toBe('static')
    expect(noop).not.toHaveBeenCalled()
  })

  it('regression: 30-character rapid type survives intact (would have lost characters before the ref guard)', async () => {
    const qc = makeQueryClient()
    const user = userEvent.setup({ delay: 0 })
    render(
      <QueryClientProvider client={qc}>
        <ControlledHarness initialGloss={[]} />
      </QueryClientProvider>,
    )
    const textarea = screen.getByLabelText('Test Gloss') as HTMLTextAreaElement
    const sequence = 'the quick brown fox jumps over'
    await act(async () => {
      await user.type(textarea, sequence)
    })
    expect(textarea.value).toBe(sequence)
  })
})
