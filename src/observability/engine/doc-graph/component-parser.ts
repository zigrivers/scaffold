import type { SanctionedComponent } from '../types.js'
import { parseMarkdown, headingsAtDepth, sectionRawText, slugify } from './parse-markdown.js'

function parseFields(body: string): { package_or_url?: string; layer?: string } {
  const out: { package_or_url?: string; layer?: string } = {}
  const fieldRe = /^\s*([a-z][\w-]*)\s*:\s*(.+?)\s*$/gim
  let m: RegExpExecArray | null
  while ((m = fieldRe.exec(body)) !== null) {
    const key = m[1].replace(/-/g, '_').toLowerCase()
    const raw = m[2].trim()
    if (key === 'package_or_url') out.package_or_url = raw
    if (key === 'layer') out.layer = raw.toLowerCase()
  }
  return out
}

export function parseSanctionedComponents(md: string, sourcePath = 'docs/tech-stack.md'): SanctionedComponent[] {
  const root = parseMarkdown(md)
  const h2s = headingsAtDepth(root, 2)
  const h3s = headingsAtDepth(root, 3)
  const out: SanctionedComponent[] = []

  for (const h3 of h3s) {
    const body = sectionRawText(root, h3)
    const fields = parseFields(body)
    if (!fields.package_or_url) continue

    let layer = fields.layer
    if (!layer) {
      const ancestor = [...h2s].reverse().find((h) => h.startIndex < h3.startIndex)
      if (ancestor) layer = ancestor.textContent.replace(/\[[^\]]*\]/g, '').trim().toLowerCase()
    }

    const slug = slugify(h3.textContent)
    out.push({
      id: `component:${slug}`,
      package_or_url: fields.package_or_url,
      layer,
      source_anchor: `${sourcePath}#${slug}`,
    })
  }
  return out
}
