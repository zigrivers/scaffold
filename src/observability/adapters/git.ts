import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { AdapterStatus, BaseAdapter } from './types.js'

const execFile = promisify(execFileCb)

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
}

export interface CommitInfo {
  sha: string
  branch: string | null
  ts: string
  author: string
  subject: string
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 })
  return stdout
}

export const gitAdapter: BaseAdapter & {
  listWorktrees(cwd: string): Promise<WorktreeInfo[]>
  recentCommits(cwd: string, opts: { sinceHours: number }): Promise<CommitInfo[]>
} = {
  id: 'git',

  async probe(cwd: string): Promise<AdapterStatus> {
    try {
      await git(cwd, ['rev-parse', '--is-inside-work-tree'])
      return { status: 'available' }
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === 'ENOENT') return { status: 'unavailable', reason: 'git binary not found' }
      return { status: 'unavailable', reason: 'not a git repository' }
    }
  },

  async listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
    try {
      const out = await git(cwd, ['worktree', 'list', '--porcelain'])
      const wts: WorktreeInfo[] = []
      let cur: Partial<WorktreeInfo> = {}
      for (const line of out.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (cur.path) wts.push({ path: cur.path, branch: cur.branch ?? '', head: cur.head ?? '' })
          cur = { path: line.slice('worktree '.length).trim() }
        } else if (line.startsWith('HEAD ')) {
          cur.head = line.slice('HEAD '.length).trim()
        } else if (line.startsWith('branch ')) {
          cur.branch = line.slice('branch '.length).replace('refs/heads/', '').trim()
        }
      }
      if (cur.path) wts.push({ path: cur.path, branch: cur.branch ?? '', head: cur.head ?? '' })
      return wts
    } catch {
      return []
    }
  },

  async recentCommits(cwd: string, opts: { sinceHours: number }): Promise<CommitInfo[]> {
    try {
      const since = `${opts.sinceHours}.hours.ago`
      const fmt = '%H%x09%cI%x09%an%x09%s'
      const out = await git(cwd, ['log', '--all', `--since=${since}`, `--pretty=format:${fmt}`])
      return out.split('\n').filter(Boolean).map((line) => {
        const [sha, ts, author, ...rest] = line.split('\t')
        return { sha, branch: null, ts, author, subject: rest.join('\t') }
      })
    } catch {
      return []
    }
  },
}
