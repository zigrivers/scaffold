import { visit } from 'unist-util-visit'
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
