import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EngineOutput, Severity, Verdict, FindingsSummary } from './types.js'
import { composeAvailability, readMergedLedger, composeSnapshot } from './synthesizer.js'
import { buildDocGraph } from './doc-graph/index.js'
import { runChecks } from './checks/runner.js'
import { LENS_REGISTRY, LENS_IMPLEMENTATIONS } from './checks/registry.js'
import { aggregate } from './checks/findings-aggregator.js'
import { resolveFixThreshold } from './checks/fix-threshold.js'
import { loadObservabilityConfig } from './checks/observability-config.js'

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

function scaffoldVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../package.json'), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export interface RunAuditInput {
  primaryRoot: string
  profile: 'fast' | 'full'
  scope: 'docs' | 'code' | 'all'
  sinceHours: number
  lensIds?: string[]
  fixThresholdOverride?: string
  ghBin?: string
  bdBin?: string
  args?: Record<string, unknown>
}

const SCOPE_DOC_LENSES = new Set(['H-cross-doc'])
const SCOPE_CODE_LENSES = new Set([
  'A-tdd', 'B-ac-coverage', 'C-standards', 'D-stack', 'E-design', 'F-scope', 'G-decisions',
])

function pickEnabledIds(scope: RunAuditInput['scope'], explicit?: string[]): Set<string> {
  if (explicit && explicit.length > 0) return new Set(explicit)
  if (scope === 'docs') return SCOPE_DOC_LENSES
  if (scope === 'code') return SCOPE_CODE_LENSES
  return new Set([...SCOPE_DOC_LENSES, ...SCOPE_CODE_LENSES])
}

function deriveVerdict(blocking: number, skippedLenses: number): Verdict {
  if (blocking > 0) return 'blocked'
  if (skippedLenses > 0) return 'degraded-pass'
  return 'pass'
}

export async function runAudit(input: RunAuditInput): Promise<EngineOutput> {
  const started_at = new Date().toISOString()
  const merged = await readMergedLedger(input.primaryRoot)
  const availability = await composeAvailability(input.primaryRoot, { ghBin: input.ghBin, bdBin: input.bdBin })
  availability.ledger = merged.summary

  const graph = await buildDocGraph(input.primaryRoot)
  const enabledIds = pickEnabledIds(input.scope, input.lensIds)
  const config = loadObservabilityConfig(input.primaryRoot)
  for (const disabled of config.disabled_lenses) enabledIds.delete(disabled)
  const fix_threshold: Severity = resolveFixThreshold(input.primaryRoot, input.fixThresholdOverride)

  const rawFindings = await runChecks({
    registry: LENS_REGISTRY,
    lenses: LENS_IMPLEMENTATIONS,
    graph,
    ledger: { events: merged.events },
    availability,
    profile: input.profile,
    enabledIds,
  })
  const { findings, summary } = aggregate(rawFindings, merged.events, fix_threshold)
  const verdict = deriveVerdict(summary.blocking, summary.skipped_lenses)

  return {
    schema_version: '1.0',
    invocation: {
      command: 'audit',
      args: input.args ?? {},
      started_at,
      completed_at: new Date().toISOString(),
      scaffold_version: scaffoldVersion(),
    },
    availability,
    snapshot: null,
    replay: null,
    findings,
    needs_attention: [],
    graph_stats: {
      nodes_by_kind: {
        feature: graph.features.length, story: graph.stories.length, ac: graph.acceptance_criteria.length,
        plan_task: graph.plan_tasks.length, playbook_task: graph.playbook_tasks.length,
        test: graph.tests.length, file: graph.files.length, decision: graph.decisions.length,
      },
      edges_by_kind: graph.edges.reduce<Record<string, number>>((acc, e) => {
        acc[e.kind] = (acc[e.kind] ?? 0) + 1
        return acc
      }, {}),
      orphans_by_kind: {},
      unsanctioned_uses: 0,
      ad_hoc_token_uses: 0,
    },
    fix_threshold,
    verdict,
    summary,
  }
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

  // TODO: derive verdict/fix_threshold from actual findings once finding collection is implemented
  const fix_threshold: Severity = 'P2'
  const verdict: Verdict = 'pass'

  return {
    schema_version: '1.0',
    invocation: {
      command: 'progress',
      args: input.args ?? {},
      started_at,
      completed_at: new Date().toISOString(),
      scaffold_version: scaffoldVersion(),
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
