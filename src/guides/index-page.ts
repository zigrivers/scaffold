import type { GuideEntry } from './types.js'
import { wrapInChrome } from './template.js'

export function renderIndexPage(entries: GuideEntry[], css: string): string {
  const sorted = [...entries].sort((a, b) => a.frontmatter.order - b.frontmatter.order)
  const items = sorted.map((e) =>
    `<li><a href="${e.topic}/index.html"><strong>${e.frontmatter.title}</strong></a>` +
    `<span class="cat">${e.frontmatter.category}</span>` +
    `<p>${e.frontmatter.description}</p></li>`,
  ).join('')
  return wrapInChrome({
    title: 'Scaffold Guides',
    body: `<h2 id="guides">Guides</h2><ul class="guide-index">${items}</ul>`,
    headings: [{ depth: 2, text: 'Guides', id: 'guides' }],
    css,
  })
}
