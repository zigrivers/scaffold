import fs from 'node:fs'
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { stripFrontmatter } from './render.js'

/**
 * Return the targets of relative links/images/reference-definitions in
 * `markdown` that do not resolve on disk relative to `guideDir`.
 *
 * Parses the markdown body (frontmatter stripped) to an mdast and inspects only
 * `link`, `image`, and `definition` nodes, so link-like text in code blocks,
 * inline code, or frontmatter is never flagged, and reference-style links are
 * covered. External URLs (`http:`, `mailto:`, …), protocol-relative (`//`), and
 * pure anchors (`#…`) are ignored. A trailing `#anchor` is stripped and the
 * target is percent-decoded before resolving. A `…/index.html` link is accepted
 * when the `index.md` source exists (the HTML may not be built yet, e.g. a stub).
 */
export function findBrokenRelativeLinks(markdown: string, guideDir: string): string[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(stripFrontmatter(markdown))
  const urls: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (
      (node.type === 'link' || node.type === 'image' || node.type === 'definition') &&
      typeof node.url === 'string'
    ) {
      urls.push(node.url)
    }
  })

  const broken: string[] = []
  for (const raw of urls) {
    const trimmed = raw.trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) continue // http:, https:, mailto:, …
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue
    const target = trimmed.split('#')[0]
    if (!target) continue
    let decoded: string
    try {
      decoded = decodeURIComponent(target)
    } catch {
      decoded = target
    }
    const abs = path.resolve(guideDir, decoded)
    if (fs.existsSync(abs)) continue
    if (decoded.endsWith('index.html') && fs.existsSync(abs.replace(/index\.html$/, 'index.md'))) continue
    broken.push(raw)
  }
  return broken
}
