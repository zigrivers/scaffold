import { execFileSync } from 'node:child_process'

export interface AbortSnapshot {
  cwd: string
  stash_sha: string
  pre_existing_staged: string[]
  staged_paths: Set<string>
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' })
  } catch {
    return ''
  }
}

export function captureSnapshot(cwd: string): AbortSnapshot {
  const preExistingStaged = git(cwd, ['diff', '--cached', '--name-only']).trim().split('\n').filter(Boolean)
  const stashSha = git(cwd, ['stash', 'create']).trim()
  return {
    cwd,
    stash_sha: stashSha,
    pre_existing_staged: preExistingStaged,
    staged_paths: new Set(),
  }
}

export function recordStaged(snap: AbortSnapshot, paths: string[]): void {
  for (const p of paths) {
    if (snap.pre_existing_staged.includes(p)) continue
    snap.staged_paths.add(p)
  }
}

export function restoreSnapshot(snap: AbortSnapshot): void {
  for (const path of snap.staged_paths) {
    git(snap.cwd, ['restore', '--staged', '--worktree', path])
  }
  snap.staged_paths.clear()

  if (snap.stash_sha) {
    git(snap.cwd, ['stash', 'apply', snap.stash_sha])
  }
}
