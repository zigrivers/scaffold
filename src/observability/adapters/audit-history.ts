import { access, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'
import type { Severity, Finding } from '../engine/types.js'

const DIR = 'docs/audits'

interface SidecarShape {
  engine_output: {
    schema_version: string
    invocation: { command: 'audit' | 'progress'; started_at: string; args?: Record<string, unknown> }
    summary?: {
      total: number
      by_severity: Record<Severity, number>
      blocking: number
      acknowledged: number
      skipped_lenses: number
    }
    findings?: Array<Finding & { lens_id: string; status: string; evidence?: { kind?: string } }>
  }
}

// Caps sidecar scanning to prevent unbounded reads on mature repos; 100 audits
// covers months of daily runs while keeping probe/trend latency under ~200ms.
const MAX_SIDECAR_SCAN = 100

async function listJsonFiles(cwd: string): Promise<string[]> {
  const d = join(cwd, DIR)
  const exists = await access(d).then(() => true).catch(() => false)
  if (!exists) return []
  const entries = await readdir(d)
  const jsons = entries.filter((f) => f.endsWith('.json'))
  const withMtimes = await Promise.all(
    jsons.map(async (f) => {
      const p = join(d, f)
      const st = await stat(p).catch(() => null)
      return { path: p, mtime: st?.mtimeMs ?? 0 }
    }),
  )
  return withMtimes
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_SIDECAR_SCAN)
    .map((x) => x.path)
}

async function safeRead(path: string): Promise<SidecarShape | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) as SidecarShape } catch { return null }
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
  latestFindings(cwd: string): Promise<Finding[]>
} = {
  id: 'audit_history',

  async probe(cwd: string): Promise<AdapterStatus> {
    const files = await listJsonFiles(cwd)
    if (files.length === 0) return { status: 'unavailable', reason: 'no audit JSON sidecars under docs/audits/' }
    return { status: 'available', evidence_paths: [DIR] }
  },

  async listSidecars(cwd: string): Promise<string[]> {
    return listJsonFiles(cwd)
  },

  async readTrends(cwd: string): Promise<AuditTrendPoint[]> {
    const files = await listJsonFiles(cwd)
    const raw = await Promise.all(files.map((f) => safeRead(f)))
    const points: AuditTrendPoint[] = raw.flatMap((s) => {
      if (!s?.engine_output?.summary) return []
      if (s.engine_output.invocation.command !== 'audit') return []
      const sum = s.engine_output.summary
      return [{
        ts: s.engine_output.invocation.started_at,
        total: sum.total,
        blocking: sum.blocking,
        acknowledged: sum.acknowledged,
        skipped_lenses: sum.skipped_lenses,
        by_severity: sum.by_severity,
      }]
    })
    return points.sort((a, b) => b.ts.localeCompare(a.ts))
  },

  async lensSkippedStreaks(cwd: string): Promise<Record<string, number>> {
    const files = await listJsonFiles(cwd)
    const raw = await Promise.all(files.map((f) => safeRead(f)))
    const sidecars = raw
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

  async latestFindings(cwd: string): Promise<Finding[]> {
    const files = await listJsonFiles(cwd)
    for (const f of files) {
      const s = await safeRead(f)
      if (s?.engine_output?.invocation?.command !== 'audit') continue
      if (!s.engine_output.findings) continue
      // Skip scoped audits (--lens filter): their findings are incomplete and would cause
      // false negatives — other lenses' open findings would appear resolved.
      const args = s.engine_output.invocation.args as Record<string, unknown> | undefined
      if (args && Array.isArray(args.lensIds) && (args.lensIds as unknown[]).length > 0) continue
      return s.engine_output.findings as Finding[]
    }
    return []
  },
}
