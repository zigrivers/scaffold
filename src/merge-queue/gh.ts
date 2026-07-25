import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

export interface PrInfo {
  number: number
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  headSha: string
  mergedAt: string | null
  additions: number
  deletions: number
  title: string
  body: string
}

export interface GhClient {
  viewPr(pr: number): PrInfo
  /** Squash-merge. When expectedHead is given, gh refuses unless the PR head still
   *  matches it — so a push during the gate can never land an untested revision. */
  squashMerge(pr: number, expectedHead?: string): void
  /** OID of the merge commit for a MERGED PR; null while GitHub has not yet
   *  reported one (D9: bootstrap_merged records it). */
  mergeCommitSha(pr: number): string | null
  comment(pr: number, body: string): void
  listLabeled(label: string): number[]
  /** D13: changed-file paths of the PR (`gh pr diff --name-only`). */
  changedFiles(pr: number): string[]
  postMergeRed(defaultBranch: string): boolean
}

// null = still running (not red). Any terminal conclusion that isn't a clean
// pass — timed_out, cancelled, action_required, startup_failure, stale,
// failure — must hold the queue, not just the literal "failure".
const GREENISH = new Set(['success', 'neutral', 'skipped'])

function resolveGhBin(): string {
  const bin = process.env.MQ_GH_CMD ?? 'gh'
  if (bin !== 'gh' && !fs.existsSync(bin)) {
    // Not a filesystem path — it may still be a bare command name resolvable
    // on PATH (e.g. MQ_GH_CMD=gh-wrapper). Confirm before rejecting it.
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' })
      return bin
    } catch {
      throw new Error(`merge-queue requires the gh CLI (not found: ${bin})`)
    }
  }
  if (bin === 'gh') {
    try {
      execFileSync('gh', ['--version'], { stdio: 'ignore' })
    } catch {
      throw new Error('merge-queue requires the gh CLI (not found on PATH)')
    }
  }
  return bin
}

export function createGhClient(cwd: string): GhClient {
  const bin = resolveGhBin()
  const gh = (args: string[]): string =>
    execFileSync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000 })

  return {
    viewPr(pr) {
      const raw = JSON.parse(gh([
        'pr', 'view', String(pr), '--json',
        'number,state,headRefOid,mergedAt,additions,deletions,title,body',
      ])) as Record<string, unknown>
      return {
        number: raw.number as number,
        state: raw.state as PrInfo['state'],
        headSha: raw.headRefOid as string,
        mergedAt: (raw.mergedAt as string | null) ?? null,
        additions: (raw.additions as number) ?? 0,
        deletions: (raw.deletions as number) ?? 0,
        title: (raw.title as string) ?? '',
        body: (raw.body as string) ?? '',
      }
    },
    squashMerge(pr, expectedHead) {
      const args = ['pr', 'merge', String(pr), '--squash', '--delete-branch']
      if (expectedHead) args.push('--match-head-commit', expectedHead)
      gh(args)
    },
    mergeCommitSha(pr) {
      const raw = JSON.parse(gh(['pr', 'view', String(pr), '--json', 'mergeCommit'])) as {
        mergeCommit: { oid: string } | null
      }
      return raw.mergeCommit?.oid ?? null
    },
    comment(pr, body) {
      gh(['pr', 'comment', String(pr), '--body', body])
    },
    listLabeled(label) {
      const raw = JSON.parse(gh([
        'pr', 'list', '--label', label, '--state', 'open', '--json', 'number',
      ])) as { number: number }[]
      return raw.map(r => r.number)
    },
    changedFiles(pr) {
      return gh(['pr', 'diff', String(pr), '--name-only'])
        .split('\n').map(l => l.trim()).filter(l => l !== '')
    },
    postMergeRed(defaultBranch) {
      try {
        const raw = JSON.parse(gh([
          'run', 'list', '--workflow', 'post-merge.yml', '--branch', defaultBranch,
          '--limit', '1', '--json', 'conclusion',
        ])) as { conclusion: string | null }[]
        if (raw.length === 0) return false
        const c = raw[0].conclusion
        return c !== null && !GREENISH.has(c)
      } catch {
        return false
      }
    },
  }
}
