import type { DesignToken } from '../types.js'
import { parseMarkdown, headingsAtDepth, slugify } from './parse-markdown.js'
import type { Table } from 'mdast'

const VALID_PRIORITY = ['must', 'should', 'could', 'wont'] as const
const CATEGORY_MAP: Record<string, DesignToken['category']> = {
  colors: 'color', color: 'color',
  spacing: 'spacing', space: 'spacing',
  typography: 'typography', type: 'typography', text: 'typography',
  shadows: 'shadow', shadow: 'shadow',
  radius: 'radius', radii: 'radius',
  motion: 'motion', animation: 'motion',
}

function nodeText(n: { type: string; value?: string; children?: unknown[] }): string {
  if (n.type === 'text' || n.type === 'inlineCode') return n.value ?? ''
  if (Array.isArray(n.children)) return (n.children as typeof n[]).map(nodeText).join('')
  return ''
}

export function parseDesignTokens(md: string, sourcePath = 'docs/design-system.md'): DesignToken[] {
  const root = parseMarkdown(md)
  const h2s = headingsAtDepth(root, 2)
  const out: DesignToken[] = []

  for (let h = 0; h < h2s.length; h++) {
    const head = h2s[h]
    const headText = head.textContent.replace(/\[[^\]]*\]/g, '').trim().toLowerCase()
    const category = CATEGORY_MAP[headText]
    if (!category) continue

    const slugAnchor = slugify(head.textContent) || headText
    const start = head.startIndex + 1
    const end = h + 1 < h2s.length ? h2s[h + 1].startIndex : root.children.length
    for (let i = start; i < end; i++) {
      const n = root.children[i]
      if (n.type !== 'table') continue
      const table = n as Table
      const rows = table.children
      if (rows.length < 2) continue
      const headerCells = rows[0].children.map((cell) => nodeText(cell as never).trim().toLowerCase())
      const tokenIdx = headerCells.findIndex((c) => /token|name/.test(c))
      const valueIdx = headerCells.findIndex((c) => /value/.test(c))
      const priorityIdx = headerCells.findIndex((c) => /priority/.test(c))
      if (tokenIdx < 0 || valueIdx < 0) continue
      for (let r = 1; r < rows.length; r++) {
        const cells = rows[r].children.map((cell) => nodeText(cell as never).trim())
        const tokenText = cells[tokenIdx]
        const valueText = cells[valueIdx]
        const priorityText = priorityIdx >= 0 ? cells[priorityIdx].toLowerCase() : ''
        if (!tokenText || !valueText) continue
        const priority = (VALID_PRIORITY as readonly string[]).includes(priorityText)
          ? (priorityText as DesignToken['priority'])
          : 'should'
        out.push({
          id: `token:${tokenText}`,
          category,
          value: valueText,
          priority,
          source_anchor: `${sourcePath}#${slugAnchor}`,
        })
      }
    }
  }
  return out
}
