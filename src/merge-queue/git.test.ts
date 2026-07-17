import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createGitOps } from './git.js'

function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim()
}
function git(cwd: string, ...args: string[]): string { return sh(cwd, 'git', args) }

/** origin (bare) + working clone with an initial commit on main; returns { origin, clone } */
function scratchRepos(): { origin: string; clone: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-git-'))
  const origin = path.join(dir, 'origin.git')
  const clone = path.join(dir, 'clone')
  execFileSync('git', ['init', '--bare', '-b', 'main', origin])
  execFileSync('git', ['clone', origin, clone], { stdio: 'ignore' })
  git(clone, 'config', 'user.name', 'mq-test')
  git(clone, 'config', 'user.email', 'mq@test.invalid')
  fs.writeFileSync(path.join(clone, 'base.txt'), 'base\n')
  git(clone, 'add', 'base.txt')
  git(clone, 'commit', '-m', 'base')
  git(clone, 'push', '-u', 'origin', 'main')
  git(clone, 'remote', 'set-head', 'origin', 'main')
  return { origin, clone }
}

/** Create a branch with one commit touching `file`, push it, return its head SHA. */
function pushBranch(clone: string, name: string, file: string): string {
  git(clone, 'checkout', '-b', name, 'origin/main')
  fs.writeFileSync(path.join(clone, file), `${name}\n`)
  git(clone, 'add', file)
  git(clone, 'commit', '-m', name)
  git(clone, 'push', '-u', 'origin', name)
  const sha = git(clone, 'rev-parse', 'HEAD')
  git(clone, 'checkout', 'main')
  return sha
}

describe('createGitOps', () => {
  it('resolves the default branch from origin/HEAD', () => {
    const { clone } = scratchRepos()
    expect(createGitOps(clone).defaultBranch()).toBe('main')
  })

  it('primaryRoot resolves to the main checkout even from a linked worktree', () => {
    const { clone } = scratchRepos()
    const wt = path.join(path.dirname(clone), 'wt')
    git(clone, 'worktree', 'add', wt, '-b', 'agent/x', 'origin/main')
    expect(fs.realpathSync(createGitOps(wt).primaryRoot())).toBe(fs.realpathSync(clone))
  })

  it('constructs a candidate from two clean PRs and pins the batch ref', () => {
    const { clone } = scratchRepos()
    const shaA = pushBranch(clone, 'pr-a', 'a.txt')
    const shaB = pushBranch(clone, 'pr-b', 'b.txt')
    const ops = createGitOps(clone)
    ops.fetchOrigin()
    const res = ops.constructCandidate('b1', [
      { pr: 1, headSha: shaA }, { pr: 2, headSha: shaB },
    ], 'main')
    expect(res.applied).toEqual([1, 2])
    expect(res.rejected).toEqual([])
    expect(res.ref).toBe('refs/merge-queue/batch-b1')
    const tree = ops.treeOf(res.ref)
    expect(tree).toMatch(/^[0-9a-f]{40}$/)
    // candidate contains both files
    const files = git(clone, 'ls-tree', '--name-only', res.ref)
    expect(files).toContain('a.txt')
    expect(files).toContain('b.txt')
  })

  it('rejects a conflicting PR without killing the batch', () => {
    const { clone } = scratchRepos()
    const shaA = pushBranch(clone, 'pr-edit1', 'shared.txt')
    const shaB = pushBranch(clone, 'pr-edit2', 'shared.txt')
    const ops = createGitOps(clone)
    ops.fetchOrigin()
    const res = ops.constructCandidate('b2', [
      { pr: 1, headSha: shaA }, { pr: 2, headSha: shaB },
    ], 'main')
    expect(res.applied).toEqual([1])
    expect(res.rejected).toEqual([2])
    const files = git(clone, 'ls-tree', '--name-only', res.ref)
    expect(files).toContain('shared.txt')
  })

  it('deleteCandidate removes the ref; listCandidateRefs enumerates them', () => {
    const { clone } = scratchRepos()
    const shaA = pushBranch(clone, 'pr-del', 'd.txt')
    const ops = createGitOps(clone)
    ops.fetchOrigin()
    ops.constructCandidate('b3', [{ pr: 1, headSha: shaA }], 'main')
    expect(ops.listCandidateRefs()).toEqual(['refs/merge-queue/batch-b3'])
    ops.deleteCandidate('b3')
    expect(ops.listCandidateRefs()).toEqual([])
  })

  it('originHeadSha reflects remote movement after fetch', () => {
    const { clone } = scratchRepos()
    const ops = createGitOps(clone)
    const before = ops.originHeadSha('main')
    pushBranch(clone, 'pr-m', 'm.txt')
    git(clone, 'checkout', 'main')
    git(clone, 'merge', '--ff-only', 'origin/pr-m')
    // simulate an external merge landing on origin/main
    git(clone, 'push', 'origin', 'main')
    ops.fetchOrigin()
    expect(ops.originHeadSha('main')).not.toBe(before)
  })
})
