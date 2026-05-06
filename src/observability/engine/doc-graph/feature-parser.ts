import type { Feature } from '../types.js'
import { parseMarkdown, headingsAtDepth, sectionAfterHeading, extractInlineTags, slugify } from './parse-markdown.js'
import type { Root, Heading, RootContent } from 'mdast'

const VALID_PRIORITIES = ['must', 'should', 'could', 'wont'] as const
type Priority = typeof VALID_PRIORITIES[number]

function nodeText(node: RootContent): string {
  if ('value' in node) return (node as { value: string }).value
  if ('children' in node && Array.isArray((node as { children?: unknown }).children)) {
    return ((node as { children: RootContent[] }).children).map(nodeText).join('')
  }
  return ''
}

function priorityFromText(text: string, tags: Record<string, string>): Priority {
  if (tags.priority && (VALID_PRIORITIES as readonly string[]).includes(tags.priority)) {
    return tags.priority as Priority
  }
  const m = text.match(/\((Must|Should|Could|Won'?t)\)/i)
  if (m) {
    const v = m[1].toLowerCase().replace(/['']/g, '')
    return v === 'wont' ? 'wont' : (v as Priority)
  }
  return 'should'
}

function titleFromHeading(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s*\((Must|Should|Could|Won'?t)\)\s*/i, '')
    .trim()
}

export function parseFeatures(md: string, sourcePath = 'docs/plan.md'): Feature[] {
  const root = parseMarkdown(md)
  const featuresHeading = headingsAtDepth(root, 2).find((h) =>
    /^Features?\b/i.test(h.textContent.replace(/\[[^\]]*\]/g, '').trim()),
  )
  if (!featuresHeading) return []

  const start = featuresHeading.startIndex + 1
  let end = root.children.length
  for (let i = start; i < root.children.length; i++) {
    const c = root.children[i]
    if (c.type === 'heading' && (c as Heading).depth <= 2) { end = i; break }
  }

  const features: Feature[] = []
  for (let i = start; i < end; i++) {
    const c = root.children[i]
    if (c.type !== 'heading' || (c as Heading).depth !== 3) continue
    const h = c as Heading
    const textContent = (h.children as RootContent[]).map(nodeText).join('').trim()
    const title = titleFromHeading(textContent)
    const tags = extractInlineTags(textContent)
    const priority = priorityFromText(textContent, tags)
    const slug = slugify(title)
    const annotated = {
      node: h,
      textContent,
      depth: 3,
      startIndex: i,
    }
    const prose = sectionAfterHeading(root as Root, annotated)
    features.push({
      id: `feature:${slug}`,
      title,
      priority,
      source_anchor: `${sourcePath}#${slug}`,
      prose,
    })
  }

  // Deduplicate IDs that collide after slugification
  const seen = new Map<string, number>()
  for (const f of features) {
    const count = (seen.get(f.id) ?? 0) + 1
    seen.set(f.id, count)
    if (count > 1) f.id = `${f.id}-${count}`
  }

  return features
}
