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
} = {
  id: 'beads',

  async probe(cwd: string, opts: BeadsAdapterOpts = {}): Promise<AdapterStatus> {
    try {
      await access(join(cwd, '.beads'))
    } catch {
      return { status: 'unavailable', reason: '.beads directory not found (project chose markdown-only tracking)' }
    }
    const bin = opts.bdBin ?? 'bd'
    try {
      await execFile(bin, ['--version'], { cwd })
      return { status: 'available' }
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === 'ENOENT') return { status: 'degraded', reason: 'bd binary not installed' }
      return { status: 'degraded', reason: 'bd probe failed' }
    }
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
}
