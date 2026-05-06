import type { PlanTask } from '../types.js'
import { parseMarkdown, extractInlineTags } from './parse-markdown.js'
import type { Heading, RootContent } from 'mdast'

const VALID_STATUS = ['todo', 'in_flight', 'done', 'skipped'] as const

function headingText(h: Heading): string {
  return (h.children as RootContent[]).map((c) => ('value' in c ? (c as { value: string }).value : '')).join('').trim()
}

export function parsePlanTasks(md: string, sourcePath = 'docs/implementation-plan.md'): PlanTask[] {
  const root = parseMarkdown(md)
  const tasks: PlanTask[] = []

  for (const node of root.children) {
    if (node.type !== 'heading') continue
    const h = node as Heading
    if (h.depth !== 2 && h.depth !== 3) continue
    const text = headingText(h)
    const m = text.match(/^Task\s+([A-Za-z0-9][\w-]+):\s*(.+?)(?:\s*\[.*)?$/)
    if (!m) continue
    const [, key, rawTitle] = m
    const title = rawTitle.replace(/\s*\[[^\]]*\]\s*$/g, '').trim()
    const tags = extractInlineTags(text)
    const status = (VALID_STATUS as readonly string[]).includes(tags.status)
      ? (tags.status as PlanTask['status'])
      : 'todo'
    tasks.push({
      id: `plan_task:${key}`,
      title,
      status,
      story_id: tags.story
        ? (tags.story.startsWith('story:') ? tags.story : `story:${tags.story}`)
        : undefined,
      wave: tags.wave,
      source_anchor: `${sourcePath}#task-${key.toLowerCase()}`,
    })
  }
  return tasks
}
