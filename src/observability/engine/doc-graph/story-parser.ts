import type { Story, AcceptanceCriterion } from '../types.js'
import { parseMarkdown, headingsAtDepth, sectionAfterHeading, extractInlineTags, slugify } from './parse-markdown.js'
import type { Root, Heading, List, RootContent } from 'mdast'

interface ParsedStories { stories: Story[]; acs: AcceptanceCriterion[] }
const VALID_PRIORITIES = ['must', 'should', 'could', 'wont'] as const

function nodeTextRecursive(n: { type: string; value?: string; children?: unknown[] }): string {
  if (n.type === 'text' || n.type === 'inlineCode') return n.value ?? ''
  if (Array.isArray(n.children)) return (n.children as typeof n[]).map(nodeTextRecursive).join('')
  return ''
}

function priorityFromTags(tags: Record<string, string>): Story['priority'] {
  return (VALID_PRIORITIES as readonly string[]).includes(tags.priority)
    ? (tags.priority as Story['priority'])
    : 'should'
}

function parseStoryHeading(text: string): { storyKey: string; title: string } | null {
  const stripped = text.replace(/\[[^\]]*\]/g, '').trim()
  const m = stripped.match(/^(?:Story\s+)?([A-Za-z0-9][\w-]+):\s*(.+)$/)
  if (m) return { storyKey: m[1], title: m[2].trim() }
  return null
}

function parseAcsFromSection(
  root: Root, story: Story, storyStartIdx: number, storyEndIdx: number,
): AcceptanceCriterion[] {
  const out: AcceptanceCriterion[] = []

  // (a) ### AC <n>: <title> headings
  for (let i = storyStartIdx + 1; i < storyEndIdx; i++) {
    const c = root.children[i]
    if (c.type !== 'heading' || (c as Heading).depth !== 3) continue
    const headingText = nodeTextRecursive(c as never).trim()
    const acMatch = headingText.match(/^AC\s*(\d+)\b\s*:?\s*(.*)$/i)
    if (!acMatch) continue
    const annotated = { node: c as never, textContent: headingText, depth: 3, startIndex: i }
    const sectionText = sectionAfterHeading(root, annotated)
    const acId = `ac:${story.id.replace(/^story:/, '')}.${acMatch[1]}`
    const bodyText = [acMatch[2] ? acMatch[2] : '', sectionText].filter(Boolean).join('\n\n').trim()
    out.push({
      id: acId,
      story_id: story.id,
      text: bodyText.slice(0, 500),
      source_anchor: `docs/user-stories.md#${acId.replace(/[:.]/g, '-')}`,
    })
  }
  if (out.length > 0) return out

  // (b) ### Acceptance Criteria followed by ordered/unordered list
  for (let i = storyStartIdx + 1; i < storyEndIdx; i++) {
    const c = root.children[i]
    if (c.type !== 'heading' || (c as Heading).depth !== 3) continue
    const headingText = nodeTextRecursive(c as never).trim()
    if (!/^Acceptance\s+Criteria\b/i.test(headingText)) continue
    for (let j = i + 1; j < storyEndIdx; j++) {
      const n = root.children[j] as RootContent
      if (n.type === 'heading' && (n as Heading).depth <= 3) break
      if (n.type !== 'list') continue
      const list = n as List
      for (let k = 0; k < list.children.length; k++) {
        const item = list.children[k]
        const text = nodeTextRecursive(item as never).trim()
        const acId = `ac:${story.id.replace(/^story:/, '')}.${k + 1}`
        out.push({
          id: acId,
          story_id: story.id,
          text: text.slice(0, 500),
          source_anchor: `docs/user-stories.md#${acId.replace(/[:.]/g, '-')}`,
        })
      }
      break
    }
  }
  return out
}

export function parseStories(md: string): ParsedStories {
  const root = parseMarkdown(md)
  const h2s = headingsAtDepth(root, 2)
  const stories: Story[] = []
  const acs: AcceptanceCriterion[] = []

  for (let h = 0; h < h2s.length; h++) {
    const head = h2s[h]
    const parsed = parseStoryHeading(head.textContent)
    if (!parsed) continue
    const tags = extractInlineTags(head.textContent)
    const priority = priorityFromTags(tags)
    const kind = (['ui', 'api', 'data', 'infra', 'doc'] as const).find((k) => k === tags.kind)
    const rawFeature = tags.feature
    const featureId = rawFeature
      ? `feature:${slugify(rawFeature.startsWith('feature:') ? rawFeature.slice('feature:'.length) : rawFeature)}`
      : undefined
    const story: Story = {
      id: `story:${parsed.storyKey}`,
      title: parsed.title,
      priority,
      kind,
      feature_id: featureId,
      source_anchor: `docs/user-stories.md#story-${parsed.storyKey}`,
    }
    stories.push(story)

    const startIdx = head.startIndex
    const endIdx = h + 1 < h2s.length ? h2s[h + 1].startIndex : root.children.length
    acs.push(...parseAcsFromSection(root, story, startIdx, endIdx))
  }
  return { stories, acs }
}
