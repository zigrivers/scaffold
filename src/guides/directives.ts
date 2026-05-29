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
