/**
 * EmailCaptureCard — the conversion surface on the post-tour page.
 *
 * Plan §10 telemetry: we emit `demo.followup.email_captured` with a
 * SHA-256 hash of the lowercased address, never the plaintext. The
 * backend (regular /api/telemetry) stores only the event + hash; the
 * actual outreach happens out-of-band against a separate mailing list
 * the marketing site owns.
 *
 * Local-only state: the form remembers whether this session already
 * submitted an address (sessionStorage) so a visitor who finishes
 * multiple tours doesn't get the prompt repeatedly.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const STORAGE_KEY = 'fovea.demo.email-captured'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailCaptureCard({ tourId }: { tourId: string }) {
  const [submitted, setSubmitted] = useState(() => readSubmitted())
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (submitted) {
    return (
      <div className="rounded-md border p-3 bg-muted/30">
        <p className="text-sm">Thanks — we'll be in touch.</p>
      </div>
    )
  }

  return (
    <form
      className="rounded-md border p-3 space-y-2"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!EMAIL_RE.test(value.trim())) {
          setError("That doesn't look like an email address.")
          return
        }
        setPending(true)
        setError(null)
        try {
          const hash = await sha256Lower(value.trim())
          await fetch('/api/telemetry', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'demo.followup.email_captured',
              payload: { tourId, emailHash: hash },
            }),
          }).catch(() => undefined) // telemetry failures are silent
          writeSubmitted()
          setSubmitted(true)
        } finally {
          setPending(false)
        }
      }}
    >
      <Label htmlFor="demo-followup-email" className="text-sm">
        Send me a workspace
      </Label>
      <div className="flex gap-2">
        <Input
          id="demo-followup-email"
          type="email"
          placeholder="you@example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          aria-invalid={!!error}
        />
        <Button type="submit" size="sm" disabled={pending}>
          Send
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        We only store a hashed version of your address.
      </p>
    </form>
  )
}

async function sha256Lower(s: string): Promise<string> {
  const data = new TextEncoder().encode(s.toLowerCase())
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function readSubmitted(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeSubmitted(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // sessionStorage can throw in private mode — non-fatal.
  }
}
