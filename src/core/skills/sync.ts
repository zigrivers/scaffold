import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPackageRoot } from '../../utils/fs.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillTarget {
  installDir: '.claude/skills' | '.agents/skills'
  label: string
  templateVars: Record<string, string>
}

export interface SkillDefinition {
  name: string
  description: string
}

export interface InstallResult {
  installed: number
  errors: string[]
}

export interface InstallOptions {
  force?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SKILL_TARGETS: SkillTarget[] = [
  {
    installDir: '.claude/skills',
    label: 'Claude Code',
    templateVars: { INSTRUCTIONS_FILE: 'CLAUDE.md' },
  },
  {
    installDir: '.agents/skills',
    label: 'shared agents',
    templateVars: { INSTRUCTIONS_FILE: 'AGENTS.md' },
  },
]

export const INSTALLABLE_SKILLS: SkillDefinition[] = [
  {
    name: 'scaffold-runner',
    description: 'Interactive CLI wrapper that surfaces decision points before execution',
  },
  {
    name: 'scaffold-pipeline',
    description: 'Static reference for pipeline ordering, dependencies, and phase structure',
  },
]

const VERSION_MARKER_FILE = '.scaffold-skill-version'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace `{{KEY}}` template markers with values from `vars`. */
export function resolveSkillTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
}

/** Read the package version from package.json. */
export function getPackageVersion(): string {
  // Both src/core/skills/ and dist/core/skills/ are 3 levels deep from the package root
  const thisDir = path.dirname(fileURLToPath(import.meta.url))
  const pkgPath = path.resolve(thisDir, '..', '..', '..', 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  return pkg.version as string
}

/** Return the directory containing skill template sources. */
export function getSkillTemplateDir(): string {
  return path.join(getPackageRoot(), 'content', 'skills')
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Check `.scaffold-skill-version` markers in each target directory.
 * If any marker is missing or stale, reinstall all skills.
 * Skips silently if template source files are missing.
 */
export function syncSkillsIfNeeded(projectRoot: string): void {
  const currentVersion = getPackageVersion()

  // Fast path: check if all markers match the current version
  const allCurrent = SKILL_TARGETS.every(target => {
    const markerPath = path.join(projectRoot, target.installDir, VERSION_MARKER_FILE)
    if (!fs.existsSync(markerPath)) return false
    const markerVersion = fs.readFileSync(markerPath, 'utf8').trim()
    return markerVersion === currentVersion
  })

  if (allCurrent) return

  // At least one target is stale or missing — reinstall
  installAllSkills(projectRoot)
}

/**
 * Install all skill templates to both target directories, resolving
 * template variables per target. Writes version markers on success.
 */
export function installAllSkills(projectRoot: string, options?: InstallOptions): InstallResult {
  const force = options?.force ?? false
  const templateDir = getSkillTemplateDir()
  const currentVersion = getPackageVersion()
  let installed = 0
  const errors: string[] = []

  for (const target of SKILL_TARGETS) {
    for (const skill of INSTALLABLE_SKILLS) {
      const sourcePath = path.join(templateDir, skill.name, 'SKILL.md')

      if (!fs.existsSync(sourcePath)) {
        // Skip silently — template source not bundled
        continue
      }

      const destDir = path.join(projectRoot, target.installDir, skill.name)
      const destPath = path.join(destDir, 'SKILL.md')

      if (fs.existsSync(destPath) && !force) {
        // Already present and not forcing — still count it if it exists
        continue
      }

      try {
        fs.mkdirSync(destDir, { recursive: true })
        const template = fs.readFileSync(sourcePath, 'utf8')
        const resolved = resolveSkillTemplate(template, target.templateVars)
        fs.writeFileSync(destPath, resolved, 'utf8')
        installed++
      } catch (err) {
        errors.push(`Failed to install ${skill.name} to ${target.installDir}: ${err}`)
      }
    }

    // Write version marker for this target
    const targetDir = path.join(projectRoot, target.installDir)
    try {
      fs.mkdirSync(targetDir, { recursive: true })
      fs.writeFileSync(path.join(targetDir, VERSION_MARKER_FILE), currentVersion, 'utf8')
    } catch (err) {
      errors.push(`Failed to write version marker to ${target.installDir}: ${err}`)
    }
  }

  return { installed, errors }
}
