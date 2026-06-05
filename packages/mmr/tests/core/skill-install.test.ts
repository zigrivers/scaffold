import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SKILL_PLATFORMS,
  PLATFORM_SPECS,
  MANAGED_BEGIN,
  MANAGED_END,
  renderManagedBlock,
  upsertManagedBlock,
  planSkillInstall,
  executePlan,
  resolvePlatforms,
  UnknownPlatformError,
} from '../../src/core/skill-install.js'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-skill-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

describe('resolvePlatforms', () => {
  it('expands --all to every platform', () => {
    expect(resolvePlatforms([], true)).toEqual([...SKILL_PLATFORMS])
  })

  it('dedups and normalizes case', () => {
    expect(resolvePlatforms(['Cursor', 'cursor', 'GEMINI'], false)).toEqual(['cursor', 'gemini'])
  })

  it('throws UnknownPlatformError for an unsupported platform', () => {
    expect(() => resolvePlatforms(['windsurf'], false)).toThrow(UnknownPlatformError)
  })
})

describe('managed block helpers', () => {
  it('renders a delimited block', () => {
    const out = renderManagedBlock('hello')
    expect(out.startsWith(MANAGED_BEGIN)).toBe(true)
    expect(out.trimEnd().endsWith(MANAGED_END)).toBe(true)
    expect(out).toContain('hello')
  })

  it('appends a block to non-empty content, preserving the original', () => {
    const out = upsertManagedBlock('# My notes\n', 'body')
    expect(out).toContain('# My notes')
    expect(out).toContain(MANAGED_BEGIN)
  })

  it('replaces an existing block instead of duplicating it', () => {
    const first = upsertManagedBlock('# Notes\n', 'v1')
    const second = upsertManagedBlock(first, 'v2')
    expect(second.match(new RegExp(MANAGED_BEGIN, 'g'))?.length).toBe(1)
    expect(second).toContain('v2')
    expect(second).not.toContain('v1')
    expect(second).toContain('# Notes')
  })
})

describe('planSkillInstall', () => {
  it('plans a create for a fresh cursor install', () => {
    const plan = planSkillInstall({ projectRoot: root, platforms: ['cursor'] })
    expect(plan).toHaveLength(1)
    expect(plan[0].action).toBe('create')
    expect(plan[0].relPath).toBe(PLATFORM_SPECS.cursor.targetRelPath)
    expect(plan[0].content).toContain('MMR — Multi-Model Code Review')
  })

  it('collapses codex + antigravity into one AGENTS.md entry', () => {
    const plan = planSkillInstall({ projectRoot: root, platforms: ['codex', 'antigravity'] })
    expect(plan).toHaveLength(1)
    expect(plan[0].relPath).toBe('AGENTS.md')
    expect(plan[0].platforms).toEqual(['codex', 'antigravity'])
  })

  it('blocks overwriting an existing dedicated file without force', () => {
    const target = path.join(root, PLATFORM_SPECS.cursor.targetRelPath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'user content')
    const plan = planSkillInstall({ projectRoot: root, platforms: ['cursor'] })
    expect(plan[0].action).toBe('blocked-exists')
    expect(plan[0].content).toBeUndefined()
  })

  it('overwrites a dedicated file with force', () => {
    const target = path.join(root, PLATFORM_SPECS.cursor.targetRelPath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'user content')
    const plan = planSkillInstall({ projectRoot: root, platforms: ['cursor'], force: true })
    expect(plan[0].action).toBe('update')
    expect(plan[0].content).toContain('MMR — Multi-Model Code Review')
  })

  it('preserves surrounding content when managing a block in an existing file', () => {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Project rules\n\nUse tabs.\n')
    const plan = planSkillInstall({ projectRoot: root, platforms: ['codex'] })
    expect(plan[0].action).toBe('update')
    expect(plan[0].content).toContain('# Project rules')
    expect(plan[0].content).toContain('Use tabs.')
    expect(plan[0].content).toContain(MANAGED_BEGIN)
  })
})

describe('executePlan + idempotency', () => {
  it('writes all four platforms and is idempotent on re-run', () => {
    const platforms = [...SKILL_PLATFORMS]
    executePlan(planSkillInstall({ projectRoot: root, platforms }))

    expect(read(PLATFORM_SPECS.cursor.targetRelPath)).toContain('MMR — Multi-Model Code Review')
    expect(read('GEMINI.md')).toContain(MANAGED_BEGIN)
    expect(read('AGENTS.md')).toContain(MANAGED_BEGIN)

    // Second plan over the same tree should report no changes.
    const rerun = planSkillInstall({ projectRoot: root, platforms })
    expect(rerun.every((e) => e.action === 'unchanged')).toBe(true)
  })

  it('does not write anything for a dry-run (plan only)', () => {
    planSkillInstall({ projectRoot: root, platforms: ['cursor'] })
    expect(fs.existsSync(path.join(root, PLATFORM_SPECS.cursor.targetRelPath))).toBe(false)
  })

  it('updates only the managed block, leaving user edits intact across re-install', () => {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Mine\n')
    executePlan(planSkillInstall({ projectRoot: root, platforms: ['codex'] }))
    // Simulate a user appending content after the block.
    fs.appendFileSync(path.join(root, 'AGENTS.md'), '\nMy extra note.\n')
    executePlan(planSkillInstall({ projectRoot: root, platforms: ['codex'] }))
    const out = read('AGENTS.md')
    expect(out).toContain('# Mine')
    expect(out).toContain('My extra note.')
    expect(out.match(new RegExp(MANAGED_BEGIN, 'g'))?.length).toBe(1)
  })
})
