import fs from 'node:fs'
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { stripFrontmatter, headingIds } from './render.js'

/**
 * Every link/image/reference-definition target in `markdown`.
 *
 * Parsing to an mdast (rather than scanning text) is what keeps link-like text
 * in fenced code, inline code, and frontmatter out of the results, and what
 * makes reference-style links visible.
 */
function linkTargets(markdown: string): string[] {
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
  return urls
}

/**
 * Return the link targets in `markdown` whose `#fragment` does not match a
 * heading id in the page it points at.
 *
 * Covers both same-page (`#anchor`) and cross-guide
 * (`../<topic>/index.md#anchor`) forms; an `index.html` target resolves against
 * its `index.md` source, matching `findBrokenRelativeLinks`.
 *
 * Expected ids come from `headingIds`, i.e. the renderer's own `slug()` and
 * h2/h3 rule — so a heading like ``### The `--fix` flow`` correctly yields
 * `the---fix-flow`, and a checker that normalised repeated hyphens would be
 * wrong, not this.
 *
 * A missing target file is NOT reported here: that is
 * `findBrokenRelativeLinks`' job, and reporting it twice would double up the
 * build error.
 */
export function findBrokenAnchors(markdown: string, guideDir: string): string[] {
  const broken: string[] = []
  const idCache = new Map<string, Set<string>>()

  const idsFor = (mdPath: string): Set<string> | null => {
    const cached = idCache.get(mdPath)
    if (cached) return cached
    if (!fs.existsSync(mdPath)) return null
    const ids = headingIds(fs.readFileSync(mdPath, 'utf8'))
    idCache.set(mdPath, ids)
    return ids
  }

  for (const raw of linkTargets(markdown)) {
    const trimmed = raw.trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) continue // http:, mailto:, …
    if (trimmed.startsWith('//')) continue
    const hash = trimmed.indexOf('#')
    if (hash === -1) continue
    const fragment = trimmed.slice(hash + 1)
    if (!fragment) continue // a bare "#" is a placeholder, not a claim

    const filePart = trimmed.slice(0, hash)
    let mdPath: string
    if (!filePart) {
      mdPath = path.join(guideDir, 'index.md')
    } else {
      let decoded: string
      try {
        decoded = decodeURIComponent(filePart)
      } catch {
        decoded = filePart
      }
      mdPath = path.resolve(guideDir, decoded.replace(/index\.html$/, 'index.md'))
    }

    const ids = idsFor(mdPath)
    if (ids === null) continue // missing file — findBrokenRelativeLinks reports it
    if (!ids.has(fragment)) broken.push(raw)
  }
  return broken
}

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
  const urls = linkTargets(markdown)

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
