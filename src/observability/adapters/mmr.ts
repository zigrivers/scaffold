import { access, readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'

export interface MmrJobResult {
  verdict: 'pass' | 'degraded-pass' | 'blocked' | 'needs-user-decision'
  completed_at: string
  fix_threshold?: string
  [k: string]: unknown
}

const JOBS_DIR = '.mmr/jobs'

async function listResultFiles(cwd: string): Promise<string[]> {
  const dir = join(cwd, JOBS_DIR)
  try {
    await access(dir)
  } catch {
    return []
  }
  const subs = await readdir(dir)
  const results = await Promise.all(
    subs.map(async (sub) => {
      const p = join(dir, sub, 'result.json')
      try { await access(p); return p } catch { return null }
    }),
  )
  return results.filter((p): p is string => p !== null)
}

export const mmrAdapter: BaseAdapter & {
  mostRecentJob(cwd: string): Promise<MmrJobResult | null>
} = {
  id: 'mmr',

  async probe(cwd: string): Promise<AdapterStatus> {
    const files = await listResultFiles(cwd)
    if (files.length === 0) return { status: 'unavailable', reason: 'no MMR jobs found in .mmr/jobs/' }
    return { status: 'available', evidence_paths: files.slice(-1) }
  },

  async mostRecentJob(cwd: string): Promise<MmrJobResult | null> {
    const files = await listResultFiles(cwd)
    if (files.length === 0) return null
    const withMtime = await Promise.all(files.map(async (f) => ({ f, mtime: (await stat(f)).mtimeMs })))
    withMtime.sort((a, b) => b.mtime - a.mtime)
    try {
      return JSON.parse(await readFile(withMtime[0].f, 'utf8')) as MmrJobResult
    } catch {
      return null
    }
  },
}
