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
function buildTabsNode(tabNodes: any[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buttons = tabNodes.map((t: any, i: number) => ({
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const panes = tabNodes.map((t: any, i: number) => ({
    type: 'containerDirective',
    name: 'tab',
    data: {
      hName: 'div',
      hProperties: { className: 'tabpane' + (i === 0 ? ' active' : ''), 'data-tab': String(i) },
    },
    children: t.children ?? [],
    attributes: t.attributes,
  }))
  return {
    type: 'containerDirective',
    name: 'tabs',
    data: { hName: 'div', hProperties: { className: 'tabs' } },
    children: [tablist, ...panes],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const remarkTabs: AnyPlugin = () => (tree: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (!node.children) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newChildren: any[] = []
    let i = 0
    while (i < node.children.length) {
      const child = node.children[i]
      if (child.type !== 'containerDirective' || child.name !== 'tabs') {
        newChildren.push(child)
        i++
        continue
      }
      // Collect tab nodes: first look inside the tabs node's own children,
      // then consume any immediately following sibling tab directives.
      // remark-directive only nests the first tab; subsequent tabs become siblings.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tabNodes: any[] = []
      // tabs' direct children that are tab directives
      for (const c of child.children ?? []) {
        if (c.type === 'containerDirective' && c.name === 'tab') {
          tabNodes.push(c)
        }
      }
      // consume sibling tab directives
      let j = i + 1
      while (j < node.children.length) {
        const sib = node.children[j]
        if (sib.type === 'containerDirective' && sib.name === 'tab') {
          tabNodes.push(sib)
          j++
        } else {
          break
        }
      }
      newChildren.push(buildTabsNode(tabNodes))
      i = j
    }
    node.children = newChildren
  })
}
