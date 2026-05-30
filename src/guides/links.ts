import fs from 'node:fs'
import path from 'node:path'

// Markdown inline links/images: [text](target) and ![alt](target).
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)/g

/**
 * Return the raw targets of relative links in `markdown` that do not resolve on
 * disk relative to `guideDir`. External URLs (http:, mailto:, …), protocol-
 * relative (`//`), and pure anchors (`#…`) are ignored. A trailing `#anchor` is
 * stripped before resolving. A link to `…/index.html` is accepted when the
 * `index.md` source exists (the HTML may not be built yet, e.g. for a stub).
 */
export function findBrokenRelativeLinks(markdown: string, guideDir: string): string[] {
  const broken: string[] = []
  for (const m of markdown.matchAll(LINK_RE)) {
    const raw = m[1].trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue // http:, https:, mailto:, …
    if (raw.startsWith('#') || raw.startsWith('//')) continue
    const target = raw.split('#')[0]
    if (!target) continue
    const abs = path.resolve(guideDir, target)
    if (fs.existsSync(abs)) continue
    if (target.endsWith('index.html') && fs.existsSync(abs.replace(/index\.html$/, 'index.md'))) continue
    broken.push(raw)
  }
  return broken
}
