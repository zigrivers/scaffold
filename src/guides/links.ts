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
function linkTargets(markdown: string): { url: string; isImage: boolean }[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(stripFrontmatter(markdown))
  const urls: { url: string; isImage: boolean }[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (
      (node.type === 'link' || node.type === 'image' || node.type === 'definition') &&
      typeof node.url === 'string'
    ) {
      urls.push({ url: node.url, isImage: node.type === 'image' })
    }
  })
  return urls
}

export interface AnchorScope {
  /** Heading ids of the page being checked, as the renderer emitted them. */
  selfIds: ReadonlySet<string>
  /** topic slug -> that guide's heading ids. Omit a topic to skip checking it. */
  idsByTopic?: ReadonlyMap<string, ReadonlySet<string>>
}

/** `../mmr/index.md`, `../mmr/index.html`, `../mmr/`, `../mmr` -> `mmr`. */
function siblingTopic(filePart: string): string | null {
  const m = /^\.\.\/([^/]+)(?:\/(?:index\.(?:md|html))?)?$/.exec(filePart)
  return m?.[1] ?? null
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Return the link targets in `markdown` whose `#fragment` matches no heading id
 * on the page it points at.
 *
 * **The ids are supplied, never re-derived.** `buildGuide` passes the `headings`
 * that `renderGuideBody` actually produced, after every remark plugin has run.
 * An earlier version recomputed slugs here from a bare `remark-parse` tree; that
 * silently disagreed with the renderer for any heading containing a text
 * directive (`## The :sev[P0]{level=p0} rule` renders `id="the-p0-rule"` but
 * re-parsing yielded `the-sevp0levelp0-rule`), which both rejected correct
 * anchors and accepted wrong ones. Taking the ids from the renderer removes that
 * whole class of drift rather than patching one instance of it.
 *
 * Consequences of having no filesystem access here: a missing or unbuilt target
 * cannot crash the check, and a topic absent from `idsByTopic` is skipped rather
 * than guessed at. Links outside the guides tree (`../../docs/x.md#y`) are also
 * skipped — those files are rendered by a different slugger, so judging them by
 * this one would be wrong in both directions.
 *
 * A missing target *file* is not reported here; `findBrokenRelativeLinks` owns
 * that, and reporting it twice would double the build error.
 */
export function findBrokenAnchors(markdown: string, scope: AnchorScope): string[] {
  const broken: string[] = []

  for (const { url, isImage } of linkTargets(markdown)) {
    // An image fragment is an SVG view spec or a PDF page, never a heading.
    if (isImage) continue
    const trimmed = url.trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) continue // http:, mailto:, …
    if (trimmed.startsWith('//')) continue
    const hash = trimmed.indexOf('#')
    if (hash === -1) continue
    const fragment = decode(trimmed.slice(hash + 1))
    if (!fragment) continue // a bare "#" is a placeholder, not a claim

    const filePart = trimmed.slice(0, hash)
    let ids: ReadonlySet<string> | undefined
    if (!filePart || filePart === './' || filePart === '.') {
      ids = scope.selfIds
    } else {
      const topic = siblingTopic(decode(filePart))
      if (topic === null) continue // not a sibling guide — different slug rules
      ids = scope.idsByTopic?.get(topic)
      if (ids === undefined) continue // topic not in scope; nothing to check against
    }
    if (!ids.has(fragment)) broken.push(url)
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
  const broken: string[] = []
  for (const { url: raw } of linkTargets(markdown)) {
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
