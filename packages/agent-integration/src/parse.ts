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
  // 1–64 chars, lowercase alphanumeric with single-hyphen separators (the Agent
  // Skills spec). Also keeps the name safe to embed in the `<!-- BEGIN
  // agent-skill:<name> -->` markers — a name with `-->` would break the block.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw new Error(
      `Canonical skill name "${name}" must be kebab-case `
      + '(1–64 chars, lowercase alphanumeric with single-hyphen separators)',
    )
  }

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
  // Strip a leading UTF-8 BOM (editors add it) before matching the delimiter.
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
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
  const introEnd = firstHeadingOutsideCode(body)
  // introEnd === 0 means the body opens with a heading (no intro to extract), so
  // fall back to the full body rather than an empty lean.
  if (introEnd > 0) return body.slice(0, introEnd).trim()
  return body
}

/**
 * Offset of the first `##`+ heading that is NOT inside a fenced code block, or
 * -1 if none. Tracks fences per CommonMark so a `## ` line inside an example
 * (e.g. a shell comment) does not truncate the intro: a fence opens on `` ``` ``
 * / `~~~` (3+), and only a CLOSING fence of the SAME character, AT LEAST as
 * long, and with nothing after it ends the block — so a 3-backtick line inside
 * a 4-backtick block does not falsely close it.
 */
function firstHeadingOutsideCode(body: string): number {
  let offset = 0
  let fence: { char: string; len: number } | null = null
  for (const line of body.split('\n')) {
    // CommonMark allows up to 3 leading spaces before both fences and ATX
    // headings; match both with the same leniency for consistent detection.
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (marker) {
      const char = marker[1][0]
      const len = marker[1].length
      const rest = line.slice(marker[0].length).trim()
      if (!fence) {
        fence = { char, len } // opening fence — an info string in `rest` is allowed
      } else if (char === fence.char && len >= fence.len && rest === '') {
        fence = null // closing fence — same char, >= length, nothing after
      }
    } else if (!fence && /^ {0,3}#{2,}\s/.test(line)) {
      return offset // first level-2-or-deeper section heading outside a code fence
    }
    offset += line.length + 1
  }
  return -1
}
