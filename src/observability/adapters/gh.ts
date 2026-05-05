import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { AdapterStatus, BaseAdapter } from './types.js'

const execFile = promisify(execFileCb)

export interface PrInfo {
  number: number
  url: string
  state: 'open' | 'merged' | 'closed'
  branch: string
  opened_at: string
  merged_at?: string
}

export interface GhAdapterOpts {
  ghBin?: string
  ghArgs?: string[]
}

export const ghAdapter: BaseAdapter & {
  probe(cwd: string, opts?: GhAdapterOpts): Promise<AdapterStatus>
  listOpenPRs(cwd: string, opts?: GhAdapterOpts): Promise<PrInfo[]>
} = {
  id: 'gh',

  async probe(cwd: string, opts: GhAdapterOpts = {}): Promise<AdapterStatus> {
    const bin = opts.ghBin ?? 'gh'
    const args = opts.ghArgs ?? ['auth', 'status']
    try {
      await execFile(bin, args, { cwd })
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
    const probe = await ghAdapter.probe(cwd, opts)
    if (probe.status !== 'available') return []
    try {
      const { stdout } = await execFile(bin, [
        'pr', 'list', '--state', 'open', '--json',
        'number,url,state,headRefName,createdAt,mergedAt',
      ], { cwd })
      const raw = JSON.parse(stdout) as Array<{
        number: number
        url: string
        state: string
        headRefName: string
        createdAt: string
        mergedAt?: string
      }>
      return raw.map((p) => ({
        number: p.number,
        url: p.url,
        state: p.state.toLowerCase() as PrInfo['state'],
        branch: p.headRefName,
        opened_at: p.createdAt,
        merged_at: p.mergedAt,
      }))
    } catch {
      return []
    }
  },
}
