import { access, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'

const DIR = 'docs/audits'

async function listJsonFiles(cwd: string): Promise<string[]> {
  const d = join(cwd, DIR)
  try {
    await access(d)
  } catch {
    return []
  }
  const entries = await readdir(d)
  return entries.filter((f) => f.endsWith('.json')).map((f) => join(d, f))
}

export const auditHistoryAdapter: BaseAdapter & {
  listSidecars(cwd: string): Promise<string[]>
} = {
  id: 'audit_history',

  async probe(cwd: string): Promise<AdapterStatus> {
    const files = await listJsonFiles(cwd)
    if (files.length === 0) return { status: 'unavailable', reason: 'no audit JSON sidecars under docs/audits/' }
    return { status: 'available', evidence_paths: [DIR] }
  },

  async listSidecars(cwd: string): Promise<string[]> {
    const files = await listJsonFiles(cwd)
    const withMtime = await Promise.all(files.map(async (f) => ({ f, mtime: (await stat(f)).mtimeMs })))
    withMtime.sort((a, b) => b.mtime - a.mtime)
    return withMtime.map((x) => x.f)
  },
}
