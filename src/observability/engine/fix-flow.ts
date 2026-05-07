import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EngineOutput, Finding } from './types'
import { buildFixPlan } from './fix-plan'
import { dispatchFixAgent, type DispatchFixResult } from './fix-agent-dispatcher'
import { runAudit } from './api'
import { renderAuditMarkdown } from '../renderers/markdown'
import { writeSidecar, deriveReportId } from '../renderers/sidecar'
import { captureSnapshot, recordStaged, type AbortSnapshot } from './abort-snapshot'
import { loadObservabilityConfig } from './checks/observability-config'

export type FixDispatcher = (
  input: { prompt: string; command: string; timeoutMs: number; cwd: string }
) => Promise<DispatchFixResult>

export type FixVerifier = (cwd: string, finding: Finding) => Promise<{ stillPresent: boolean }>

export interface RunFixFlowInput {
  primaryRoot: string
  initial: EngineOutput
  dispatcher?: FixDispatcher
  verifier?: FixVerifier
  ghBin?: string
  bdBin?: string
  abortSnapshot?: AbortSnapshot
}

export interface FixFlowResult {
  fixed: string[]
  failed: string[]
  postfix_markdown_path?: string
  postfix_sidecar_path?: string
  aborted?: boolean
}

function buildFindingPrompt(finding: Finding): string {
  return [
    `# Fix request for finding ${finding.id.slice(0, 8)}`,
    '',
    `Lens: ${finding.lens_id}`,
    `Severity: ${finding.severity}`,
    `Title: ${finding.title}`,
    `Source doc: ${finding.source_doc || '(none)'}`,
    '',
    '## Description',
    finding.description,
    '',
    '## Evidence',
    '```json',
    JSON.stringify(finding.evidence, null, 2),
    '```',
    '',
    finding.fix_hint
      ? `## Fix hint\n${finding.fix_hint.prompt ?? '(target only)'}\nTarget: ${finding.fix_hint.target ?? '(none)'}\n`
      : '',
    '## Instructions',
    '',
    'Fix this specific finding only. Do not do unrelated work. Stage your changes with `git add` when finished. Exit when done.',
  ].filter(Boolean).join('\n')
}

function defaultVerifier(cwd: string, finding: Finding): Promise<{ stillPresent: boolean }> {
  return runAudit({
    primaryRoot: cwd, profile: 'fast', scope: 'all',
    sinceHours: 24, lensIds: [finding.lens_id],
    args: { profile: 'fast', scope: 'all', lensIds: [finding.lens_id], verifying: finding.id },
  }).then((out) => ({ stillPresent: out.findings.some((f) => f.id === finding.id) }))
}

function listStagedSince(cwd: string, baselineStaged: Set<string>): string[] {
  try {
    const current = new Set(
      execFileSync('git', ['diff', '--cached', '--name-only'], { cwd, encoding: 'utf8' })
        .trim().split('\n').filter(Boolean),
    )
    return [...current].filter((p) => !baselineStaged.has(p))
  } catch { return [] }
}

async function tryFixFinding(
  finding: Finding,
  cwd: string,
  dispatcher: FixDispatcher,
  verifier: FixVerifier,
  command: string,
  timeoutMs: number,
  maxAttempts: number,
  snapshot: AbortSnapshot,
): Promise<{ fixed: boolean; attempts: number }> {
  const prompt = buildFindingPrompt(finding)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const baselineStaged = new Set([...snapshot.pre_existing_staged, ...snapshot.staged_paths])
    const result = await dispatcher({ prompt, command, timeoutMs, cwd })
    if (!result.ok) continue
    const newlyStaged = listStagedSince(cwd, baselineStaged)
    recordStaged(snapshot, newlyStaged)
    const { stillPresent } = await verifier(cwd, finding)
    if (!stillPresent) return { fixed: true, attempts: attempt }
  }
  return { fixed: false, attempts: maxAttempts }
}

export async function runFixFlow(input: RunFixFlowInput): Promise<FixFlowResult> {
  const config = loadObservabilityConfig(input.primaryRoot)
  const command = config.fix.dispatcher_command ?? 'claude -p'
  const timeoutMs = (config.fix.timeout_s ?? 300) * 1000
  const maxAttempts = config.fix.per_finding_max_attempts ?? 3
  const dispatcher = input.dispatcher ?? dispatchFixAgent
  const verifier = input.verifier ?? defaultVerifier
  const snapshot = input.abortSnapshot ?? captureSnapshot(input.primaryRoot)

  const plan = buildFixPlan(input.initial.findings, input.initial.fix_threshold)
  const fixed: string[] = []
  const failed: string[] = []

  for (const finding of plan) {
    const res = await tryFixFinding(
      finding, input.primaryRoot, dispatcher, verifier,
      command, timeoutMs, maxAttempts, snapshot,
    )
    if (res.fixed) fixed.push(finding.id)
    else failed.push(finding.id)
  }

  const postfix = await runAudit({
    primaryRoot: input.primaryRoot,
    profile: 'fast', scope: 'all', sinceHours: 24,
    ghBin: input.ghBin, bdBin: input.bdBin,
    args: { profile: 'fast', scope: 'all', postfix: true },
  })
  const postfixId = `${deriveReportId(postfix)}-postfix`
  const postfixSidecarAbs = await writeSidecar(
    input.primaryRoot, postfix, `docs/audits/${postfixId}.json`,
  )
  const postfixMd = renderAuditMarkdown(postfix)
  const postfixMdAbs = join(input.primaryRoot, `docs/audits/${postfixId}.md`)
  mkdirSync(dirname(postfixMdAbs), { recursive: true })
  writeFileSync(postfixMdAbs, postfixMd, { mode: 0o644 })

  return {
    fixed, failed,
    postfix_markdown_path: `docs/audits/${postfixId}.md`,
    postfix_sidecar_path: postfixSidecarAbs.replace(`${input.primaryRoot}/`, ''),
  }
}
