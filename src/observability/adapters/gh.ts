import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { AdapterStatus, BaseAdapter } from './types.js'
import type { ReplayEvent } from '../engine/types.js'

const execFile = promisify(execFileCb)
const GH_TIMEOUT_MS = 30_000

export interface PrInfo {
  number: number
  url: string
  state: 'open' | 'merged' | 'closed'
  branch: string
  opened_at: string
  merged_at?: string
  closed_at?: string
}

export interface GhAdapterOpts {
  ghBin?: string
  ghArgs?: string[]
}

export const ghAdapter: BaseAdapter & {
  probe(cwd: string, opts?: GhAdapterOpts): Promise<AdapterStatus>
  listOpenPRs(cwd: string, opts?: GhAdapterOpts): Promise<PrInfo[]>
  replayEvents(cwd: string, opts: { sinceHours: number; ghBin?: string }): Promise<ReplayEvent[]>
  _prsToReplayEvents(prs: PrInfo[], opts: { sinceHours: number }): ReplayEvent[]
} = {
  id: 'gh',

  async probe(cwd: string, opts: GhAdapterOpts = {}): Promise<AdapterStatus> {
    const bin = opts.ghBin ?? 'gh'
    const args = opts.ghArgs ?? ['auth', 'status']
    try {
      await execFile(bin, args, { cwd, timeout: GH_TIMEOUT_MS })
      return { status: 'available' }
    } catch (err: unknown) {
      const e = err as { code?: string; stderr?: string }
      if (e.code === 'ENOENT' || /not found/i.test(String(e.stderr ?? ''))) {
        return { status: 'unavailable', reason: 'gh binary not installed (ENOENT)' }
      }
      if (/auth|login/i.test(String(e.stderr ?? ''))) {
        return { status: 'degraded', reason: 'gh installed but not authenticated' }
      }
      return { status: 'degraded', reason: String(e.stderr ?? '').trim().slice(0, 200) || 'gh probe failed' }
    }
  },

  async listOpenPRs(cwd: string, opts: GhAdapterOpts = {}): Promise<PrInfo[]> {
    const bin = opts.ghBin ?? 'gh'
    // Probe with only ghBin (not ghArgs) so we always check real auth status.
    const probe = await ghAdapter.probe(cwd, { ghBin: bin })
    if (probe.status !== 'available') return []
    try {
      const { stdout } = await execFile(bin, [
        'pr', 'list', '--state', 'open', '--json',
        'number,url,state,headRefName,createdAt,mergedAt',
      ], { cwd, maxBuffer: 32 * 1024 * 1024, timeout: GH_TIMEOUT_MS })
      const raw = JSON.parse(stdout) as Array<{
        number: number
        url: string
        state: string
        headRefName: string
        createdAt: string
        mergedAt?: string | null
      }>
      return raw.map((p) => ({
        number: p.number,
        url: p.url,
        state: p.state.toLowerCase() as PrInfo['state'],
        branch: p.headRefName,
        opened_at: p.createdAt,
        merged_at: p.mergedAt ?? undefined,
      }))
    } catch {
      return []
    }
  },

  _prsToReplayEvents(prs: PrInfo[], opts: { sinceHours: number }): ReplayEvent[] {
    const cutoff = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString()
    const out: ReplayEvent[] = []
    for (const p of prs) {
      if (p.opened_at >= cutoff) {
        out.push({
          sort_id: `gh:${p.number}:opened`,
          correlation_id: `pr:${p.number}:opened`,
          ts: p.opened_at, source: 'gh', kind: 'pr_opened',
          summary: `PR #${p.number} opened on ${p.branch}`,
          link: p.url,
        })
      }
      if (p.state === 'merged' && p.merged_at && p.merged_at >= cutoff) {
        out.push({
          sort_id: `gh:${p.number}:merged`,
          correlation_id: `pr:${p.number}:merged`,
          ts: p.merged_at, source: 'gh', kind: 'pr_merged',
          summary: `PR #${p.number} merged`,
          link: p.url,
        })
      }
      if (p.state === 'closed' && !p.merged_at && p.closed_at && p.closed_at >= cutoff) {
        out.push({
          sort_id: `gh:${p.number}:closed`,
          correlation_id: `pr:${p.number}:closed`,
          ts: p.closed_at, source: 'gh', kind: 'pr_closed',
          summary: `PR #${p.number} closed without merge`,
          link: p.url,
        })
      }
    }
    return out
  },

  async replayEvents(cwd: string, opts: { sinceHours: number; ghBin?: string }): Promise<ReplayEvent[]> {
    const probe = await ghAdapter.probe(cwd, { ghBin: opts.ghBin })
    if (probe.status === 'unavailable') return []
    const open = await ghAdapter.listOpenPRs(cwd, { ghBin: opts.ghBin })
    const bin = opts.ghBin ?? 'gh'
    const since = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString().slice(0, 10)
    let merged: PrInfo[] = []
    try {
      const { stdout } = await execFile(bin, [
        'pr', 'list', '--state', 'merged', '--search', `merged:>=${since}`, '--json',
        'number,url,state,headRefName,createdAt,mergedAt',
      ], { cwd, timeout: GH_TIMEOUT_MS })
      merged = (JSON.parse(stdout) as Array<{
        number: number; url: string; state: string; headRefName: string; createdAt: string; mergedAt?: string
      }>).map((p) => ({
        number: p.number, url: p.url, state: 'merged' as const,
        branch: p.headRefName, opened_at: p.createdAt, merged_at: p.mergedAt,
      }))
    } catch { /* gh unavailable or not authed for merged query */ }
    let closedUnmerged: PrInfo[] = []
    try {
      const { stdout } = await execFile(bin, [
        'pr', 'list', '--state', 'closed', '--search', `closed:>=${since}`, '--json',
        'number,url,state,headRefName,createdAt,closedAt',
      ], { cwd, timeout: GH_TIMEOUT_MS })
      closedUnmerged = (JSON.parse(stdout) as Array<{
        number: number; url: string; state: string; headRefName: string; createdAt: string; closedAt?: string
      }>).map((p) => ({
        number: p.number, url: p.url, state: 'closed' as const,
        branch: p.headRefName, opened_at: p.createdAt, closed_at: p.closedAt,
      }))
    } catch { /* gh unavailable or query unsupported */ }
    return ghAdapter._prsToReplayEvents([...open, ...merged, ...closedUnmerged], opts)
  },
}
