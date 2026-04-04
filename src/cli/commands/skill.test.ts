import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

// Mock output-mode to control interactive vs json
vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'interactive'),
}))

// Mock getPackageRoot — sync.ts uses this internally via getSkillTemplateDir()
vi.mock('../../utils/fs.js', () => ({
  getPackageRoot: vi.fn(() => '/mock-package-root'),
}))

import skillCommand from './skill.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { getPackageRoot } from '../../utils/fs.js'

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-skill-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Create a fake package root with source SKILL.md files so install can find them.
 * In v3 architecture, both Claude Code and shared-agent targets install from
 * the same source at content/skills/<name>/SKILL.md.
 */
function makePackageSkillsDir(
  packageRoot: string,
): void {
  for (const name of ['scaffold-runner', 'scaffold-pipeline']) {
    const skillDir = path.join(packageRoot, 'content', 'skills', name)
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${name} skill content\n`, 'utf8')
  }
}

function seedInstalledSkillTargets(root: string, name: string, content = `# ${name} installed content\n`): void {
  for (const baseDir of ['.claude/skills', '.agents/skills']) {
    const destDir = path.join(root, baseDir, name)
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), content, 'utf8')
  }
}

describe('scaffold skill', () => {
  let exitSpy: MockInstance
  let writtenLines: string[]
  let stderrLines: string[]
  let tmpDir: string
  let packageRoot: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    packageRoot = makeTmpDir()
    writtenLines = []
    stderrLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk))
      return true
    })
    // Default: resolveOutputMode returns 'interactive'
    vi.mocked(resolveOutputMode).mockReturnValue('interactive')
    // Default: getPackageRoot returns our controlled packageRoot
    vi.mocked(getPackageRoot).mockReturnValue(packageRoot)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(packageRoot, { recursive: true, force: true })
  })

  // ---------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------

  it('list shows available skills (interactive)', async () => {
    await skillCommand.handler({
      action: 'list',
      root: tmpDir,
      $0: 'scaffold',
      _: ['skill', 'list'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    expect(output).toContain('scaffold-runner')
    expect(output).toContain('scaffold-pipeline')
    expect(output).toContain('not installed')
    expect(output).toContain('.claude/skills')
    expect(output).toContain('.agents/skills')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('list shows installed status when skills are present', async () => {
    seedInstalledSkillTargets(tmpDir, 'scaffold-runner')

    await skillCommand.handler({
      action: 'list',
      root: tmpDir,
      $0: 'scaffold',
      _: ['skill', 'list'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    expect(output).toContain('installed')
    expect(output).toContain('.claude/skills/scaffold-runner/SKILL.md')
    expect(output).toContain('.agents/skills/scaffold-runner/SKILL.md')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('list outputs JSON when format=json', async () => {
    vi.mocked(resolveOutputMode).mockReturnValue('json')

    // Pre-install one skill so we get mixed installed status
    seedInstalledSkillTargets(tmpDir, 'scaffold-runner')

    await skillCommand.handler({
      action: 'list',
      format: 'json',
      root: tmpDir,
      $0: 'scaffold',
      _: ['skill', 'list'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('')
    const parsed = JSON.parse(output)
    expect(parsed.success).toBe(true)
    expect(parsed.data).toBeInstanceOf(Array)
    expect(parsed.data).toHaveLength(2)

    const runner = parsed.data.find((s: { name: string }) => s.name === 'scaffold-runner')
    const pipeline = parsed.data.find((s: { name: string }) => s.name === 'scaffold-pipeline')
    expect(runner.installed).toBe(true)
    expect(runner.claudeInstalled).toBe(true)
    expect(runner.agentInstalled).toBe(true)
    expect(pipeline.installed).toBe(false)
    expect(runner.description).toBeTruthy()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // ---------------------------------------------------------------
  // INSTALL
  // ---------------------------------------------------------------

  it('install creates .claude/skills/ and copies files', async () => {
    makePackageSkillsDir(packageRoot)

    await skillCommand.handler({
      action: 'install',
      root: tmpDir,
      force: false,
      $0: 'scaffold',
      _: ['skill', 'install'],
    } as Parameters<typeof skillCommand.handler>[0])

    // Verify both skills were installed to both targets
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'scaffold-runner', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'scaffold-pipeline', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-runner', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-pipeline', 'SKILL.md'))).toBe(true)

    const output = writtenLines.join('') + stderrLines.join('')
    // installAllSkills counts per-target (2 skills × 2 targets = 4)
    expect(output).toContain('4 skill(s) installed')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('install writes both .claude/skills and .agents/skills from single source', async () => {
    makePackageSkillsDir(packageRoot)

    await skillCommand.handler({
      action: 'install',
      root: tmpDir,
      force: false,
      $0: 'scaffold',
      _: ['skill', 'install'],
    } as Parameters<typeof skillCommand.handler>[0])

    // Verify files exist in both target directories
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'scaffold-runner', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-runner', 'SKILL.md'))).toBe(true)

    const output = writtenLines.join('') + stderrLines.join('')
    expect(output).toContain('4 skill(s) installed')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('install: already exists without --force shows skip message', async () => {
    makePackageSkillsDir(packageRoot)

    // Pre-install both skills
    for (const name of ['scaffold-runner', 'scaffold-pipeline']) {
      seedInstalledSkillTargets(tmpDir, name, '# existing content')
    }

    await skillCommand.handler({
      action: 'install',
      root: tmpDir,
      force: false,
      $0: 'scaffold',
      _: ['skill', 'install'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    expect(output).toContain('All skills already installed.')

    // Verify files were NOT overwritten
    const content = fs.readFileSync(
      path.join(tmpDir, '.claude', 'skills', 'scaffold-runner', 'SKILL.md'), 'utf8',
    )
    expect(content).toBe('# existing content')
    const agentContent = fs.readFileSync(
      path.join(tmpDir, '.agents', 'skills', 'scaffold-runner', 'SKILL.md'), 'utf8',
    )
    expect(agentContent).toBe('# existing content')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('install: already exists with --force overwrites', async () => {
    makePackageSkillsDir(packageRoot)

    // Pre-install both skills with old content
    for (const name of ['scaffold-runner', 'scaffold-pipeline']) {
      seedInstalledSkillTargets(tmpDir, name)
      fs.writeFileSync(path.join(tmpDir, '.claude', 'skills', name, 'SKILL.md'), '# old content', 'utf8')
      fs.writeFileSync(path.join(tmpDir, '.agents', 'skills', name, 'SKILL.md'), '# old content', 'utf8')
    }

    await skillCommand.handler({
      action: 'install',
      root: tmpDir,
      force: true,
      $0: 'scaffold',
      _: ['skill', 'install'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    expect(output).toContain('4 skill(s) installed')

    // Verify files WERE overwritten with new content (both targets use same source)
    const content = fs.readFileSync(
      path.join(tmpDir, '.claude', 'skills', 'scaffold-runner', 'SKILL.md'), 'utf8',
    )
    expect(content).toContain('scaffold-runner skill content')
    const agentContent = fs.readFileSync(
      path.join(tmpDir, '.agents', 'skills', 'scaffold-runner', 'SKILL.md'), 'utf8',
    )
    expect(agentContent).toContain('scaffold-runner skill content')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('install: source not found skips silently', async () => {
    // Don't create any source skills in packageRoot — leave it empty
    // installAllSkills silently skips missing sources (they may not be bundled)

    await skillCommand.handler({
      action: 'install',
      root: tmpDir,
      force: false,
      $0: 'scaffold',
      _: ['skill', 'install'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    expect(output).toContain('All skills already installed.')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('install: old flat-file gets cleaned up during install', async () => {
    makePackageSkillsDir(packageRoot)

    // Create old flat-file format: .claude/skills/<name>.md
    const skillsDir = path.join(tmpDir, '.claude', 'skills')
    fs.mkdirSync(skillsDir, { recursive: true })
    fs.writeFileSync(path.join(skillsDir, 'scaffold-runner.md'), '# old flat file', 'utf8')
    fs.writeFileSync(path.join(skillsDir, 'scaffold-pipeline.md'), '# old flat file', 'utf8')

    await skillCommand.handler({
      action: 'install',
      root: tmpDir,
      force: false,
      $0: 'scaffold',
      _: ['skill', 'install'],
    } as Parameters<typeof skillCommand.handler>[0])

    // Verify old flat files were removed by the pre-install cleanup
    expect(fs.existsSync(path.join(skillsDir, 'scaffold-runner.md'))).toBe(false)
    expect(fs.existsSync(path.join(skillsDir, 'scaffold-pipeline.md'))).toBe(false)

    // Verify new directory-based skills were installed
    expect(fs.existsSync(path.join(skillsDir, 'scaffold-runner', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(skillsDir, 'scaffold-pipeline', 'SKILL.md'))).toBe(true)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('install: mixed — some install, some skip → correct count', async () => {
    makePackageSkillsDir(packageRoot)

    // Pre-install only scaffold-runner so it gets skipped
    seedInstalledSkillTargets(tmpDir, 'scaffold-runner')

    await skillCommand.handler({
      action: 'install',
      root: tmpDir,
      force: false,
      $0: 'scaffold',
      _: ['skill', 'install'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    // scaffold-pipeline installs to 2 targets; scaffold-runner skipped
    expect(output).toContain('2 skill(s) installed')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('install repairs a missing target without warning when the final state is healthy', async () => {
    makePackageSkillsDir(packageRoot)

    // Only .claude/skills present — .agents/skills missing
    for (const name of ['scaffold-runner', 'scaffold-pipeline']) {
      const destDir = path.join(tmpDir, '.claude', 'skills', name)
      fs.mkdirSync(destDir, { recursive: true })
      fs.writeFileSync(path.join(destDir, 'SKILL.md'), '# existing claude content', 'utf8')
    }

    await skillCommand.handler({
      action: 'install',
      root: tmpDir,
      force: false,
      $0: 'scaffold',
      _: ['skill', 'install'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    // 2 missing .agents/skills targets get installed
    expect(output).toContain('2 skill(s) installed')
    expect(output).not.toContain('installed with warnings')
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-runner', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-pipeline', 'SKILL.md'))).toBe(true)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // ---------------------------------------------------------------
  // REMOVE
  // ---------------------------------------------------------------

  it('remove handles no installed skills gracefully', async () => {
    await skillCommand.handler({
      action: 'remove',
      root: tmpDir,
      $0: 'scaffold',
      _: ['skill', 'remove'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    expect(output).toContain('No scaffold skills found')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('remove: skills exist → removes them and shows success', async () => {
    // Pre-install both skills
    for (const name of ['scaffold-runner', 'scaffold-pipeline']) {
      seedInstalledSkillTargets(tmpDir, name)
    }

    await skillCommand.handler({
      action: 'remove',
      root: tmpDir,
      $0: 'scaffold',
      _: ['skill', 'remove'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    expect(output).toContain('scaffold-runner: removed')
    expect(output).toContain('scaffold-pipeline: removed')

    // Verify directories were actually removed
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'scaffold-runner'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'scaffold-pipeline'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-runner'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-pipeline'))).toBe(false)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('remove: partial — only some skills installed → removes those, not others', async () => {
    // Only install scaffold-runner, not scaffold-pipeline
    seedInstalledSkillTargets(tmpDir, 'scaffold-runner')

    await skillCommand.handler({
      action: 'remove',
      root: tmpDir,
      $0: 'scaffold',
      _: ['skill', 'remove'],
    } as Parameters<typeof skillCommand.handler>[0])

    const output = writtenLines.join('') + stderrLines.join('')
    expect(output).toContain('scaffold-runner: removed')
    expect(output).not.toContain('scaffold-pipeline: removed')

    // Verify scaffold-runner was removed
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'scaffold-runner'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-runner'))).toBe(false)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})
