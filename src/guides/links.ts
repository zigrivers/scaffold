import fs from 'node:fs'
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { stripFrontmatter } from './render.js'

/**
 * Every link/image/reference-definition target in `markdown`.
 *
 * Parsing to an mdast (rather than scanning text) is what keeps link-like text
 * in fenced code, inline code, and frontmatter out of the results, and what
 * makes reference-style links visible.
 */
function linkTargets(markdown: string): { url: string; isImage: boolean }[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(stripFrontmatter(markdown))
  const urls: { url: string; isImage: boolean; identifier?: string }[] = []
  // A definition consumed by an ![…][ref] is an image target even though the
  // node type is `definition`, so collect the image references and reconcile.
  const imageRefs = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type === 'imageReference' && typeof node.identifier === 'string') {
      imageRefs.add(node.identifier)
      return
    }
    if (
      (node.type === 'link' || node.type === 'image' || node.type === 'definition') &&
      typeof node.url === 'string'
    ) {
      urls.push({
        url: node.url,
        isImage: node.type === 'image',
        identifier: typeof node.identifier === 'string' ? node.identifier : undefined,
      })
    }
  })
  return urls.map((u) => ({
    url: u.url,
    isImage: u.isImage || (u.identifier !== undefined && imageRefs.has(u.identifier)),
  }))
}

export interface AnchorScope {
  /** Heading ids of the page being checked, as the renderer emitted them. */
  selfIds: ReadonlySet<string>
  /** This guide's directory name, used to resolve self- and sibling links. */
  topic?: string
  /** topic slug -> that guide's heading ids. Omit a topic to skip checking it. */
  idsByTopic?: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * Which guide a link points at, from this guide's directory.
 *
 * Resolves the path rather than pattern-matching the literal string, so every
 * spelling of the same file agrees: `../mmr/index.md`, `../mmr/`, `../mmr`,
 * `../mmr/index.HTML`, `../mmr//index.md`, `../../guides/mmr/index.md` and
 * `../mmr/index.md?v=1` all resolve to the topic `mmr`. Returns the current
 * guide's own name for `.`, `./`, `index.md`, `./index.html` and the like —
 * the self-link spellings an earlier version silently skipped.
 */
function resolveTopic(filePart: string, selfTopic: string): string | null {
  const cleaned = filePart.replace(/[?#].*$/, '')
  if (!cleaned || cleaned === '.' || cleaned === './') return selfTopic
  // Drop a trailing index.md / index.html (any case) so a directory and its
  // index page are the same target.
  const withoutIndex = cleaned.replace(/(^|\/)index\.(md|html?)\/?$/i, '$1')
  // Resolve under a virtual `guides/` root so a link that steps out of the tree
  // and back in (`../../guides/mmr/index.md`) lands on the same topic as the
  // direct spelling (`../mmr/index.md`) instead of looking like an escape.
  const resolved = path.posix.normalize(path.posix.join('guides', selfTopic, withoutIndex))
  const parts = resolved.split('/').filter((p) => p && p !== '.')
  // A guide page is exactly `guides/<topic>`. Anything else — a deeper path, a
  // non-index file, or an escape above the root — is not one.
  if (parts.length !== 2 || parts[0] !== 'guides') return null
  return parts[1] ?? null
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

    const selfTopic = scope.topic ?? '.'
    const topic = resolveTopic(decode(trimmed.slice(0, hash)), selfTopic)
    if (topic === null) continue // not a guide page — a different slugger owns it
    const ids = topic === selfTopic ? scope.selfIds : scope.idsByTopic?.get(topic)
    if (ids === undefined) continue // topic not in scope; nothing to check against
    if (!ids.has(fragment)) broken.push(url)
  }
  // One report per distinct target: repeating the same dead link N times in the
  // build error tells the author nothing extra.
  return [...new Set(broken)]
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
