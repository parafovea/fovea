/**
 * AttributionPage — renders docs/demo-attribution.md as the public
 * CC-BY-NC-SA compliance page the AttributionBanner links to.
 *
 * Imports the markdown file as a raw string via Vite's ?raw query so
 * the doc lives in exactly one place (the repo's docs/) and the demo
 * deployment can't drift from it.
 *
 * Rendering is intentionally minimal — we don't pull in a full
 * markdown library for one page. A small line-by-line renderer
 * handles headings, paragraphs, links, and inline code, which is
 * everything the attribution doc uses. If the doc grows lists /
 * tables / images later, swap to a real markdown library.
 */

// Vite ?raw import — gives us the markdown source as a string.
import attributionMd from '../../../../docs/demo-attribution.md?raw'

export function AttributionPage() {
  return (
    <div className="min-h-screen bg-background">
      <article className="mx-auto max-w-3xl px-6 py-10 prose prose-sm dark:prose-invert">
        <RenderMd source={attributionMd} />
        <p className="mt-12 text-xs text-muted-foreground">
          This page is generated from{' '}
          <code>docs/demo-attribution.md</code>. If something is
          inaccurate or out of date, open a PR there.
        </p>
      </article>
    </div>
  )
}

function RenderMd({ source }: { source: string }) {
  const lines = source.split('\n')
  const nodes: React.ReactNode[] = []
  let paragraph: string[] = []

  const flushParagraph = (key: string) => {
    if (paragraph.length === 0) return
    nodes.push(
      <p key={key} className="my-3 leading-relaxed">
        <InlineMd text={paragraph.join(' ')} />
      </p>,
    )
    paragraph = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.length === 0) {
      flushParagraph(`p-${i}`)
      continue
    }
    if (line.startsWith('### ')) {
      flushParagraph(`p-${i}`)
      nodes.push(
        <h3 key={`h-${i}`} className="text-base font-semibold mt-6 mb-2">
          {line.slice(4)}
        </h3>,
      )
      continue
    }
    if (line.startsWith('## ')) {
      flushParagraph(`p-${i}`)
      nodes.push(
        <h2 key={`h-${i}`} className="text-lg font-semibold mt-8 mb-3">
          {line.slice(3)}
        </h2>,
      )
      continue
    }
    if (line.startsWith('# ')) {
      flushParagraph(`p-${i}`)
      nodes.push(
        <h1 key={`h-${i}`} className="text-2xl font-bold mt-2 mb-4">
          {line.slice(2)}
        </h1>,
      )
      continue
    }
    if (line.startsWith('- ')) {
      flushParagraph(`p-${i}`)
      nodes.push(
        <li key={`li-${i}`} className="ml-5 list-disc">
          <InlineMd text={line.slice(2)} />
        </li>,
      )
      continue
    }
    paragraph.push(line)
  }
  flushParagraph('p-end')
  return <>{nodes}</>
}

/**
 * Inline markdown: handles **bold**, [text](url), and `code`. The
 * attribution doc only uses these three; anything more elaborate is
 * dropped to plain text rather than rendered wrong.
 */
function InlineMd({ text }: { text: string }) {
  // Linkify [text](url) first so we don't accidentally process its
  // contents as bold/code.
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) parts.push(<Inline2 key={`t-${last}`} text={text.slice(last, m.index)} />)
    parts.push(
      <a key={`a-${m.index}`} href={m[2]} target="_blank" rel="noreferrer" className="underline">
        {m[1]}
      </a>,
    )
    last = linkRe.lastIndex
  }
  if (last < text.length) parts.push(<Inline2 key={`t-${last}`} text={text.slice(last)} />)
  return <>{parts}</>
}

function Inline2({ text }: { text: string }) {
  // **bold** then `code` — both narrow regexes that bottom out at plain.
  const boldRe = /\*\*([^*]+)\*\*/g
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) parts.push(<Inline3 key={`t-${last}`} text={text.slice(last, m.index)} />)
    parts.push(
      <strong key={`b-${m.index}`} className="font-semibold">
        {m[1]}
      </strong>,
    )
    last = boldRe.lastIndex
  }
  if (last < text.length) parts.push(<Inline3 key={`t-${last}`} text={text.slice(last)} />)
  return <>{parts}</>
}

function Inline3({ text }: { text: string }) {
  const codeRe = /`([^`]+)`/g
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <code key={`c-${m.index}`} className="px-1 py-0.5 rounded bg-muted text-xs">
        {m[1]}
      </code>,
    )
    last = codeRe.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
