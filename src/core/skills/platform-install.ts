import fs from 'node:fs'
import path from 'node:path'
import { getSkillTemplateDir, INSTALLABLE_SKILLS, resolveSkillTemplate } from './sync.js'

// All non-Claude hosts use AGENTS.md as their standing-instructions file, so the
// skill templates' {{INSTRUCTIONS_FILE}} marker resolves to AGENTS.md for every
// platform here (Claude Code → CLAUDE.md is handled by the auto-sync).
const TEMPLATE_VARS: Record<string, string> = { INSTRUCTIONS_FILE: 'AGENTS.md' }

function loadResolved(templateDir: string, name: string, file: string): string {
  return resolveSkillTemplate(fs.readFileSync(path.join(templateDir, name, file), 'utf8'), TEMPLATE_VARS)
}

/**
 * Platforms that consume the scaffold skills in a non-`SKILL.md` form. Claude
 * Code and shared agents get the full `SKILL.md` via the auto-sync
 * (`installAllSkills`); these targets are installed explicitly with
 * `scaffold skill install --platform <name>` because they write into the user's
 * own files (`AGENTS.md`, `.cursor/rules/`).
 */
export const SKILL_PLATFORMS = ['codex', 'antigravity', 'cursor', 'opencode'] as const
export type SkillPlatform = (typeof SKILL_PLATFORMS)[number]

/** Per-skill managed-block delimiters for the shared `AGENTS.md` file. */
const blockBegin = (name: string): string => `<!-- BEGIN scaffold-skill:${name} -->`
const blockEnd = (name: string): string => `<!-- END scaffold-skill:${name} -->`

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Insert or replace a per-skill managed block in `existing`. Content outside the
 * block is preserved; a missing block is appended (separated by a blank line).
 */
export function upsertManagedBlock(existing: string, name: string, body: string): string {
  const block = `${blockBegin(name)}\n${body.trimEnd()}\n${blockEnd(name)}\n`
  const re = new RegExp(`${escapeRe(blockBegin(name))}[\\s\\S]*${escapeRe(blockEnd(name))}\\r?\\n?`)
  if (re.test(existing)) {
    // Replacer fn so $-patterns in the body are inserted literally.
    return existing.replace(re, () => block)
  }
  if (existing.trim() === '') return block
  const sep = existing.endsWith('\n') ? '\n' : '\n\n'
  return `${existing}${sep}${block}`
}

export interface PlatformInstallResult {
  installed: string[]
  skipped: string[]
  errors: string[]
}

export interface PlatformInstallOptions {
  /** Overwrite an existing dedicated file (Cursor .mdc / OpenCode SKILL.md). */
  force?: boolean
}

/**
 * Install every scaffold skill into a project in the native form of `platform`:
 *  - codex / antigravity → a per-skill managed block in `AGENTS.md` (the lean form)
 *  - cursor → `.cursor/rules/<name>.mdc`
 *  - opencode → `.opencode/skills/<name>/SKILL.md` (the full Agent Skill)
 *
 * The generated forms are read from the bundled templates (`content/skills/<name>/`).
 */
export function installSkillsForPlatform(
  projectRoot: string,
  platform: SkillPlatform,
  options: PlatformInstallOptions = {},
): PlatformInstallResult {
  const templateDir = getSkillTemplateDir()
  const installed: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  // Write a dedicated file. A file that already matches is a silent no-op (so a
  // re-run after a no-op upgrade is quiet); one that DIFFERS is left alone
  // without --force but reported as stale, so the user gets a clear "out of
  // date — use --force to update" signal rather than silently keeping old content.
  const writeDedicated = (target: string, rel: string, body: string): void => {
    if (fs.existsSync(target)) {
      if (fs.readFileSync(target, 'utf8') === body) return // already up to date
      if (!options.force) {
        skipped.push(`${rel} (differs from the current template — use --force to update)`)
        return
      }
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, body)
    installed.push(rel)
  }

  for (const skill of INSTALLABLE_SKILLS) {
    try {
      if (platform === 'codex' || platform === 'antigravity') {
        // Managed block: always safe to upsert (only the delimited region changes).
        const body = loadResolved(templateDir, skill.name, 'agents-block.md')
        const target = path.join(projectRoot, 'AGENTS.md')
        const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
        fs.writeFileSync(target, upsertManagedBlock(existing, skill.name, body))
        installed.push(`AGENTS.md (${skill.name})`)
      } else if (platform === 'cursor') {
        writeDedicated(
          path.join(projectRoot, '.cursor', 'rules', `${skill.name}.mdc`),
          path.join('.cursor', 'rules', `${skill.name}.mdc`),
          loadResolved(templateDir, skill.name, 'cursor.mdc'),
        )
      } else {
        // opencode — the full Agent Skill (dir name must match the skill name).
        writeDedicated(
          path.join(projectRoot, '.opencode', 'skills', skill.name, 'SKILL.md'),
          path.join('.opencode', 'skills', skill.name, 'SKILL.md'),
          loadResolved(templateDir, skill.name, 'SKILL.md'),
        )
      }
    } catch (err) {
      errors.push(`Failed to install ${skill.name} for ${platform}: ${err}`)
    }
  }

  return { installed, skipped, errors }
}
