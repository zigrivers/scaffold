import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EngineOutput, Severity, Verdict, FindingsSummary } from './types.js'
import { composeAvailability, readMergedLedger, composeSnapshot } from './synthesizer.js'

export interface RunProgressInput {
  primaryRoot: string
  sinceHours: number
  ghBin?: string
  bdBin?: string
  args?: Record<string, unknown>
}

const EMPTY_SUMMARY: FindingsSummary = {
  total: 0,
  by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
  by_severity_status: {
    P0: { open: 0, acknowledged: 0, skipped: 0 },
    P1: { open: 0, acknowledged: 0, skipped: 0 },
    P2: { open: 0, acknowledged: 0, skipped: 0 },
    P3: { open: 0, acknowledged: 0, skipped: 0 },
  },
  blocking: 0,
  acknowledged: 0,
  skipped_lenses: 0,
}

async function scaffoldVersion(): Promise<string> {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), '../../../package.json'),
    join(process.cwd(), 'package.json'),
  ]
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(await readFile(p, 'utf8')) as { version?: string }
      if (pkg.version) return pkg.version
    } catch { /* try next */ }
  }
  return '0.0.0'
}

export async function runProgress(input: RunProgressInput): Promise<EngineOutput> {
  const started_at = new Date().toISOString()
  const merged = await readMergedLedger(input.primaryRoot)
  const availability = await composeAvailability(input.primaryRoot, { ghBin: input.ghBin, bdBin: input.bdBin })
  availability.ledger = merged.summary

  const snapshot = composeSnapshot({
    events: merged.events,
    sinceHours: input.sinceHours,
    currentPhase: 'build',
  })

  const fix_threshold: Severity = 'P2'
  const verdict: Verdict = 'pass'

  return {
    schema_version: '1.0',
    invocation: {
      command: 'progress',
      args: input.args ?? {},
      started_at,
      completed_at: new Date().toISOString(),
      scaffold_version: await scaffoldVersion(),
    },
    availability,
    snapshot,
    replay: null,
    findings: [],
    needs_attention: [],
    graph_stats: {
      nodes_by_kind: {},
      edges_by_kind: {},
      orphans_by_kind: {},
      unsanctioned_uses: 0,
      ad_hoc_token_uses: 0,
    },
    fix_threshold,
    verdict,
    summary: EMPTY_SUMMARY,
  }
}
