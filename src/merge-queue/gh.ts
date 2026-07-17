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
  squashMerge(pr: number): void
  comment(pr: number, body: string): void
  listLabeled(label: string): number[]
  postMergeRed(defaultBranch: string): boolean
}

function resolveGhBin(): string {
  const bin = process.env.MQ_GH_CMD ?? 'gh'
  if (bin !== 'gh' && !fs.existsSync(bin)) {
    throw new Error(`merge-queue requires the gh CLI (not found: ${bin})`)
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
    execFileSync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })

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
    squashMerge(pr) {
      gh(['pr', 'merge', String(pr), '--squash', '--delete-branch'])
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
    postMergeRed(defaultBranch) {
      try {
        const raw = JSON.parse(gh([
          'run', 'list', '--workflow', 'post-merge.yml', '--branch', defaultBranch,
          '--limit', '1', '--json', 'conclusion',
        ])) as { conclusion: string | null }[]
        return raw.length > 0 && raw[0].conclusion === 'failure'
      } catch {
        return false
      }
    },
  }
}
