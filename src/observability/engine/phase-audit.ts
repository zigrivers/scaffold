import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { runAudit } from './api.js'
import { writeSidecar, deriveReportId } from '../renderers/sidecar.js'
import { renderAuditMarkdown } from '../renderers/markdown.js'
import { isPhaseBoundary, phaseLabel } from './phase-subsets.js'
import { loadObservabilityConfig } from './checks/observability-config.js'
import type { EngineOutput } from './types.js'

export interface RunPhaseAuditInput {
  primaryRoot: string
  step: string
  ghBin?: string
  bdBin?: string
}

export interface PhaseAuditResult {
  ran: boolean
  step: string
  reason?: string
  verdict?: string
  findings_count?: number
  blocking_count?: number
  markdown_path?: string
  sidecar_path?: string
  timed_out?: boolean
  detached?: boolean
  elapsed_ms?: number
}

function raceTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<{ value: T; timed_out: false } | { value: undefined; timed_out: true }> {
  if (ms <= 0) return Promise.resolve({ value: undefined as unknown as T, timed_out: true } as { value: undefined; timed_out: true })
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ value: undefined, timed_out: true }), ms)
    promise.then((value) => {
      clearTimeout(timer)
      resolve({ value, timed_out: false })
    }).catch(() => {
      clearTimeout(timer)
      resolve({ value: undefined, timed_out: true })
    })
  })
}

async function persistAudit(primaryRoot: string, out: EngineOutput): Promise<{ mdRel: string; sidecarRel: string }> {
  const reportId = deriveReportId(out)
  const sidecarAbs = await writeSidecar(primaryRoot, out)
  const sidecarRel = sidecarAbs.replace(`${primaryRoot}/`, '')
  const md = renderAuditMarkdown(out)
  const mdRel = `docs/audits/${reportId}.md`
  const mdAbs = join(primaryRoot, mdRel)
  mkdirSync(dirname(mdAbs), { recursive: true })
  writeFileSync(mdAbs, md, { mode: 0o644 })
  return { mdRel, sidecarRel }
}

export async function runPhaseAudit(input: RunPhaseAuditInput): Promise<PhaseAuditResult> {
  const config = loadObservabilityConfig(input.primaryRoot)
  if (!config.phase_audit.enabled) {
    return { ran: false, step: input.step, reason: 'phase_audit disabled in observability.yaml' }
  }
  if (!isPhaseBoundary(input.step)) {
    return { ran: false, step: input.step, reason: `${input.step} is not a phase boundary` }
  }

  const auditArgs = {
    primaryRoot: input.primaryRoot,
    profile: 'fast' as const,
    scope: 'docs' as const,
    sinceHours: 24,
    lensIds: ['H-cross-doc'],
    ghBin: input.ghBin,
    bdBin: input.bdBin,
    args: { triggered_by: 'phase-boundary', step: input.step, phase_label: phaseLabel(input.step) },
  }

  if (config.phase_audit.detached) {
    void runAudit(auditArgs).then(async (out) => {
      try { await persistAudit(input.primaryRoot, out) } catch (err) {
        if (process.env.PHASE_AUDIT_DEBUG === '1') {
          process.stderr.write(`detached phase-audit failed: ${(err as Error).message}\n`)
        }
      }
    })
    return { ran: true, step: input.step, detached: true, elapsed_ms: 0 }
  }

  const started = Date.now()
  const raced = await raceTimeout(runAudit(auditArgs), config.phase_audit.timeout_s * 1000)
  if (raced.timed_out) {
    return {
      ran: true, step: input.step, timed_out: true, elapsed_ms: Date.now() - started,
      reason: `audit exceeded ${config.phase_audit.timeout_s}s budget`,
    }
  }
  const out = raced.value!
  const { mdRel, sidecarRel } = await persistAudit(input.primaryRoot, out)

  return {
    ran: true,
    step: input.step,
    verdict: out.verdict,
    findings_count: out.summary.total,
    blocking_count: out.summary.blocking,
    markdown_path: mdRel,
    sidecar_path: sidecarRel,
    timed_out: false,
    elapsed_ms: Date.now() - started,
  }
}

export function formatPhaseAuditLine(r: PhaseAuditResult): string {
  if (!r.ran) return ''
  if (r.detached) return `[audit] dispatched in background (step: ${r.step})`
  if (r.timed_out) return `[audit] timed out after ${r.elapsed_ms}ms — partial findings may not be written`
  return `[audit] ${r.findings_count} findings (${r.blocking_count ?? 0} blocking, verdict=${r.verdict}) — see ${r.markdown_path}`
}
