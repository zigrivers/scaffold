import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitAdapter } from './git.js'

describe('git adapter', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-git-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@example.com && git config user.name Test', { cwd: dir, shell: '/bin/sh' })
    writeFileSync(join(dir, 'a.txt'), 'hello\n')
    execSync('git add a.txt && git commit -q -m initial', { cwd: dir, shell: '/bin/sh' })
  })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns available inside a git repo', async () => {
    const s = await gitAdapter.probe(dir)
    expect(s.status).toBe('available')
  })

  it('probe returns unavailable outside a git repo', async () => {
    const not = mkdtempSync(join(tmpdir(), 'observe-notgit-'))
    try {
      const s = await gitAdapter.probe(not)
      expect(s.status).toBe('unavailable')
    } finally {
      rmSync(not, { recursive: true, force: true })
    }
  })

  it('listWorktrees returns at least the primary worktree', async () => {
    const wts = await gitAdapter.listWorktrees(dir)
    expect(wts.length).toBeGreaterThanOrEqual(1)
    expect(wts[0].path).toContain(dir)
  })

  it('recentCommits returns commits with sha + subject + ts', async () => {
    const cs = await gitAdapter.recentCommits(dir, { sinceHours: 24 })
    expect(cs).toHaveLength(1)
    expect(cs[0].sha).toMatch(/^[0-9a-f]{40}$/)
    expect(cs[0].subject).toBe('initial')
  })
})

describe('git adapter — replayEvents', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-git-rep-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: dir, shell: '/bin/sh' })
    writeFileSync(join(dir, 'a.txt'), '1\n')
    execSync('git add a.txt && git commit -q -m "first"', { cwd: dir, shell: '/bin/sh' })
    writeFileSync(join(dir, 'b.txt'), '1\n')
    execSync('git add b.txt && git commit -q -m "second"', { cwd: dir, shell: '/bin/sh' })
  })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns ReplayEvent[] for commits in the time window', async () => {
    const events = await gitAdapter.replayEvents(dir, { sinceHours: 24 })
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events[0].source).toBe('git')
    expect(events[0].kind).toBe('commit')
    expect(events[0].sort_id).toMatch(/^git:[0-9a-f]{40}$/)
    expect(events[0].correlation_id).toBeNull()
    expect(events[0].summary.length).toBeGreaterThan(0)
    expect(typeof events[0].link).toBe('string')
  })
})
