/**
 * The single source of truth for one agent "skill" — a reusable instruction
 * unit that teaches an agent how to use a tool (e.g. `mmr review`, the scaffold
 * pipeline). One canonical body is rendered into every per-platform form, so
 * coverage and content can no longer drift across CLIs.
 */
export interface CanonicalSkill {
  /** kebab-case, 1–64 chars; matches the skill directory name. */
  name: string
  /**
   * What the skill does AND when to use it. This is the ONLY field hosts
   * preload to decide relevance, so it must carry the trigger ("Use when …").
   */
  description: string
  /** Full Markdown body (no frontmatter) — rendered verbatim into `SKILL.md`. */
  body: string
  /**
   * The condensed body for hosts without progressive disclosure (the `AGENTS.md`
   * managed block and Cursor `.mdc`). Authored as a `<!-- lean:start -->…
   * <!-- lean:end -->` fence in the canonical source; when absent it falls back
   * to the body's intro (everything before the first `##` heading), then to the
   * full body.
   */
  lean: string
}

/** A host CLI the integration core renders skills for. */
export type Platform = 'claude-code' | 'opencode' | 'codex' | 'antigravity' | 'cursor'

/** How a given platform consumes a skill. */
export type SkillForm = 'skill-md' | 'agents-block' | 'cursor-mdc'
