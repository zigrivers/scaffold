import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface CandidateResult { ref: string; applied: number[]; rejected: number[] }

export interface GitOps {
  primaryRoot(): string
  defaultBranch(): string
  fetchOrigin(): void
  originHeadSha(branch: string): string
  treeOf(ref: string): string
  ensureGateWorktree(): string
  constructCandidate(
    batchId: string,
    prs: { pr: number; headSha: string }[],
    base: string,
  ): CandidateResult
  deleteCandidate(batchId: string): void
  listCandidateRefs(): string[]
}

const CANDIDATE_PREFIX = 'refs/merge-queue/batch-'

export function createGitOps(repoRoot: string): GitOps {
  const git = (args: string[], cwd = repoRoot): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const gitAllowFail = (args: string[], cwd = repoRoot): boolean => {
    try {
      execFileSync('git', args, { cwd, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  function primaryRoot(): string {
    // .git common dir of the primary checkout; its parent is the primary root.
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'])
    return path.dirname(common)
  }

  function ensureGateWorktree(): string {
    const root = primaryRoot()
    const gate = path.join(root, '.mq', 'gate')
    if (!fs.existsSync(path.join(gate, '.git'))) {
      fs.mkdirSync(path.join(root, '.mq'), { recursive: true })
      git(['worktree', 'add', '--detach', gate], root)
    }
    return gate
  }

  return {
    primaryRoot,
    defaultBranch() {
      // e.g. "origin/main" -> "main"; never hardcode.
      const ref = git(['rev-parse', '--abbrev-ref', 'origin/HEAD'])
      return ref.replace(/^origin\//, '')
    },
    fetchOrigin() {
      git(['fetch', 'origin', '--prune'])
    },
    originHeadSha(branch) {
      return git(['rev-parse', `origin/${branch}`])
    },
    treeOf(ref) {
      return git(['rev-parse', `${ref}^{tree}`])
    },
    ensureGateWorktree,
    constructCandidate(batchId, prs, base) {
      const gate = ensureGateWorktree()
      const ref = `${CANDIDATE_PREFIX}${batchId}`
      // Make sure every PR head object is present locally.
      for (const { headSha } of prs) gitAllowFail(['fetch', 'origin', headSha])
      git(['checkout', '--detach', `origin/${base}`], gate)
      git(['reset', '--hard', `origin/${base}`], gate)
      const applied: number[] = []
      const rejected: number[] = []
      for (const { pr, headSha } of prs) {
        if (gitAllowFail(['merge', '--squash', headSha], gate)) {
          git(['commit', '--no-verify', '-m', `mq: squash PR #${pr}`], gate)
          applied.push(pr)
        } else {
          // Conflict: clear the failed squash and continue with the rest.
          git(['reset', '--hard', 'HEAD'], gate)
          rejected.push(pr)
        }
      }
      git(['update-ref', ref, 'HEAD'], gate)
      return { ref, applied, rejected }
    },
    deleteCandidate(batchId) {
      gitAllowFail(['update-ref', '-d', `${CANDIDATE_PREFIX}${batchId}`])
    },
    listCandidateRefs() {
      const out = git(['for-each-ref', '--format=%(refname)', 'refs/merge-queue/'])
      return out === '' ? [] : out.split('\n')
    },
  }
}
