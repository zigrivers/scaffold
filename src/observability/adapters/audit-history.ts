import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'
import type { Severity } from '../engine/types.js'

const DIR = 'docs/audits'

interface SidecarShape {
  engine_output: {
    schema_version: string
    invocation: { command: 'audit' | 'progress'; started_at: string }
    summary?: {
      total: number
      by_severity: Record<Severity, number>
      blocking: number
      acknowledged: number
      skipped_lenses: number
    }
    findings?: Array<{ lens_id: string; status: string; evidence?: { kind?: string } }>
  }
}

function listJsonFiles(cwd: string): string[] {
  const d = join(cwd, DIR)
  if (!existsSync(d)) return []
  return readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => join(d, f))
}

function safeRead(path: string): SidecarShape | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as SidecarShape } catch { return null }
}

export interface AuditTrendPoint {
  ts: string
  total: number
  blocking: number
  acknowledged: number
  skipped_lenses: number
  by_severity: Record<Severity, number>
}

export const auditHistoryAdapter: BaseAdapter & {
  listSidecars(cwd: string): Promise<string[]>
  readTrends(cwd: string): Promise<AuditTrendPoint[]>
  lensSkippedStreaks(cwd: string): Promise<Record<string, number>>
} = {
  id: 'audit_history',

  async probe(cwd: string): Promise<AdapterStatus> {
    const files = listJsonFiles(cwd)
    if (files.length === 0) return { status: 'unavailable', reason: 'no audit JSON sidecars under docs/audits/' }
    return { status: 'available', evidence_paths: [DIR] }
  },

  async listSidecars(cwd: string): Promise<string[]> {
    const files = listJsonFiles(cwd)
    return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  },

  async readTrends(cwd: string): Promise<AuditTrendPoint[]> {
    const files = listJsonFiles(cwd)
    const points: AuditTrendPoint[] = []
    for (const f of files) {
      const s = safeRead(f)
      if (!s?.engine_output?.summary) continue
      if (s.engine_output.invocation.command !== 'audit') continue
      points.push({
        ts: s.engine_output.invocation.started_at,
        total: s.engine_output.summary.total,
        blocking: s.engine_output.summary.blocking,
        acknowledged: s.engine_output.summary.acknowledged,
        skipped_lenses: s.engine_output.summary.skipped_lenses,
        by_severity: s.engine_output.summary.by_severity,
      })
    }
    return points.sort((a, b) => b.ts.localeCompare(a.ts))
  },

  async lensSkippedStreaks(cwd: string): Promise<Record<string, number>> {
    const files = listJsonFiles(cwd)
    const sidecars = files
      .map((f) => safeRead(f))
      .filter((s): s is SidecarShape => Boolean(s?.engine_output))
      .filter((s) => s.engine_output.invocation.command === 'audit')
      .sort((a, b) => b.engine_output.invocation.started_at.localeCompare(a.engine_output.invocation.started_at))

    const streaks: Record<string, number> = {}
    const stillStreaking = new Set<string>()
    let firstRun = true
    for (const s of sidecars) {
      const skippedThisRun = new Set(
        (s.engine_output.findings ?? [])
          .filter((f) => f.status === 'skipped' && f.evidence?.kind === 'lens_skipped')
          .map((f) => f.lens_id),
      )
      if (firstRun) {
        for (const id of skippedThisRun) { streaks[id] = 1; stillStreaking.add(id) }
        firstRun = false
      } else {
        for (const id of [...stillStreaking]) {
          if (skippedThisRun.has(id)) streaks[id] = (streaks[id] ?? 0) + 1
          else stillStreaking.delete(id)
        }
      }
    }
    return streaks
  },
}
