import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { loadPipelineContext } from '../core/pipeline/context.js'
import { resolvePipeline } from '../core/pipeline/resolver.js'
import { resolveDepth } from '../core/assembly/depth-resolver.js'
import { resolveAssemblyMode } from '../core/assembly/update-mode.js'
import { StateManager } from '../state/state-manager.js'
import { StatePathResolver } from '../state/state-path-resolver.js'
import { verifyStep } from '../state/completion.js'
import type { DetectCheckResult, StepVerification } from '../state/completion.js'
import { proposeMapCandidates } from '../ingestion/map-candidates.js'
import { TYPE_KEY } from './adopt.js'
import type { AdoptionResult } from './adopt.js'
import { buildOpsActions, renderOpsActionsSection, type OpsActionRecord } from './adoption-ops-actions.js'
import type { MethodologyName, PipelineState, ScaffoldError } from '../types/index.js'
import type { ScaffoldConfig, StepEnablementEntry } from '../types/config.js'

export type AdoptionDisposition =
  'done-verified' | 'conflict' | 'run' | 'skip-proposed' | 'undetectable' | 'map-candidate'
export type ApplyAction = 'mark-completed' | 'reopen-pending' | 'record-pending' | 'none'

export interface StepPlanRecord {
  step_slug: string
  disposition: AdoptionDisposition
  apply_action: ApplyAction
  audit_event: 'verification-reversal' | 'partial-artifacts' | null
  detect_checks: DetectCheckResult[]
  outputs_present: string[]
  outputs_missing: string[]
  /** Proposed artifact_map target (D10). Present iff disposition === 'map-candidate'. */
  target?: string
  /** Resolved assembly mode (§6.1). Present iff disposition === 'run'. */
  mode?: 'fresh' | 'update' | 'adoption'
}

export interface InitializeRecord {
  /** The EXACT config.yml payload apply will write (D2) — never more. */
  config: {
    version: 2
    methodology: MethodologyName
    platforms: string[]
    project: Record<string, unknown> | null
  }
  /** The initial state summary: init-mode + per-step statuses (D2). */
  state: {
    'init-mode': 'greenfield' | 'brownfield' | 'v1-migration'
    methodology: MethodologyName
    steps: Record<string, 'pending' | 'completed'>
  }
}

export interface AdoptionPlan {
  generated_at: string
  project_root: string
  mode: 'greenfield' | 'brownfield' | 'v1-migration'
  methodology: MethodologyName
  includes: string[]
  initialize: InitializeRecord | null
  steps: StepPlanRecord[]
  disabled_by_preset: string[]
  /** R2 §6.1 ops-actions preview — joins plan_key (D1: no apply-relevant ops
   *  detail can change without changing the key). */
  ops_actions: OpsActionRecord[]
  plan_key: string
}

/** JSON with recursively sorted object keys — the canonical form under plan_key. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']'
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    // Omit undefined-valued keys, mirroring JSON.stringify's object semantics
    // (`{a: undefined}` → `{}`). Without this an optional-but-present-undefined
    // field (e.g. R3's `target?`/`mode?`) would emit a bare `undefined` token —
    // invalid JSON and a source of key non-determinism when this is reused.
    const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort()
    return '{' + keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',') + '}'
  }
  return JSON.stringify(value)
}

/**
 * plan_key (D1): sha256 hex over the canonical JSON of the COMPLETE apply-action
 * records — initialize record, sorted includes, per-step records sorted by slug,
 * sorted disabled-by-preset slugs, and (R2 §6.1) the ops-actions preview records.
 * generated_at / project_root / markdown prose never participate.
 */
export function computePlanKey(input: {
  initialize: InitializeRecord | null
  includes: string[]
  steps: StepPlanRecord[]
  disabled_by_preset: string[]
  /** Optional for R1-era callers — omitted keys the same as an empty preview. */
  ops_actions?: OpsActionRecord[]
}): string {
  const canonical = canonicalJson({
    initialize: input.initialize,
    includes: [...input.includes].sort(),
    steps: [...input.steps].sort((a, b) => a.step_slug.localeCompare(b.step_slug)),
    disabled_by_preset: [...input.disabled_by_preset].sort(),
    ops_actions: input.ops_actions ?? [],
  })
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

function dispositionFor(verification: StepVerification): {
  disposition: AdoptionDisposition
  apply_action: ApplyAction
  audit_event: StepPlanRecord['audit_event']
} {
  if (verification.undetectable) {
    return { disposition: 'undetectable', apply_action: 'none', audit_event: null }
  }
  if (verification.status === 'conflict') {
    return verification.conflictClass === 'state-claim'
      ? { disposition: 'conflict', apply_action: 'reopen-pending', audit_event: 'verification-reversal' }
      : { disposition: 'conflict', apply_action: 'record-pending', audit_event: 'partial-artifacts' }
  }
  if (verification.verification === 'verified') {
    // mark-completed is idempotent — it also upgrades a surviving 'declared'
    // claim to 'verified' on apply.
    return { disposition: 'done-verified', apply_action: 'mark-completed', audit_event: null }
  }
  // R1 emits no skip-proposed rows and no mode annotations (D11's content
  // half is R3) — everything else is a plain `run`.
  return { disposition: 'run', apply_action: 'none', audit_event: null }
}

export function buildAdoptionPlan(options: {
  projectRoot: string
  adoptResult: AdoptionResult
  includes?: string[]
}): { plan: AdoptionPlan; errors: ScaffoldError[] } {
  const { projectRoot, adoptResult } = options
  const includes = [...(options.includes ?? [])].sort()
  const methodology = adoptResult.methodology as MethodologyName
  const context = loadPipelineContext(projectRoot)

  // First-touch detection (D2): plan mode is read-only either way; a missing
  // config.yml is expected, so its CONFIG_MISSING error is not a plan error.
  const configExists = fs.existsSync(path.join(projectRoot, '.scaffold', 'config.yml'))
  const stateExists = fs.existsSync(path.join(projectRoot, '.scaffold', 'state.json'))
  const errors: ScaffoldError[] = configExists ? [...context.configErrors] : []

  const baseProject: Record<string, unknown> | null =
    adoptResult.projectType !== undefined && adoptResult.detectedConfig !== undefined
      ? { projectType: adoptResult.projectType, [TYPE_KEY[adoptResult.projectType]]: adoptResult.detectedConfig.config }
      : ((context.config?.project as Record<string, unknown> | undefined) ?? null)

  // --include is applied BEFORE resolution and keying (§6.1): includes become
  // custom.steps enablement overrides, so an accepted include re-resolves the
  // pipeline and changes the plan_key, forcing re-approval.
  const includeOverrides: Record<string, StepEnablementEntry> = Object.fromEntries(
    includes.map((slug) => [slug, { enabled: true }]),
  )
  const platforms: string[] = (context.config?.platforms as string[] | undefined) ?? ['claude-code']
  const planConfig = {
    ...(context.config ?? {}),
    version: 2,
    methodology,
    platforms,
    ...(baseProject !== null ? { project: baseProject } : {}),
    custom: { steps: { ...(context.config?.custom?.steps ?? {}), ...includeOverrides } },
  } as unknown as ScaffoldConfig

  // Resolve via preset + overlays like complete/reset do — this replaces the
  // unresolved 99-step superset scan (src/project/adopt.ts:139-159).
  const pipeline = resolvePipeline({ ...context, config: planConfig }, {})

  let state: PipelineState | null = null
  if (stateExists) {
    state = StateManager.loadStateReadOnly(
      projectRoot, new StatePathResolver(projectRoot), () => context.config ?? undefined,
    )
  }

  const records: StepPlanRecord[] = []
  const disabled: string[] = []
  // D10 (R3): steps whose verification already reads verified/declared-complete
  // are "satisfied" — never offered as a map-candidate target, matching
  // proposeMapCandidates' own contract (Task 8).
  const satisfiedSteps = new Set<string>()
  for (const [slug, mp] of context.metaPrompts.entries()) {
    if (mp.frontmatter.stateless) continue  // no completion state — nothing to adopt
    if (pipeline.overlay.steps[slug]?.enabled !== true) {
      if (!includes.includes(slug)) disabled.push(slug)
      continue
    }
    const entry = state?.steps[slug]
    const verification = verifyStep(
      slug, entry, mp.frontmatter.outputs ?? [], mp.frontmatter.detect ?? null, projectRoot,
      context.config?.artifact_map,
    )
    if (verification.verification === 'verified' || verification.verification === 'declared') {
      satisfiedSteps.add(slug)
    }
    const mapped = dispositionFor(verification)
    records.push({
      step_slug: slug,
      disposition: mapped.disposition,
      apply_action: mapped.apply_action,
      audit_event: mapped.audit_event,
      detect_checks: verification.detect.checks,
      outputs_present: verification.outputsPresent,
      outputs_missing: verification.outputsMissing,
    })
  }
  records.sort((a, b) => a.step_slug.localeCompare(b.step_slug))
  disabled.sort()

  // D10 (R3): propose artifact_map candidates for unsatisfied, unmapped steps.
  // A candidate outranks a plain `run` disposition but never overrides
  // done-verified/conflict/undetectable — those rows are left untouched. The
  // target flows into the record the plan_key hashes, so a different proposed
  // target forces re-approval.
  const mapCandidates = proposeMapCandidates({
    projectRoot,
    resolvedSteps: records.map((r) => r.step_slug),
    satisfiedSteps,
    existingMap: context.config?.artifact_map ?? {},
  })
  for (const candidate of mapCandidates) {
    const record = records.find((r) => r.step_slug === candidate.step)
    if (record !== undefined && record.disposition === 'run') {
      record.disposition = 'map-candidate'
      record.target = candidate.target
    }
  }

  // §6.1 (R3): annotate remaining `run` rows with the resolved assembly mode.
  // First-touch (state === null — the primary D2 brownfield entry has no
  // .scaffold/ yet): there is no per-step PipelineState to hand
  // resolveAssemblyMode (which requires a non-null state), so the mode is
  // derived from the plan's own init-mode instead — there is no per-step
  // history to consult on first touch anyway.
  for (const record of records) {
    if (record.disposition !== 'run') continue
    if (state === null) {
      record.mode = adoptResult.mode === 'brownfield' || adoptResult.mode === 'v1-migration'
        ? 'adoption' : 'fresh'
      continue
    }
    const { depth: currentDepth } = resolveDepth(record.step_slug, planConfig, pipeline.preset)
    const modeResult = resolveAssemblyMode({
      step: record.step_slug, state, currentDepth, projectRoot,
      artifactMap: context.config?.artifact_map,
    })
    record.mode = modeResult.mode
  }

  const initialize: InitializeRecord | null = stateExists ? null : {
    config: { version: 2, methodology, platforms, project: baseProject },
    state: {
      'init-mode': adoptResult.mode,
      methodology,
      steps: Object.fromEntries(records.map((r) => [
        r.step_slug, r.apply_action === 'mark-completed' ? 'completed' as const : 'pending' as const,
      ])),
    },
  }

  // Computed once per render and reused for both keying and rendering — the
  // preview shown to the user is guaranteed to be the exact input the key
  // covers (never recomputed between the two, which could observe a fs change
  // mid-render and desync the shown preview from the key).
  const opsActions = buildOpsActions(projectRoot)

  const plan_key = computePlanKey({
    initialize, includes, steps: records, disabled_by_preset: disabled, ops_actions: opsActions,
  })
  return {
    plan: {
      generated_at: new Date().toISOString(),
      project_root: projectRoot,
      mode: adoptResult.mode,
      methodology,
      includes,
      initialize,
      steps: records,
      disabled_by_preset: disabled,
      ops_actions: opsActions,
      plan_key,
    },
    errors,
  }
}

/** Human-readable disposition cell (§6.1): annotates map-candidate and run rows. */
function renderDisposition(record: StepPlanRecord): string {
  if (record.disposition === 'map-candidate' && record.target !== undefined) {
    return `map-candidate → ${record.target}   (accept: --apply writes artifact_map.${record.step_slug})`
  }
  if (record.disposition === 'run' && record.mode !== undefined) {
    return `run — ${record.mode} mode`
  }
  return record.disposition
}

export function renderPlanMarkdown(plan: AdoptionPlan): string {
  const lines: string[] = []
  lines.push('# Adoption Plan')
  lines.push('')
  lines.push(`- Mode: ${plan.mode}`)
  lines.push(`- Methodology preset: ${plan.methodology}`)
  lines.push(`- Generated: ${plan.generated_at}`)
  if (plan.includes.length > 0) lines.push(`- Includes: ${plan.includes.join(', ')}`)
  lines.push('')
  if (plan.initialize !== null) {
    lines.push('## Initialize (apply action)')
    lines.push('')
    lines.push(
      '`--apply` will write exactly this configuration — apply can never write config the plan did not show (D2):',
    )
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(plan.initialize, null, 2))
    lines.push('```')
    lines.push('')
  }
  lines.push('## Step dispositions')
  lines.push('')
  lines.push('| Step | Disposition | Apply action | Evidence |')
  lines.push('|---|---|---|---|')
  for (const record of plan.steps) {
    const evidence: string[] = []
    if (record.outputs_present.length > 0) evidence.push(`present: ${record.outputs_present.join(', ')}`)
    if (record.outputs_missing.length > 0) evidence.push(`missing: ${record.outputs_missing.join(', ')}`)
    for (const check of record.detect_checks) {
      evidence.push(`${check.kind} \`${check.target}\`: ${check.passed ? 'pass' : 'fail'}`)
    }
    lines.push(
      `| ${record.step_slug} | ${renderDisposition(record)} | ${record.apply_action} | ${evidence.join('; ') || '—'} |`,
    )
  }
  lines.push('')
  lines.push(...renderOpsActionsSection(plan.ops_actions))
  lines.push('')
  lines.push('## Disabled by preset (opt-in)')
  lines.push('')
  if (plan.disabled_by_preset.length === 0) {
    lines.push('(none)')
  } else {
    for (const slug of plan.disabled_by_preset) {
      lines.push(`- ${slug} — opt in with \`scaffold adopt --include ${slug}\``)
    }
  }
  lines.push('')
  lines.push(`Plan key: ${plan.plan_key}`)
  lines.push('')
  lines.push('## Next steps')
  lines.push('')
  lines.push('- Apply: `scaffold adopt --apply --plan docs/adoption-plan.md` (or `--plan-key <sha256>`)')
  lines.push('- Verify: `scaffold doctor`')
  lines.push('')
  return lines.join('\n')
}

/** Pull the approved plan_key out of a written plan document (markdown or JSON). */
export function extractPlanKey(content: string): string | null {
  const match = /(?:Plan key:|"plan_key":)\s*"?([0-9a-f]{64})\b/.exec(content)
  return match !== null ? match[1] : null
}
