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
  /** Detached checkout of an exact SHA in the gate worktree (bootstrap
   *  preflight runs the full gate there). Clears crashed-merge leftovers
   *  first, fetches the object when absent locally. Returns the gate dir. */
  checkoutDetachedInGate(sha: string): string
  /** Fast-forward the PRIMARY worktree to the bootstrap merge commit. `gh pr
   *  merge` updates only the remote, so the local primary tree lacks the
   *  just-landed queue files (poller script, config) until this fetch +
   *  fast-forward — without it the post-merge scheduler arm
   *  (`buildPostMergePollerJob(primary)`) throws on the missing script. Fetches
   *  origin, then `merge --ff-only` primary to the exact merge SHA. */
  syncPrimaryToMerge(mergeSha: string): void
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
    execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 120_000 }).trim()
  const gitAllowFail = (args: string[], cwd = repoRoot): boolean => {
    try {
      execFileSync('git', args, { cwd, stdio: 'ignore', timeout: 120_000 })
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
      // The gate dir may have been deleted by hand while git still has it
      // registered as a worktree — `worktree add` would then abort with
      // "already registered". Prune stale registrations first so recreation
      // always succeeds.
      git(['worktree', 'prune'], root)
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
    checkoutDetachedInGate(sha) {
      const gate = ensureGateWorktree()
      // Same crashed-build recovery as constructCandidate: leftovers must
      // never wedge the checkout.
      gitAllowFail(['merge', '--abort'], gate)
      gitAllowFail(['reset', '--hard'], gate)
      gitAllowFail(['clean', '-fd'], gate)
      if (!gitAllowFail(['cat-file', '-e', `${sha}^{commit}`], gate)) {
        gitAllowFail(['fetch', 'origin', sha])
      }
      git(['checkout', '--force', '--detach', sha], gate)
      return gate
    },
    syncPrimaryToMerge(mergeSha) {
      // Bring the local primary tree up to the just-landed merge commit so the
      // post-merge scheduler arm sees the PR's poller script + config. Anchor to
      // the REAL primary worktree via primaryRoot() (resolved from git-common-dir)
      // — NOT this GitOps' construction cwd: bootstrap may run from a linked
      // worktree (`git = createGitOps(startRoot)`), and the merge must land in
      // primary. ff-only: primary sits at the base branch head that the bootstrap
      // merge advanced — never a non-ff reset.
      const primary = primaryRoot()
      gitAllowFail(['fetch', 'origin'], primary)
      if (!gitAllowFail(['cat-file', '-e', `${mergeSha}^{commit}`], primary)) {
        gitAllowFail(['fetch', 'origin', mergeSha], primary)
      }
      git(['merge', '--ff-only', mergeSha], primary)
    },
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
      git(['checkout', '--force', '--detach', `origin/${base}`], gate)
      git(['reset', '--hard', `origin/${base}`], gate)
      const applied: number[] = []
      const rejected: number[] = []
      const alreadyApplied: number[] = []
      for (const { pr, headSha } of prs) {
        if (gitAllowFail(['merge', '--squash', headSha], gate)) {
          // A squash-merge that lands cleanly but stages nothing means this PR's
          // diff is already present in the candidate. `git commit` on an empty
          // index would throw and wedge the whole batch — never commit it.
          if (gitAllowFail(['diff', '--cached', '--quiet'], gate)) {
            // Only `applied` members change the candidate tree, so applied.length
            // === 0 proves the candidate is still exactly origin/base — the diff is
            // therefore already on the BASE (durably landed): cancel the stale PR.
            // With a sibling already applied, the emptiness could be caused by that
            // sibling (a duplicate). That sibling may not land, so do NOT cancel —
            // reject to rebuild, where it will be re-classified correctly.
            if (applied.length === 0) {
              alreadyApplied.push(pr)
            } else {
              git(['reset', '--hard', 'HEAD'], gate)
              gitAllowFail(['clean', '-fd'], gate)
              rejected.push(pr)
            }
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
