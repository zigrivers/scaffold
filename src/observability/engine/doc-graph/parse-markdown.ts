import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import type { Root, Heading, RootContent } from 'mdast'

export interface AnnotatedHeading {
  node: Heading
  textContent: string
  depth: number
  startIndex: number
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, { bullet: '-' })

export function parseMarkdown(input: string): Root {
  return parser.parse(input) as Root
}

function nodeText(node: RootContent): string {
  if (node.type === 'text' || node.type === 'inlineCode') return (node as { value: string }).value
  // Put each list item on its own line so field-extraction regexes work.
  if (node.type === 'listItem') {
    return ((node as { children: RootContent[] }).children).map(nodeText).join('').trim()
  }
  if (node.type === 'list') {
    return ((node as { children: RootContent[] }).children).map(nodeText).join('\n').trim()
  }
  if ('children' in node && Array.isArray((node as { children?: unknown }).children)) {
    return ((node as { children: RootContent[] }).children).map(nodeText).join('')
  }
  return ''
}

export function headingsAtDepth(root: Root, depth: number): AnnotatedHeading[] {
  const out: AnnotatedHeading[] = []
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i]
    if (c.type === 'heading' && (c as Heading).depth === depth) {
      out.push({ node: c as Heading, textContent: nodeText(c).trim(), depth, startIndex: i })
    }
  }
  return out
}

function sectionRange(root: Root, heading: AnnotatedHeading): [number, number] {
  const start = heading.startIndex + 1
  let end = root.children.length
  for (let i = start; i < root.children.length; i++) {
    const c = root.children[i]
    if (c.type === 'heading' && (c as Heading).depth <= heading.depth) {
      end = i
      break
    }
  }
  return [start, end]
}

export function sectionAfterHeading(root: Root, heading: AnnotatedHeading): string {
  const [start, end] = sectionRange(root, heading)
  const slice: Root = { type: 'root', children: root.children.slice(start, end) }
  return (parser.stringify(slice) as string).trim()
}

// Returns raw text content of the section using AST-level text extraction
// (avoids remark-stringify escaping, preserves inline code verbatim).
export function sectionRawText(root: Root, heading: AnnotatedHeading): string {
  const [start, end] = sectionRange(root, heading)
  return root.children.slice(start, end).map((n) => nodeText(n)).join('\n\n').trim()
}

// Returns raw AST nodes in the section.
export function sectionNodes(root: Root, heading: AnnotatedHeading): RootContent[] {
  const [start, end] = sectionRange(root, heading)
  return root.children.slice(start, end)
}

export function extractInlineTags(text: string): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const match of text.matchAll(/\[([a-z_][a-z0-9_-]*)\s*:\s*([^\]]+?)\s*\]/gi)) {
    tags[match[1]] = match[2].trim()
  }
  return tags
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')        // strip inline tags
    .replace(/[^\w\s-]+/g, ' ')        // remove non-word chars including em-dash
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}
