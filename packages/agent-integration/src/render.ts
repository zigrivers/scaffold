import yaml from 'js-yaml'
import type { CanonicalSkill } from './types.js'

/** Per-skill managed-block delimiters for shared instruction files (AGENTS.md). */
export function agentsBlockBegin(name: string): string {
  return `<!-- BEGIN agent-skill:${name} -->`
}
export function agentsBlockEnd(name: string): string {
  return `<!-- END agent-skill:${name} -->`
}

/** Strip the lean fence markers so they never leak into a rendered SKILL.md. */
function stripLeanMarkers(body: string): string {
  return body
    .replace(/<!-- lean:start -->\n?/g, '')
    .replace(/<!-- lean:end -->\n?/g, '')
    .trim()
}

/**
 * Render the full progressive-disclosure `SKILL.md` form: `name` + `description`
 * frontmatter (the only preloaded fields) followed by the complete body. Used by
 * hosts that auto-discover Agent Skills (Claude Code, OpenCode).
 */
export function renderSkillMd(skill: CanonicalSkill): string {
  return `---\nname: ${yamlScalarName(skill.name)}\ndescription: ${yamlDoubleQuote(skill.description)}\n`
    + `${renderExtraFrontmatter(skill.frontmatter)}---\n\n`
    + `${stripLeanMarkers(skill.body)}\n`
}

/**
 * Serialize any frontmatter fields beyond `name`/`description` (e.g. `topics:`)
 * so a richer canonical source round-trips into the full `SKILL.md`. Returns ''
 * when there are no extras. js-yaml handles types/quoting; `name`/`description`
 * are emitted explicitly above and excluded here.
 */
function renderExtraFrontmatter(frontmatter: CanonicalSkill['frontmatter']): string {
  const extras: Record<string, unknown> = { ...frontmatter }
  delete extras.name
  delete extras.description
  if (Object.keys(extras).length === 0) return ''
  return yaml.dump(extras, { lineWidth: -1 })
}

/**
 * Render the lean `AGENTS.md` managed block (Codex, Antigravity, OpenCode). Each
 * skill gets its OWN delimited block so it can be installed/updated/removed
 * independently. The lean body is used because AGENTS.md has no progressive
 * disclosure.
 */
export function renderAgentsBlock(skill: CanonicalSkill): string {
  return `${agentsBlockBegin(skill.name)}\n${skill.lean.trim()}\n${agentsBlockEnd(skill.name)}\n`
}

/** Per-skill overrides for {@link renderCursorMdc}. */
export interface CursorMdcOptions {
  /**
   * Force the rule to always load rather than only when Cursor's relevance
   * matching pulls it in. Defaults to `false` (kept lean per Cursor best
   * practice). Some skills need this: a skill whose activation depends on the
   * agent *continuing* past an early checkpoint (e.g. not stopping after a
   * draft PR) can't rely on description-matching alone, since matching only
   * runs again on a fresh, on-topic user message.
   */
  alwaysApply?: boolean
}

/**
 * Render a Cursor rule (`.cursor/rules/<name>.mdc`): `description` drives
 * relevance, `globs` is empty, and `alwaysApply` is false by default so the
 * rule loads only when the agent pulls it in (kept lean per Cursor best
 * practice) — pass `{ alwaysApply: true }` to force it to always load. One
 * file per skill — Cursor's native idiom.
 */
export function renderCursorMdc(skill: CanonicalSkill, options: CursorMdcOptions = {}): string {
  const alwaysApply = options.alwaysApply ?? false
  return `---\ndescription: ${yamlDoubleQuote(skill.description)}\nglobs:\nalwaysApply: ${alwaysApply}\n---\n\n`
    + `${skill.lean.trim()}\n`
}

/**
 * Emit a skill name as a YAML scalar. The serializer decides quoting: normal
 * kebab names stay plain (`mmr-review`), but any name a loader would read as a
 * non-string — boolean (`true`), null, number (`123`), hex (`0x1f`), date
 * (`2024-01-01`), etc. — is quoted so it round-trips as the string it is.
 */
function yamlScalarName(name: string): string {
  return yaml.dump(name, { lineWidth: -1 }).trim()
}

/**
 * Emit a YAML double-quoted scalar. Backslashes and quotes are escaped, common
 * whitespace controls (newline/tab/CR) use their named escapes, and every other
 * C0 control character (and DEL) is emitted as a `\xNN` escape — so no control
 * character can break the single-line frontmatter or yield invalid YAML.
 */
function yamlDoubleQuote(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === '\\') out += '\\\\'
    else if (ch === '"') out += '\\"'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    // C0 (+DEL) and C1 control characters are not printable in a YAML scalar.
    else if (code < 0x20 || code === 0x7F || (code >= 0x80 && code <= 0x9F)) {
      out += `\\x${code.toString(16).padStart(2, '0').toUpperCase()}`
    } else if (code === 0x2028 || code === 0x2029) {
      // Unicode line/paragraph separators are line breaks in YAML — escape them.
      out += `\\u${code.toString(16).padStart(4, '0').toUpperCase()}`
    } else out += ch
  }
  return `"${out}"`
}
