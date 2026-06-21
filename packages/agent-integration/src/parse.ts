import type { CanonicalSkill } from './types.js'

const LEAN_START = '<!-- lean:start -->'
const LEAN_END = '<!-- lean:end -->'

/**
 * Parse a canonical skill from `SKILL.md`-format Markdown: a `---` frontmatter
 * block carrying `name` and `description`, followed by the body. The lean form
 * is the `<!-- lean:start -->…<!-- lean:end -->` fence if present, else the
 * body's intro (before the first `##` heading), else the full body.
 *
 * Throws when the frontmatter, `name`, or `description` is missing — these are
 * the fields hosts depend on, so a malformed source must fail loudly.
 */
export function parseCanonicalSkill(markdown: string): CanonicalSkill {
  const fm = extractFrontmatter(markdown)
  const name = fm.fields.name
  const description = fm.fields.description
  if (!name) throw new Error('Canonical skill is missing required frontmatter field: name')
  if (!description) throw new Error(`Canonical skill "${name}" is missing required frontmatter field: description`)

  const body = fm.body.trim()
  return { name, description, body, lean: deriveLean(body) }
}

interface Frontmatter {
  fields: Record<string, string>
  body: string
}

/** Extract a leading `---` frontmatter block; the rest is the body. */
function extractFrontmatter(markdown: string): Frontmatter {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  if (!match) throw new Error('Canonical skill is missing its --- frontmatter block')
  const fields: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (kv) fields[kv[1]] = unquote(kv[2].trim())
  }
  return { fields, body: normalized.slice(match[0].length) }
}

/** Strip a single layer of matching single or double quotes from a scalar. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    if ((first === '"' || first === '\'') && value[value.length - 1] === first) {
      return value.slice(1, -1).replace(/\\"/g, '"')
    }
  }
  return value
}

/**
 * The lean form for AGENTS.md / Cursor: prefer an explicit `lean` fence; else
 * the intro (everything before the first `##` heading); else the whole body.
 */
function deriveLean(body: string): string {
  const start = body.indexOf(LEAN_START)
  const end = body.indexOf(LEAN_END)
  if (start !== -1 && end !== -1 && end > start) {
    return body.slice(start + LEAN_START.length, end).trim()
  }
  const heading = /^##\s/m.exec(body)
  if (heading && heading.index > 0) return body.slice(0, heading.index).trim()
  return body
}
