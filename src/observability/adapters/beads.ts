import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'

const execFile = promisify(execFileCb)

export interface BeadsAdapterOpts {
  bdBin?: string
}

export const beadsAdapter: BaseAdapter & {
  probe(cwd: string, opts?: BeadsAdapterOpts): Promise<AdapterStatus>
  listTasks(cwd: string, opts?: BeadsAdapterOpts): Promise<unknown[]>
  claimWithEvent(cwd: string, args: { id: string; eventId: string }, opts?: BeadsAdapterOpts): Promise<boolean>
} = {
  id: 'beads',

  async probe(cwd: string, opts: BeadsAdapterOpts = {}): Promise<AdapterStatus> {
    try {
      await access(join(cwd, '.beads'))
    } catch {
      return { status: 'unavailable', reason: '.beads directory not found (project chose markdown-only tracking)' }
    }
    const bin = opts.bdBin ?? 'bd'
    let stdout: string
    try {
      ;({ stdout } = await execFile(bin, ['--version'], { cwd }))
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === 'ENOENT') return { status: 'degraded', reason: 'bd binary not installed' }
      return { status: 'degraded', reason: 'bd probe failed' }
    }
    const m = stdout.match(/(\d+)\.(\d+)\.(\d+)/)
    if (!m) return { status: 'degraded', reason: `bd version could not be parsed from: ${stdout.trim()}` }
    const major = Number(m[1])
    if (major < 1) {
      const reason =
        `bd version ${m[0]} is below the supported minimum (1.0.0). `
        + 'Run \'brew upgrade beads\' or your equivalent.'
      return { status: 'degraded', reason }
    }
    return { status: 'available' }
  },

  async listTasks(cwd: string, opts: BeadsAdapterOpts = {}): Promise<unknown[]> {
    const probe = await beadsAdapter.probe(cwd, opts)
    if (probe.status !== 'available') return []
    try {
      const { stdout } = await execFile(opts.bdBin ?? 'bd', ['list', '--all', '--json'], { cwd })
      return JSON.parse(stdout) as unknown[]
    } catch {
      return []
    }
  },

  async claimWithEvent(
    cwd: string,
    args: { id: string; eventId: string },
    opts: BeadsAdapterOpts = {},
  ): Promise<boolean> {
    const probe = await beadsAdapter.probe(cwd, opts)
    if (probe.status !== 'available') return false
    try {
      await execFile(
        opts.bdBin ?? 'bd',
        ['update', args.id, '--set-metadata', `ledger_event_id=${args.eventId}`, '--claim'],
        { cwd },
      )
      return true
    } catch {
      return false
    }
  },
}
