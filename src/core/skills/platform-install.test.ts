import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
