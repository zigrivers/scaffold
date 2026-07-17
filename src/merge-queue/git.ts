import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface CandidateResult {
  ref: string
  applied: number[]
  rejected: number[]
  /** Squash-merged cleanly but staged nothing — the diff is already on the base. */
  alreadyApplied: number[]
}

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
      // Make sure every PR head object is present locally. A transient fetch
      // failure must NOT be left to surface later as a bogus merge conflict (which
      // would falsely eject a clean PR) — retry once, then verify the object is
      // actually present and fail the whole batch construction if not. The caller
      // aborts + requeues on the throw, so the batch is retried, never mis-ejected.
      for (const { headSha } of prs) {
        if (gitAllowFail(['fetch', 'origin', headSha])) continue
        gitAllowFail(['fetch', 'origin', headSha]) // one retry
        if (!gitAllowFail(['cat-file', '-e', `${headSha}^{commit}`], gate)) {
          throw new Error(
            `merge-queue: cannot fetch PR head ${headSha} from origin (network?) — batch deferred`,
          )
        }
      }
      // Recover from a crashed prior build: if a previous run died mid-`merge
      // --squash` (e.g. the daemon was killed while the index held unresolved
      // conflicts), the gate worktree is left dirty and every subsequent
      // command here — starting with `checkout --detach` — would fail with
      // "you need to resolve your current index first". A crashed build must
      // never wedge future builds, so unconditionally clear any leftover
      // merge/conflict state before touching the worktree. These are no-ops
      // (and their failures are ignored) when the worktree is already clean.
      gitAllowFail(['merge', '--abort'], gate)
      gitAllowFail(['reset', '--hard'], gate)
      gitAllowFail(['clean', '-fd'], gate)
      git(['checkout', '--detach', `origin/${base}`], gate)
      git(['reset', '--hard', `origin/${base}`], gate)
      const applied: number[] = []
      const rejected: number[] = []
      const alreadyApplied: number[] = []
      for (const { pr, headSha } of prs) {
        if (gitAllowFail(['merge', '--squash', headSha], gate)) {
          // A squash-merge that lands cleanly but stages nothing means this PR's
          // diff is already present on the base (e.g. it landed earlier and the
          // branch never rebased). `git commit` on an empty index would throw
          // and wedge the whole batch — treat it as a no-op instead.
          if (gitAllowFail(['diff', '--cached', '--quiet'], gate)) {
            alreadyApplied.push(pr)
          } else {
            git(['commit', '--no-verify', '-m', `mq: squash PR #${pr}`], gate)
            applied.push(pr)
          }
        } else {
          // Conflict: clear the failed squash — including any untracked files/dirs
          // it created, which `reset --hard` leaves behind and which would corrupt
          // the next member's merge — and continue with the rest.
          git(['reset', '--hard', 'HEAD'], gate)
          gitAllowFail(['clean', '-fd'], gate)
          rejected.push(pr)
        }
      }
      git(['update-ref', ref, 'HEAD'], gate)
      return { ref, applied, rejected, alreadyApplied }
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
