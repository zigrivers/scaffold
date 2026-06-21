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
  return `---\nname: ${skill.name}\ndescription: ${yamlDoubleQuote(skill.description)}\n---\n\n`
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

/** Emit a YAML double-quoted scalar, escaping backslashes and quotes. */
function yamlDoubleQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
