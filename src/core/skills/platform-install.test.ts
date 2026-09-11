import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { installSkillsForPlatform, upsertManagedBlock } from './platform-install.js'

describe('upsertManagedBlock', () => {
  it('appends a per-skill block to non-empty content, preserving it', () => {
    const out = upsertManagedBlock('# My rules\n', 'scaffold-runner', 'BODY')
    expect(out).toContain('# My rules')
    expect(out).toContain('<!-- BEGIN scaffold-skill:scaffold-runner -->')
    expect(out).toContain('BODY')
    expect(out).toContain('<!-- END scaffold-skill:scaffold-runner -->')
  })

  it('replaces an existing block instead of duplicating it (idempotent)', () => {
    const first = upsertManagedBlock('', 'scaffold-runner', 'OLD')
    const second = upsertManagedBlock(first, 'scaffold-runner', 'NEW')
    expect(second).toContain('NEW')
    expect(second).not.toContain('OLD')
    expect(second.match(/BEGIN scaffold-skill:scaffold-runner/g)).toHaveLength(1)
  })

  it('keeps distinct skills in separate blocks', () => {
    let doc = upsertManagedBlock('', 'scaffold-runner', 'R')
    doc = upsertManagedBlock(doc, 'scaffold-pipeline', 'P')
    expect(doc).toContain('BEGIN scaffold-skill:scaffold-runner')
    expect(doc).toContain('BEGIN scaffold-skill:scaffold-pipeline')
  })
})

describe('installSkillsForPlatform', () => {
  let tmp: string
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-skill-'))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('codex installs a per-skill AGENTS.md block for every scaffold skill', () => {
    const { installed, errors } = installSkillsForPlatform(tmp, 'codex')
    expect(errors).toEqual([])
    expect(installed.length).toBeGreaterThan(0)
    const agents = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('<!-- BEGIN scaffold-skill:scaffold-runner -->')
    expect(agents).toContain('<!-- BEGIN scaffold-skill:scaffold-pipeline -->')
    expect(agents).toContain('Scaffold Runner')
  })

  it('antigravity shares the same AGENTS.md target idempotently', () => {
    installSkillsForPlatform(tmp, 'codex')
    installSkillsForPlatform(tmp, 'antigravity')
    const agents = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8')
    expect(agents.match(/BEGIN scaffold-skill:scaffold-runner/g)).toHaveLength(1)
  })

  it('cursor writes a .cursor/rules/<name>.mdc per skill', () => {
    installSkillsForPlatform(tmp, 'cursor')
    expect(fs.existsSync(path.join(tmp, '.cursor', 'rules', 'scaffold-runner.mdc'))).toBe(true)
    const mdc = fs.readFileSync(path.join(tmp, '.cursor', 'rules', 'scaffold-runner.mdc'), 'utf8')
    expect(mdc).toMatch(/^---\ndescription:/)
    expect(mdc).toContain('alwaysApply: false')
  })

  it('opencode writes a full .opencode/skills/<name>/SKILL.md whose name matches the dir', () => {
    installSkillsForPlatform(tmp, 'opencode')
    const skillPath = path.join(tmp, '.opencode', 'skills', 'scaffold-runner', 'SKILL.md')
    expect(fs.existsSync(skillPath)).toBe(true)
    expect(fs.readFileSync(skillPath, 'utf8')).toMatch(/^---\nname: scaffold-runner\n/)
  })

  it.each(['codex', 'antigravity', 'cursor', 'opencode'] as const)(
    '%s preserves a reference after partial write failure', (platform) => {
      installSkillsForPlatform(tmp, platform)
      const host = platform === 'opencode' ? '.opencode' : '.agents'
      const page = path.join(tmp, host, 'skills/scaffold-runner/references/execution.md')
      const expected = fs.readFileSync(page, 'utf8')
      fs.writeFileSync(page, 'Local execution policy')
      const writeFile = fs.writeFileSync.bind(fs)
      const rename = fs.renameSync.bind(fs)
      const failure = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (to === page) {
          writeFile(from, 'Incomplete page', 'utf8')
          throw new Error('Reference write interrupted')
        }
        return rename(from, to)
      })

      expect(installSkillsForPlatform(tmp, platform, { force: true }).errors).toHaveLength(1)
      expect(fs.readFileSync(page, 'utf8')).toBe('Local execution policy')
      failure.mockRestore()
      fs.unlinkSync(page)
      expect(installSkillsForPlatform(tmp, platform).errors).toEqual([])
      expect(fs.readFileSync(page, 'utf8')).toBe(expected)
    })

  it.each(['codex', 'antigravity', 'cursor', 'opencode'] as const)('%s bundles linked skill pages', (platform) => {
    const result = installSkillsForPlatform(tmp, platform)
    expect(result.errors).toEqual([])
    const host = platform === 'opencode' ? '.opencode' : '.agents'
    const skillDir = path.join(tmp, host, 'skills', 'scaffold-runner')
    const body = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    const links = [...body.matchAll(/\]\((references\/[^)]+\.md)\)/g)]
    expect(links.length).toBeGreaterThan(0)
    for (const [, reference] of links) {
      const page = path.join(skillDir, reference)
      const content = fs.readFileSync(page, 'utf8')
      expect(content.length).toBeGreaterThan(0)
      for (const [, target] of content.matchAll(/\]\(([^)]+)\)/g)) {
        if (!target.startsWith('#') && !/^[^:]+\.md(?:#.*)?$/.test(target)) continue
        const [file, fragment] = target.split('#')
        const linkedPage = file ? path.resolve(path.dirname(page), file) : page
        const linkedContent = fs.readFileSync(linkedPage, 'utf8')
        if (fragment) {
          const headings = [...linkedContent.matchAll(/^#{1,6} (.+)$/gm)]
            .map(([, heading]) => heading.toLowerCase().replace(/[^\w -]/g, '').replace(/ /g, '-'))
          expect(headings, `${page} links to missing ${target}`).toContain(fragment)
        }
      }
    }
    const page = path.join(skillDir, links[0][1])
    fs.writeFileSync(page, 'Local workflow policy')
    installSkillsForPlatform(tmp, platform)
    expect(fs.readFileSync(page, 'utf8')).toBe('Local workflow policy')
    installSkillsForPlatform(tmp, platform, { force: true })
    expect(fs.readFileSync(page, 'utf8')).not.toBe('Local workflow policy')
  })

  it('skips an existing dedicated file without --force, overwrites with it', () => {
    const mdc = path.join(tmp, '.cursor', 'rules', 'scaffold-runner.mdc')
    fs.mkdirSync(path.dirname(mdc), { recursive: true })
    fs.writeFileSync(mdc, 'USER EDITED')
    const r1 = installSkillsForPlatform(tmp, 'cursor')
    expect(fs.readFileSync(mdc, 'utf8')).toBe('USER EDITED')        // untouched without force
    expect(r1.skipped.some((s) => s.includes('scaffold-runner.mdc'))).toBe(true)
    installSkillsForPlatform(tmp, 'cursor', { force: true })
    expect(fs.readFileSync(mdc, 'utf8')).not.toBe('USER EDITED')    // overwritten with force
  })

  it('is a no-op when a dedicated file already matches the current template', () => {
    installSkillsForPlatform(tmp, 'cursor')
    const second = installSkillsForPlatform(tmp, 'cursor')
    // unchanged files are neither re-installed nor reported stale
    expect(second.installed).toEqual([])
    expect(second.skipped).toEqual([])
  })

  it('resolves {{INSTRUCTIONS_FILE}} markers (no raw placeholder leaks into installed files)', () => {
    installSkillsForPlatform(tmp, 'opencode')
    const body = fs.readFileSync(path.join(tmp, '.opencode', 'skills', 'scaffold-pipeline', 'SKILL.md'), 'utf8')
    expect(body).not.toContain('{{INSTRUCTIONS_FILE}}')
    expect(body).toContain('AGENTS.md')
  })
})
