/**
 * Tests that UI wrappers given refs by callers forward them to the DOM element,
 * including the tour-anchor ref callback that tags and registers an element.
 */

import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Accordion, AccordionItem, AccordionTrigger } from './accordion'
import { Textarea } from './textarea'

describe('forwarded refs', () => {
  it('Textarea forwards its ref to the textarea element', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<Textarea ref={ref} aria-label="gloss" />)
    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'gloss' }))
  })

  it('AccordionTrigger forwards its ref to the trigger button', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <Accordion>
        <AccordionItem value="spec">
          <AccordionTrigger ref={ref}>Format specification</AccordionTrigger>
        </AccordionItem>
      </Accordion>,
    )
    expect(ref.current).toBe(screen.getByRole('button', { name: /Format specification/ }))
  })

  it('AccordionTrigger runs a ref callback with the button', () => {
    const seen: Array<HTMLElement | null> = []
    render(
      <Accordion>
        <AccordionItem value="spec">
          <AccordionTrigger ref={(element) => { seen.push(element) }}>Spec</AccordionTrigger>
        </AccordionItem>
      </Accordion>,
    )
    expect(seen.find((element) => element !== null)).toBe(screen.getByRole('button', { name: /Spec/ }))
  })
})
