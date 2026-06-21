import fs from 'node:fs'
import path from 'node:path'
import { getSkillTemplateDir, INSTALLABLE_SKILLS } from './sync.js'

/**
 * Platforms that consume the scaffold skills in a non-`SKILL.md` form. Claude
 * Code and shared agents get the full `SKILL.md` via the auto-sync
 * (`installAllSkills`); these targets are installed explicitly with
 * `scaffold skill install --platform <name>` because they write into the user's
 * own files (`AGENTS.md`, `.cursor/rules/`).
 */
export const SKILL_PLATFORMS = ['codex', 'antigravity', 'cursor', 'opencode'] as const
export type SkillPlatform = (typeof SKILL_PLATFORMS)[number]

export function isSkillPlatform(value: string): value is SkillPlatform {
  return (SKILL_PLATFORMS as readonly string[]).includes(value)
}

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
  errors: string[]
}

/**
 * Install every scaffold skill into a project in the native form of `platform`:
 *  - codex / antigravity → a per-skill managed block in `AGENTS.md` (the lean form)
 *  - cursor → `.cursor/rules/<name>.mdc`
 *  - opencode → `.opencode/skills/<name>/SKILL.md` (the full Agent Skill)
 *
 * The generated forms are read from the bundled templates (`content/skills/<name>/`).
 */
export function installSkillsForPlatform(projectRoot: string, platform: SkillPlatform): PlatformInstallResult {
  const templateDir = getSkillTemplateDir()
  const installed: string[] = []
  const errors: string[] = []

  for (const skill of INSTALLABLE_SKILLS) {
    try {
      if (platform === 'codex' || platform === 'antigravity') {
        const body = fs.readFileSync(path.join(templateDir, skill.name, 'agents-block.md'), 'utf8')
        const target = path.join(projectRoot, 'AGENTS.md')
        const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
        fs.writeFileSync(target, upsertManagedBlock(existing, skill.name, body))
        installed.push(`AGENTS.md (${skill.name})`)
      } else if (platform === 'cursor') {
        const body = fs.readFileSync(path.join(templateDir, skill.name, 'cursor.mdc'), 'utf8')
        const target = path.join(projectRoot, '.cursor', 'rules', `${skill.name}.mdc`)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, body)
        installed.push(path.join('.cursor', 'rules', `${skill.name}.mdc`))
      } else {
        // opencode — the full Agent Skill (dir name must match the skill name).
        const body = fs.readFileSync(path.join(templateDir, skill.name, 'SKILL.md'), 'utf8')
        const target = path.join(projectRoot, '.opencode', 'skills', skill.name, 'SKILL.md')
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, body)
        installed.push(path.join('.opencode', 'skills', skill.name, 'SKILL.md'))
      }
    } catch (err) {
      errors.push(`Failed to install ${skill.name} for ${platform}: ${err}`)
    }
  }

  return { installed, errors }
}
