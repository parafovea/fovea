// Render an OG card (1200x630, white background, actual fovea-logo.svg
// on the left, FOVEA wordmark + tagline on the right) to
// public/og-image.png. Uses chromium so the SVG renders with all of
// Inkscape's path/style attributes intact.
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'

const logoSvg = readFileSync('public/fovea-logo.svg', 'utf8')

const html = `<!doctype html>
<html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { width: 1200px; height: 630px; display: flex; align-items: center; justify-content: center; padding: 0 80px; box-sizing: border-box; gap: 24px; }
  .logo { width: 320px; height: 320px; flex: 0 0 auto; }
  .logo svg { width: 100%; height: 100%; display: block; }
  .copy { font-family: 'Inter', 'Helvetica', 'Arial', sans-serif; color: #00241b; flex: 0 0 auto; }
  /* Inter at large weights/sizes carries a perceptible left side-bearing
     inside the F glyph's bounding box; the same glyph at 28px barely
     has any. Without compensation the subtitle's optical 'F' lands ~5px
     LEFT of the wordmark's optical 'F'. -0.04em at 140px ≈ -5.6px pulls
     the wordmark left so both painted 'F's share the same x. */
  .wordmark { font-size: 140px; font-weight: 700; letter-spacing: -2px; line-height: 1; margin-left: -0.04em; }
  /* App's --primary token (oklch(0.518 0.113 330)) — the same dusty
     magenta the workspace uses for primary buttons, focus rings, and
     the gloss-editor's type-reference badges. */
  .subtitle { margin-top: 14px; font-size: 28px; font-weight: 500; color: oklch(0.518 0.113 330); letter-spacing: 0; white-space: nowrap; }
</style></head>
<body>
  <div class="logo">${logoSvg}</div>
  <div class="copy">
    <div class="wordmark">FOVEA</div>
    <div class="subtitle">Flexible Ontology Visual Event Analyzer</div>
  </div>
</body></html>`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(200)
const buf = await page.screenshot({ type: 'png', omitBackground: false, clip: { x: 0, y: 0, width: 1200, height: 630 } })
writeFileSync('public/og-image.png', buf)
console.log('Wrote public/og-image.png (' + buf.length + ' bytes)')

// Also emit a static SVG that mirrors the same composition so the
// repo's og-image.svg stays in sync with the rendered PNG. The SVG
// references the same logo source file inline; the font is declared
// via an <style> CDN import so it renders correctly in browsers and
// gracefully falls back to Helvetica on social-card scrapers.
// Strip the logo's own xml/inkscape metadata + its outer width/height
// attributes; we re-attach width/height when we nest it. The viewBox
// stays so the geometry scales correctly inside its new viewport.
const innerLogo = logoSvg
  .replace(/<\?xml[^?]*\?>\s*/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<svg([^>]*)/, (match, attrs) => {
    return '<svg' + attrs.replace(/\s(width|height)="[^"]*"/g, '') +
      ' x="155" y="155" width="320" height="320" preserveAspectRatio="xMidYMid meet"'
  })
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Inter:wght@500;700&amp;display=swap");
    .wordmark { font: 700 140px 'Inter', 'Helvetica', 'Arial', sans-serif; letter-spacing: -2px; fill: #00241b; }
    .subtitle { font: 500 28px 'Inter', 'Helvetica', 'Arial', sans-serif; fill: oklch(0.518 0.113 330); }
  </style>
  <rect width="1200" height="630" fill="#ffffff"/>
  ${innerLogo}
  <g transform="translate(515 348)">
    <text class="wordmark" x="-5.6">FOVEA</text>
    <text class="subtitle" y="58">Flexible Ontology Visual Event Analyzer</text>
  </g>
</svg>
`
writeFileSync('public/og-image.svg', ogSvg)
console.log('Wrote public/og-image.svg (' + ogSvg.length + ' bytes)')
await ctx.close()
await browser.close()
