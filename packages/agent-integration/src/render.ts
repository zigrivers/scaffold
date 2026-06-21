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
  return `---\nname: ${yamlScalarName(skill.name)}\ndescription: ${yamlDoubleQuote(skill.description)}\n---\n\n`
    + `${stripLeanMarkers(skill.body)}\n`
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

/**
 * Render a Cursor rule (`.cursor/rules/<name>.mdc`): `description` drives
 * relevance, `globs` is empty and `alwaysApply` is false so the rule loads only
 * when the agent pulls it in (kept lean per Cursor best practice). One file per
 * skill — Cursor's native idiom.
 */
export function renderCursorMdc(skill: CanonicalSkill): string {
  return `---\ndescription: ${yamlDoubleQuote(skill.description)}\nglobs:\nalwaysApply: false\n---\n\n`
    + `${skill.lean.trim()}\n`
}

/** YAML 1.1 plain scalars that a loader would read as a non-string. */
const YAML_AMBIGUOUS_PLAIN = /^(y|yes|n|no|true|false|on|off|null|~)$/i

/**
 * Emit a skill name as a YAML scalar — plain (unquoted) for normal kebab names,
 * but double-quoted when the name would otherwise be read as a boolean, null, or
 * number (e.g. `true`, `null`, `123`) rather than the string it is.
 */
function yamlScalarName(name: string): string {
  return YAML_AMBIGUOUS_PLAIN.test(name) || /^[0-9]+$/.test(name) ? yamlDoubleQuote(name) : name
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
