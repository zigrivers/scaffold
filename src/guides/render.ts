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

function slug(text: string): string {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[_\s]+/g, '-')
}

export function stripFrontmatter(md: string): string {
  const lines = md.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return md
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (close === -1) return md
  return lines.slice(close + 1).join('\n')
}

function collectHeadings(out: TocHeading[]): AnyPlugin {
  return () => (tree: Parameters<typeof visit>[0]) => {
    visit(tree, 'heading', (node) => {
      const h = node as Heading
      if (h.depth !== 2 && h.depth !== 3) return
      const text = mdToString(h)
      const id = slug(text)
      h.data = h.data ?? {}
      ;(h.data as Record<string, unknown>).hProperties = {
        ...((h.data as Record<string, unknown>).hProperties as Record<string, unknown> ?? {}),
        id,
      }
      out.push({ depth: h.depth, text, id })
    })
  }
}

export async function renderGuideBody(
  markdown: string,
  opts: RenderOptions = {},
): Promise<{ body: string; headings: TocHeading[] }> {
  const headings: TocHeading[] = []
  const src = stripFrontmatter(markdown)

  // Build processor with loose typing to avoid unified's complex generics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let proc: any = unified().use(remarkParse).use(remarkGfm).use(remarkDirective)
  for (const p of opts.plugins ?? []) proc = proc.use(p)
  proc = proc.use(collectHeadings(headings))
  const file = await proc
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, guideSanitizeSchema)
    .use(rehypeStringify)
    .process(src)
  return { body: String(file), headings }
}
