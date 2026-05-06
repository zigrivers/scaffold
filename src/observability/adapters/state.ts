import { access, readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'

export interface StepEntry {
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  source?: 'pipeline' | 'manual'
  produces?: string[]
}
export interface MergedState {
  version?: string
  methodology?: string
  steps: Record<string, StepEntry>
}

const ROOT_STATE = '.scaffold/state.json'

async function safeReadJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null }
}

import type { ReplayEvent } from '../engine/types.js'

export const stateAdapter: BaseAdapter & {
  readMergedState(cwd: string): Promise<MergedState>
  replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]>
} = {
  id: 'state',

  async probe(cwd: string): Promise<AdapterStatus> {
    try {
      await access(join(cwd, ROOT_STATE))
    } catch {
      return { status: 'unavailable', reason: 'no .scaffold/state.json' }
    }
    return { status: 'available', evidence_paths: [ROOT_STATE] }
  },

  async readMergedState(cwd: string): Promise<MergedState> {
    const merged: MergedState = { steps: {} }
    const root = await safeReadJson(join(cwd, ROOT_STATE)) as Partial<MergedState> | null
    if (root) {
      if (root.version) merged.version = root.version
      if (root.methodology) merged.methodology = root.methodology
      Object.assign(merged.steps, root.steps ?? {})
    }
    const servicesDir = join(cwd, '.scaffold', 'services')
    try {
      const svcStat = await stat(servicesDir)
      if (!svcStat.isDirectory()) return merged
      const svcs = await readdir(servicesDir)
      await Promise.all(svcs.map(async (svc) => {
        const svcPath = join(servicesDir, svc, 'state.json')
        const svcState = await safeReadJson(svcPath) as { steps?: Record<string, StepEntry> } | null
        if (!svcState?.steps) return
        for (const [slug, entry] of Object.entries(svcState.steps)) {
          merged.steps[`${slug}@${svc}`] = entry
        }
      }))
    } catch {
      // no services dir — fine
    }
    return merged
  },

  async replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]> {
    const path = join(cwd, ROOT_STATE)
    let mtimeIso: string
    try {
      const s = await stat(path)
      mtimeIso = s.mtime.toISOString()
    } catch {
      return []
    }
    const cutoff = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString()
    if (mtimeIso < cutoff) return []
    const merged = await stateAdapter.readMergedState(cwd)
    const out: ReplayEvent[] = []
    for (const [slug, entry] of Object.entries(merged.steps)) {
      if (entry.status !== 'completed' && entry.status !== 'in_progress') continue
      const kind = entry.status === 'completed' ? 'step_completed' : 'step_in_progress'
      out.push({
        sort_id: `state:${slug}:${entry.status}`,
        correlation_id: null,
        ts: mtimeIso,
        source: 'state', kind,
        summary: `pipeline step ${slug} → ${entry.status}`,
      })
    }
    return out
  },
}
