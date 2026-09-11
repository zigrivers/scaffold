import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

// Mock getPackageRoot so we can control where source skills are found
vi.mock('../../utils/fs.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../utils/fs.js')>(),
  getPackageRoot: vi.fn(() => '/mock-package-root'),
}))

import { syncSkillsIfNeeded, installAllSkills, SKILL_TARGETS, INSTALLABLE_SKILLS } from './sync.js'
import { getPackageRoot } from '../../utils/fs.js'

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-sync-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Seed skill template source files in a fake package root.
 * Uses the template format with {{INSTRUCTIONS_FILE}} markers.
 */
function seedSkillTemplates(packageRoot: string): void {
  for (const skill of INSTALLABLE_SKILLS) {
    const skillDir = path.join(packageRoot, 'content', 'skills', skill.name)
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `# ${skill.name}\nInstructions file: {{INSTRUCTIONS_FILE}}\n`,
      'utf8',
    )
  }
}

/**
 * Write a version marker file in the given target directory.
 */
function seedVersionMarker(projectRoot: string, installDir: string, version: string): void {
  const dir = path.join(projectRoot, installDir)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '.scaffold-skill-version'), version, 'utf8')
}

describe('INSTALLABLE_SKILLS', () => {
  it('includes work-beads in INSTALLABLE_SKILLS', () => {
    expect(INSTALLABLE_SKILLS.map(s => s.name)).toContain('work-beads')
  })
})

describe('syncSkillsIfNeeded', () => {
  let tmpDir: string
  let packageRoot: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    packageRoot = makeTmpDir()
    vi.mocked(getPackageRoot).mockReturnValue(packageRoot)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(packageRoot, { recursive: true, force: true })
  })

  it('installs skills when no version marker exists', () => {
    seedSkillTemplates(packageRoot)

    syncSkillsIfNeeded(tmpDir)

    // Skills should be installed in both targets
    for (const target of SKILL_TARGETS) {
      for (const skill of INSTALLABLE_SKILLS) {
        const skillPath = path.join(tmpDir, target.installDir, skill.name, 'SKILL.md')
        expect(fs.existsSync(skillPath)).toBe(true)
      }
    }
  })

  it('resolves {{INSTRUCTIONS_FILE}} to CLAUDE.md for .claude/skills/', () => {
    seedSkillTemplates(packageRoot)

    syncSkillsIfNeeded(tmpDir)

    const content = fs.readFileSync(
      path.join(tmpDir, '.claude', 'skills', INSTALLABLE_SKILLS[0].name, 'SKILL.md'),
      'utf8',
    )
    expect(content).toContain('Instructions file: CLAUDE.md')
    expect(content).not.toContain('{{INSTRUCTIONS_FILE}}')
  })

  it('resolves {{INSTRUCTIONS_FILE}} to AGENTS.md for .agents/skills/', () => {
    seedSkillTemplates(packageRoot)

    syncSkillsIfNeeded(tmpDir)

    const content = fs.readFileSync(
      path.join(tmpDir, '.agents', 'skills', INSTALLABLE_SKILLS[0].name, 'SKILL.md'),
      'utf8',
    )
    expect(content).toContain('Instructions file: AGENTS.md')
    expect(content).not.toContain('{{INSTRUCTIONS_FILE}}')
  })

  it('skips sync when version marker matches package version', () => {
    seedSkillTemplates(packageRoot)

    // First install to create the skills and markers
    installAllSkills(tmpDir)

    // Spy on writeFileSync after initial install
    const writeSpy = vi.spyOn(fs, 'writeFileSync')

    // syncSkillsIfNeeded should detect markers match and skip
    syncSkillsIfNeeded(tmpDir)

    expect(writeSpy).not.toHaveBeenCalled()
    writeSpy.mockRestore()
  })

  it('re-syncs when version marker is stale', () => {
    seedSkillTemplates(packageRoot)

    // Seed stale version markers
    for (const target of SKILL_TARGETS) {
      seedVersionMarker(tmpDir, target.installDir, '0.0.0-old')
    }

    syncSkillsIfNeeded(tmpDir)

    // Skills should have been installed
    for (const target of SKILL_TARGETS) {
      for (const skill of INSTALLABLE_SKILLS) {
        const skillPath = path.join(tmpDir, target.installDir, skill.name, 'SKILL.md')
        expect(fs.existsSync(skillPath)).toBe(true)
      }
      // Version marker should be updated
      const marker = fs.readFileSync(
        path.join(tmpDir, target.installDir, '.scaffold-skill-version'),
        'utf8',
      )
      expect(marker).not.toBe('0.0.0-old')
    }
  })

  it('skips silently when template source is missing', () => {
    // Don't seed any templates — packageRoot has no content/skills/

    // Should not throw
    syncSkillsIfNeeded(tmpDir)

    // No skills should be installed
    for (const target of SKILL_TARGETS) {
      for (const skill of INSTALLABLE_SKILLS) {
        const skillPath = path.join(tmpDir, target.installDir, skill.name, 'SKILL.md')
        expect(fs.existsSync(skillPath)).toBe(false)
      }
    }
  })
})

describe('installAllSkills', () => {
  let tmpDir: string
  let packageRoot: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    packageRoot = makeTmpDir()
    vi.mocked(getPackageRoot).mockReturnValue(packageRoot)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(packageRoot, { recursive: true, force: true })
  })

  it('installs all skills to both target directories', () => {
    seedSkillTemplates(packageRoot)

    const result = installAllSkills(tmpDir)

    expect(result.installed).toBe(INSTALLABLE_SKILLS.length * SKILL_TARGETS.length)
    expect(result.errors).toEqual([])

    for (const target of SKILL_TARGETS) {
      for (const skill of INSTALLABLE_SKILLS) {
        const skillPath = path.join(tmpDir, target.installDir, skill.name, 'SKILL.md')
        expect(fs.existsSync(skillPath)).toBe(true)
      }
    }
  })

  it('installs reference pages with target-specific variables and preserves local edits without force', () => {
    seedSkillTemplates(packageRoot)
    const references = path.join(packageRoot, 'content', 'skills', 'scaffold-runner', 'references')
    fs.mkdirSync(references)
    fs.writeFileSync(path.join(references, 'execution.md'), 'Read {{INSTRUCTIONS_FILE}} before execution.')

    expect(installAllSkills(tmpDir).errors).toEqual([])
    for (const target of SKILL_TARGETS) {
      const page = path.join(tmpDir, target.installDir, 'scaffold-runner', 'references', 'execution.md')
      expect(fs.readFileSync(page, 'utf8')).toBe(`Read ${target.templateVars.INSTRUCTIONS_FILE} before execution.`)
      fs.writeFileSync(page, 'Local execution policy')
    }
    // A missing entry file must not make an existing local reference disposable.
    fs.unlinkSync(path.join(tmpDir, '.agents/skills/scaffold-runner/SKILL.md'))
    installAllSkills(tmpDir)
    for (const target of SKILL_TARGETS) {
      const page = path.join(tmpDir, target.installDir, 'scaffold-runner', 'references', 'execution.md')
      expect(fs.readFileSync(page, 'utf8')).toBe('Local execution policy')
    }
    installAllSkills(tmpDir, { force: true })
    const sharedPage = path.join(tmpDir, '.agents/skills/scaffold-runner/references/execution.md')
    expect(fs.readFileSync(sharedPage, 'utf8')).toBe('Read AGENTS.md before execution.')
  })

  it('completes an interrupted bundle while preserving existing files', () => {
    seedSkillTemplates(packageRoot)
    const source = path.join(packageRoot, 'content/skills/scaffold-runner/references')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'execution.md'), 'Read {{INSTRUCTIONS_FILE}}.')
    fs.writeFileSync(path.join(source, 'recovery.md'), 'Bundled recovery')
    const destination = path.join(tmpDir, '.agents/skills/scaffold-runner')
    fs.mkdirSync(path.join(destination, 'references'), { recursive: true })
    fs.writeFileSync(path.join(destination, 'SKILL.md'), 'Local entry')
    fs.writeFileSync(path.join(destination, 'references/recovery.md'), 'Local recovery')

    const result = installAllSkills(tmpDir)

    expect(result.errors).toEqual([])
    expect(fs.readFileSync(path.join(destination, 'references/execution.md'), 'utf8')).toBe('Read AGENTS.md.')
    expect(fs.readFileSync(path.join(destination, 'SKILL.md'), 'utf8')).toBe('Local entry')
    expect(fs.readFileSync(path.join(destination, 'references/recovery.md'), 'utf8')).toBe('Local recovery')
    expect(installAllSkills(tmpDir).installed).toBe(0)
  })

  it('leaves a failed target stale so automatic sync can finish its bundle', () => {
    seedSkillTemplates(packageRoot)
    const source = path.join(packageRoot, 'content/skills/scaffold-runner/references')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'execution.md'), 'Read {{INSTRUCTIONS_FILE}}.')
    const target = path.join(tmpDir, '.agents/skills')
    const marker = path.join(target, '.scaffold-skill-version')
    const page = path.join(target, 'scaffold-runner/references/execution.md')
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(marker, 'previous version')
    const writeFile = fs.writeFileSync.bind(fs)
    const rename = fs.renameSync.bind(fs)
    const failure = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (to === page) {
        writeFile(from, 'Incomplete page', 'utf8')
        throw new Error('Reference write interrupted')
      }
      return rename(from, to)
    })

    const result = installAllSkills(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(fs.existsSync(marker)).toBe(false)
    expect(fs.existsSync(page)).toBe(false)
    failure.mockRestore()
    syncSkillsIfNeeded(tmpDir)
    expect(fs.readFileSync(page, 'utf8')).toBe('Read AGENTS.md.')
    expect(fs.existsSync(marker)).toBe(true)
  })

  it('writes version markers', () => {
    seedSkillTemplates(packageRoot)

    installAllSkills(tmpDir)

    for (const target of SKILL_TARGETS) {
      const markerPath = path.join(tmpDir, target.installDir, '.scaffold-skill-version')
      expect(fs.existsSync(markerPath)).toBe(true)
      const version = fs.readFileSync(markerPath, 'utf8')
      expect(version.length).toBeGreaterThan(0)
    }
  })

  it('overwrites existing skills when force is true', () => {
    seedSkillTemplates(packageRoot)

    // First install
    installAllSkills(tmpDir)

    // Write custom content to a skill file
    const skillPath = path.join(tmpDir, '.claude', 'skills', INSTALLABLE_SKILLS[0].name, 'SKILL.md')
    fs.writeFileSync(skillPath, '# custom content that should be overwritten', 'utf8')

    // Reinstall with force
    const result = installAllSkills(tmpDir, { force: true })

    expect(result.installed).toBe(INSTALLABLE_SKILLS.length * SKILL_TARGETS.length)
    const content = fs.readFileSync(skillPath, 'utf8')
    expect(content).toContain('Instructions file: CLAUDE.md')
    expect(content).not.toContain('custom content')
  })
})
