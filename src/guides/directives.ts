import { visit } from 'unist-util-visit'
import { toString as mdToString } from 'mdast-util-to-string'
import type { Root } from 'mdast'
import type { AnyPlugin } from './render.js'

const CALLOUT_TYPES = new Set(['note', 'tip', 'warning', 'danger', 'info'])

export const remarkCallout: AnyPlugin = () => (tree: Root) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type !== 'containerDirective' || node.name !== 'callout') return
    const type = String(node.attributes?.type ?? 'note').toLowerCase()
    const safe = CALLOUT_TYPES.has(type) ? type : 'note'
    node.data = node.data ?? {}
    node.data.hName = 'div'
    node.data.hProperties = { className: `callout callout-${safe}` }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const remarkTabs: AnyPlugin = () => (tree: any) => {
  let group = 0 // unique id base per tabs group (document order → deterministic)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type !== 'containerDirective' || node.name !== 'tabs') return
    // With a 4-colon outer fence (::::tabs) wrapping 3-colon (:::tab) children,
    // remark-directive nests tab nodes directly inside node.children — no sibling
    // collection needed, no stray ::: paragraph produced.
    const g = group++
    const tabId = (i: number) => `tab-${g}-${i}`
    const paneId = (i: number) => `tabpane-${g}-${i}`

    const tabs = (node.children ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.type === 'containerDirective' && c.name === 'tab',
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const others = (node.children ?? []).filter((c: any) => !(c.type === 'containerDirective' && c.name === 'tab'))
    // Full ARIA tabs pattern: each button controls its pane; roving tabindex +
    // aria-selected track the active tab (chrome.ts updates them on click/arrow).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buttons = tabs.map((t: any, i: number) => ({
      type: 'paragraph',
      data: {
        hName: 'button',
        hProperties: {
          id: tabId(i),
          className: 'tab-btn' + (i === 0 ? ' active' : ''),
          role: 'tab',
          'data-tab': String(i),
          'aria-controls': paneId(i),
          'aria-selected': i === 0 ? 'true' : 'false',
          tabindex: i === 0 ? '0' : '-1',
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
        id: paneId(i),
        className: 'tabpane' + (i === 0 ? ' active' : ''),
        role: 'tabpanel',
        'data-tab': String(i),
        'aria-labelledby': tabId(i),
        tabindex: '0',
      }
    })
    node.data = node.data ?? {}
    node.data.hName = 'div'
    node.data.hProperties = { className: 'tabs' }
    node.children = [tablist, ...tabs, ...others]
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartOthers = (node.children ?? []).filter((c: any) => c !== table)
    node.data = node.data ?? {}
    node.data.hName = 'div'
    node.data.hProperties = { className: 'chart-block' }
    node.children = [chart, table, ...chartOthers]
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

// `:cite[path:line]` (blocking) / `:cite[path:line]{mode=advisory}` (warns).
// Blocking citations render as `<span class="fp" data-path="…">` so the existing
// citation-drift checker (scripts/check-reference-citations.mjs FP_RE) verifies
// the file:line still exists. Advisory citations use a non-`fp` class so the
// checker's `\bfp\b` match ignores them (the gate never blocks on them).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const remarkCite: AnyPlugin = () => (tree: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type !== 'textDirective' || node.name !== 'cite') return
    const path = mdToString(node).trim()
    const advisory = String(node.attributes?.mode ?? '').toLowerCase() === 'advisory'
    node.data = node.data ?? {}
    node.data.hName = 'span'
    // camelCase `dataPath` matches the hast property convention and the
    // sanitize allowlist (sanitize.ts) — serializes to the data-path attribute.
    node.data.hProperties = {
      className: advisory ? 'cite-advisory' : 'fp',
      dataPath: path,
    }
    node.children = [{ type: 'text', value: path }]
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
