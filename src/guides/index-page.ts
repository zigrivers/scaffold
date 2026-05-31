import type { GuideEntry } from './types.js'
import { wrapInChrome, esc } from './template.js'

const CATEGORY_ORDER = ['concepts', 'reference', 'workflows', 'tools']
const CATEGORY_LABEL: Record<string, string> = {
  concepts: 'Concepts',
  reference: 'Reference',
  workflows: 'Workflows',
  tools: 'Tools',
}

function catLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1)
}
function catId(c: string): string {
  return 'cat-' + c.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function renderIndexPage(entries: GuideEntry[], css: string): string {
  const sorted = [...entries].sort((a, b) => a.frontmatter.order - b.frontmatter.order)

  // Group by category, preserving order within each group.
  const byCat = new Map<string, GuideEntry[]>()
  for (const e of sorted) {
    const c = e.frontmatter.category
    if (!byCat.has(c)) byCat.set(c, [])
    byCat.get(c)!.push(e)
  }
  const cats = [...byCat.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })

  const headings = cats.map((c) => ({ depth: 2 as const, text: catLabel(c), id: catId(c) }))
  const sections = cats
    .map((c) => {
      const cards = byCat
        .get(c)!
        .map(
          (e) =>
            `<a class="guide-card" href="${e.topic}/index.html">` +
            `<span class="guide-card-title">${esc(e.frontmatter.title)}</span>` +
            `<span class="guide-card-desc">${esc(e.frontmatter.description)}</span></a>`,
        )
        .join('')
      return `<h2 id="${catId(c)}">${esc(catLabel(c))}</h2><div class="guide-cards">${cards}</div>`
    })
    .join('')

  const intro =
    '<p class="lead">Reference guides for Scaffold — human- and agent-readable. ' +
    'Open a guide to read it in your browser; agents read the markdown source with ' +
    '<code>scaffold guides &lt;topic&gt; --markdown</code>.</p>'

  return wrapInChrome({ title: 'Scaffold Guides', body: intro + sections, headings, css })
}
