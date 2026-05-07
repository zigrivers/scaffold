import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureSnapshot, restoreSnapshot, recordStaged } from './abort-snapshot.js'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

describe('abort-snapshot', () => {
  let proj: string

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'observe-abort-'))
    git(proj, ['init', '-q'])
    git(proj, ['config', 'user.email', 't@e.com'])
    git(proj, ['config', 'user.name', 'T'])
    writeFileSync(join(proj, 'a.txt'), 'original\n')
    git(proj, ['add', 'a.txt'])
    git(proj, ['commit', '-q', '-m', 'initial'])
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('captureSnapshot records a stash hash even when working tree is clean', () => {
    const snap = captureSnapshot(proj)
    expect(typeof snap.stash_sha).toBe('string')
    expect(snap.staged_paths).toEqual(new Set())
    expect(snap.cwd).toBe(proj)
  })

  it('restoreSnapshot un-stages only the paths recorded by recordStaged', () => {
    const snap = captureSnapshot(proj)
    // User had `b.txt` already staged before the fix flow
    writeFileSync(join(proj, 'b.txt'), 'pre-existing-stage\n')
    git(proj, ['add', 'b.txt'])
    // Fix flow stages a NEW path
    writeFileSync(join(proj, 'fixed.txt'), 'fix\n')
    git(proj, ['add', 'fixed.txt'])
    recordStaged(snap, ['fixed.txt'])

    restoreSnapshot(snap)

    // fixed.txt is unstaged + worktree-restored
    expect(existsSync(join(proj, 'fixed.txt'))).toBe(false)
    // b.txt remains staged (user's pre-existing work)
    const status = git(proj, ['status', '--short'])
    expect(status).toMatch(/^A  b\.txt/m)
  })

  it('restoreSnapshot is idempotent', () => {
    const snap = captureSnapshot(proj)
    writeFileSync(join(proj, 'fixed.txt'), 'fix\n')
    git(proj, ['add', 'fixed.txt'])
    recordStaged(snap, ['fixed.txt'])
    restoreSnapshot(snap)
    restoreSnapshot(snap)   // second call should not throw
    expect(existsSync(join(proj, 'fixed.txt'))).toBe(false)
  })

  it('captureSnapshot includes WIP edits in stash so they can be re-applied', () => {
    writeFileSync(join(proj, 'a.txt'), 'WIP modification\n')
    const snap = captureSnapshot(proj)
    expect(snap.stash_sha.length).toBeGreaterThan(0)

    // Fix flow makes its own edit on top
    writeFileSync(join(proj, 'a.txt'), 'fix-edit\n')
    git(proj, ['add', 'a.txt'])
    recordStaged(snap, ['a.txt'])

    restoreSnapshot(snap)

    // After restore, the WIP edit should be present (not the fix edit, not the original)
    expect(readFileSync(join(proj, 'a.txt'), 'utf8')).toBe('WIP modification\n')
  })
})
