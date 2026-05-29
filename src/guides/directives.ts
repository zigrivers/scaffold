import { visit } from 'unist-util-visit'
import { toString as mdToString } from 'mdast-util-to-string'
import type { Root } from 'mdast'
import type { AnyPlugin } from './render.js'

const CALLOUT_TYPES = new Set(['note', 'tip', 'warning', 'danger', 'info'])

export const remarkCallout: AnyPlugin = () => (tree: Root) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type !== 'containerDirective' || node.name !== 'callout') return
    const type = String(node.attributes?.type ?? 'note')
    const safe = CALLOUT_TYPES.has(type) ? type : 'note'
    node.data = node.data ?? {}
    node.data.hName = 'div'
    node.data.hProperties = { className: `callout callout-${safe}` }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const remarkTabs: AnyPlugin = () => (tree: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type !== 'containerDirective' || node.name !== 'tabs') return
    // With a 4-colon outer fence (::::tabs) wrapping 3-colon (:::tab) children,
    // remark-directive nests tab nodes directly inside node.children — no sibling
    // collection needed, no stray ::: paragraph produced.
     
    const tabs = (node.children ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.type === 'containerDirective' && c.name === 'tab',
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buttons = tabs.map((t: any, i: number) => ({
      type: 'paragraph',
      data: {
        hName: 'button',
        hProperties: {
          className: 'tab-btn' + (i === 0 ? ' active' : ''),
          role: 'tab',
          'data-tab': String(i),
        },
      },
      children: [{ type: 'text', value: String(t.attributes?.title ?? `Tab ${i + 1}`) }],
    }))
    const tablist = {
      type: 'paragraph',
      data: { hName: 'div', hProperties: { className: 'tablist', role: 'tablist' } },
      children: buttons,
    }
    // Mutate each tab node in place: assign hast properties and keep its children.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tabs.forEach((t: any, i: number) => {
      t.data = t.data ?? {}
      t.data.hName = 'div'
      t.data.hProperties = {
        className: 'tabpane' + (i === 0 ? ' active' : ''),
        'data-tab': String(i),
      }
    })
    node.data = node.data ?? {}
    node.data.hName = 'div'
    node.data.hProperties = { className: 'tabs' }
    node.children = [tablist, ...tabs]
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const remarkChart: AnyPlugin = () => (tree: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type !== 'containerDirective' || node.name !== 'chart') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (node.children ?? []).find((c: any) => c.type === 'table')
    if (!table) throw new Error('`:::chart` must contain a GFM table')
    const rows = table.children.slice(1) // drop header row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = rows.map((r: any) => {
      const cells = r.children
      const label = mdToString(cells[0])
      const value = Number(mdToString(cells[cells.length - 1]).trim())
      if (!Number.isFinite(value)) throw new Error(`:::chart value column must be numeric (got "${label}")`)
      return { label, value }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const max = Math.max(...parsed.map((p: any) => p.value), 0) || 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bars = parsed.map((p: any) => {
      const pct = Math.round((p.value / max) * 100)
      return {
        type: 'paragraph',
        data: {
          hName: 'div',
          hProperties: { className: 'chart-row', 'aria-label': `${p.label}: ${p.value}` },
        },
        children: [
          {
            type: 'paragraph',
            data: { hName: 'span', hProperties: { className: 'chart-label' } },
            children: [{ type: 'text', value: p.label }],
          },
          {
            type: 'paragraph',
            data: { hName: 'div', hProperties: { className: 'chart-bar', style: `width:${pct}%` } },
            children: [],
          },
        ],
      }
    })
    const chart = {
      type: 'paragraph',
      data: { hName: 'div', hProperties: { className: 'chart chart-bar' } },
      children: bars,
    }
    node.data = node.data ?? {}
    node.data.hName = 'div'
    node.data.hProperties = { className: 'chart-block' }
    node.children = [chart, table]
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const remarkFilterTable: AnyPlugin = () => (tree: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type !== 'containerDirective' || node.name !== 'filter-table') return
    const input = {
      type: 'paragraph',
      data: {
        hName: 'input',
        hProperties: {
          type: 'text', className: 'filter-input', placeholder: 'Filter…', 'aria-label': 'Filter table rows',
        },
      },
      children: [],
    }
    node.data = node.data ?? {}
    node.data.hName = 'div'
    node.data.hProperties = { className: 'filter-table' }
    node.children = [input, ...(node.children ?? [])]
  })
}

const SEV_LEVELS = new Set(['p0', 'p1', 'p2', 'p3', 'pass'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const remarkSev: AnyPlugin = () => (tree: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type !== 'textDirective' || node.name !== 'sev') return
    const level = String(node.attributes?.level ?? 'p2').toLowerCase()
    const safe = SEV_LEVELS.has(level) ? level : 'p2'
    node.data = node.data ?? {}
    node.data.hName = 'span'
    node.data.hProperties = { className: `sev sev-${safe}` }
  })
}
