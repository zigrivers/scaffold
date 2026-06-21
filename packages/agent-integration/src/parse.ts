import yaml from 'js-yaml'
import type { CanonicalSkill } from './types.js'

const LEAN_START = '<!-- lean:start -->'
const LEAN_END = '<!-- lean:end -->'

/**
 * Parse a canonical skill from `SKILL.md`-format Markdown: a `---` frontmatter
 * block (real YAML) carrying `name` and `description`, followed by the body. The
 * lean form is the `<!-- lean:start -->…<!-- lean:end -->` fence if present, else
 * the body's intro (before the first `##` heading), else the full body.
 *
 * Throws when the frontmatter, `name`, or `description` is missing, or when a
 * lean fence is opened but never closed — these are author errors a generator
 * must surface loudly rather than silently mis-render.
 */
export function parseCanonicalSkill(markdown: string): CanonicalSkill {
  const { fields, body: rawBody } = extractFrontmatter(markdown)
  const name = typeof fields.name === 'string' ? fields.name : undefined
  const description = typeof fields.description === 'string' ? fields.description : undefined
  if (!name) throw new Error('Canonical skill is missing required frontmatter field: name')
  if (!description) throw new Error(`Canonical skill "${name}" is missing required frontmatter field: description`)

  const body = rawBody.trim()
  return { name, description, body, lean: deriveLean(body) }
}

interface Frontmatter {
  fields: Record<string, unknown>
  body: string
}

/**
 * Extract a leading `---` frontmatter block and YAML-parse it; the rest is the
 * body. Trailing whitespace after either `---` delimiter is tolerated.
 */
function extractFrontmatter(markdown: string): Frontmatter {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/.exec(normalized)
  if (!match) throw new Error('Canonical skill is missing its --- frontmatter block')
  const parsed = yaml.load(match[1])
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Canonical skill frontmatter is not a YAML mapping')
  }
  return { fields: parsed as Record<string, unknown>, body: normalized.slice(match[0].length) }
}

/**
 * The lean form for AGENTS.md / Cursor: prefer an explicit `lean` fence; else
 * the intro (everything before the first `##` heading); else the whole body.
 */
function deriveLean(body: string): string {
  const start = body.indexOf(LEAN_START)
  const end = body.indexOf(LEAN_END)
  if (start !== -1 && end === -1) {
    throw new Error('Canonical skill has a <!-- lean:start --> with no matching <!-- lean:end -->')
  }
  if (start === -1 && end !== -1) {
    throw new Error('Canonical skill has a <!-- lean:end --> with no matching <!-- lean:start -->')
  }
  if (start !== -1 && end !== -1) {
    if (end < start) throw new Error('Canonical skill lean fence is inverted (<!-- lean:end --> before start)')
    return body.slice(start + LEAN_START.length, end).trim()
  }
  const heading = /^##\s/m.exec(body)
  if (heading && heading.index > 0) return body.slice(0, heading.index).trim()
  return body
}
