import { unified } from 'unified'
import type { Plugin } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'
import { toString as mdToString } from 'mdast-util-to-string'
import type { Heading } from 'mdast'
import type { TocHeading } from './types.js'
import { guideSanitizeSchema } from './sanitize.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPlugin = Plugin<any[], any, any>

export interface RenderOptions {
  /** remark-phase plugins only; injected after remark-directive and before remark-rehype */
  plugins?: AnyPlugin[]
}

/**
 * Heading text -> id.
 *
 * Unicode-aware: `## Überblick` becomes `überblick`, the anchor an author would
 * actually write. The former ASCII-only class silently deleted the leading
 * character and produced `berblick`, reachable only by an id nobody would guess.
 *
 * `_` is kept in the first class deliberately. It was inside `\w` before, and
 * the second replace turns it into a hyphen — so `### Stable identity
 * (\`finding_key\`)` stays `stable-identity-finding-key`. Dropping it silently
 * renamed that id to `…-findingkey` and broke a live cross-guide link.
 */
function slug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}_\s-]/gu, '')
    .replace(/[_\s]+/g, '-')
}

/**
 * Make every id unique in document order, GitHub-style: the first `example`
 * stays `example`, later ones become `example-1`, `example-2`.
 *
 * Repeating a heading under different sections (`#### Example` twice) is normal
 * documentation, and now that every depth carries an id it would otherwise
 * collide. Suffixing keeps both headings reachable; failing the build would
 * forbid the pattern outright, which is a far stronger authoring constraint
 * than an anchor checker has any business imposing.
 */
function uniqueId(base: string, seen: Map<string, number>): string {
  const n = seen.get(base) ?? 0
  seen.set(base, n + 1)
  return n === 0 ? base : `${base}-${n}`
}

export function stripFrontmatter(md: string): string {
  const lines = md.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return md
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (close === -1) return md
  return lines.slice(close + 1).join('\n')
}

/**
 * Assign an id to EVERY heading, but list only h2/h3 in the table of contents.
 *
 * The depth split is deliberate: the TOC rail would be unreadable with h4+ in
 * it, but an anchor to an h4 must still resolve. Emitting ids only for h2/h3
 * meant `[x](#deep-thing)` pointed at nothing while the heading sat right there
 * in the page — invisible before the anchor gate, and an opaque build failure
 * after it.
 */
function collectHeadings(toc: TocHeading[], allIds: { id: string; text: string }[]): AnyPlugin {
  return () => (tree: Parameters<typeof visit>[0]) => {
    const seen = new Map<string, number>()
    let n = 0
    visit(tree, 'heading', (node) => {
      const h = node as Heading
      const text = mdToString(h)
      n += 1
      // A heading of pure punctuation or emoji (`#### \`&&\``, `###### ✅`)
      // slugs to nothing. Synthesise a positional id so it stays linkable
      // instead of aborting the build over legitimate content.
      const id = uniqueId(slug(text) || `section-${n}`, seen)
      h.data = h.data ?? {}
      ;(h.data as Record<string, unknown>).hProperties = {
        ...((h.data as Record<string, unknown>).hProperties as Record<string, unknown> ?? {}),
        id,
      }
      allIds.push({ id, text })
      if (h.depth === 2 || h.depth === 3) toc.push({ depth: h.depth, text, id })
    })
  }
}

export async function renderGuideBody(
  markdown: string,
  opts: RenderOptions = {},
): Promise<{ body: string; headings: TocHeading[]; anchors: { id: string; text: string }[] }> {
  const headings: TocHeading[] = []
  const anchors: { id: string; text: string }[] = []
  const src = stripFrontmatter(markdown)

  // Build processor with loose typing to avoid unified's complex generics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let proc: any = unified().use(remarkParse).use(remarkGfm).use(remarkDirective)
  for (const p of opts.plugins ?? []) proc = proc.use(p)
  proc = proc.use(collectHeadings(headings, anchors))
  const file = await proc
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, guideSanitizeSchema)
    .use(rehypeStringify)
    .process(src)
  return { body: String(file), headings, anchors }
}
