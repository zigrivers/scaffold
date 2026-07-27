import fs from 'node:fs'
import path from 'node:path'
import { parseDocument, type Document } from 'yaml'
import { StateManager } from '../state/state-manager.js'
import { appendAuditRecord } from '../state/decision-logger.js'
import { atomicWriteFile } from '../utils/fs.js'
import { configParseError } from '../utils/errors.js'
import { loadPipelineContext } from '../core/pipeline/context.js'
import { resolvePipeline } from '../core/pipeline/resolver.js'
import { verifyStep } from '../state/completion.js'
import { runDoctor } from '../doctor/run.js'
import { TYPE_KEY } from './adopt.js'
import type { AdoptionPlan, InitializeRecord } from './adoption-plan.js'
import type { DoctorReport } from '../doctor/types.js'
import type { DepthLevel, StepStateEntry, VerificationAuditRecord } from '../types/index.js'

export interface ApplyResult {
  initialized: boolean
  marked_completed: string[]
  reopened: string[]
  recorded_pending: string[]
  audit_records: number
  /** D10a: honest-re-verification warnings — a mapped step whose detect:
   *  contract (or outputs) still didn't pass after the mapping was written.
   *  The step is left pending, never falsely completed/verified. */
  warnings: string[]
  doctor: DoctorReport
}

const ACTOR = 'scaffold-adopt'

/**
 * Write exactly the config.yml payload the approved plan rendered (D2).
 * Preserves unrelated keys of an existing config.yml; clears stale typed-config
 * blocks when the project type changed.
 */
export function writeInitializeConfig(projectRoot: string, initialize: InitializeRecord): void {
  const configPath = path.join(projectRoot, '.scaffold', 'config.yml')
  let doc: Document
  if (fs.existsSync(configPath)) {
    doc = parseDocument(fs.readFileSync(configPath, 'utf8'))
    // Without this, a malformed config.yml still fails — but as the yaml
    // library's opaque "Document with errors cannot be stringified", thrown
    // from doc.toString() below with no error code and no recovery hint. Check
    // here so the failure names the file and tells the user what to fix.
    if (doc.errors.length > 0) {
      throw configParseError(configPath, doc.errors[0].message)
    }
  } else {
    doc = parseDocument('# scaffold config — created by scaffold adopt --apply\n')
  }
  doc.set('version', 2)
  doc.set('methodology', initialize.config.methodology)
  doc.set('platforms', doc.createNode(initialize.config.platforms))
  const project = initialize.config.project
  if (project !== null) {
    doc.set('project', doc.createNode(project))
    const projectType = (project as { projectType?: string }).projectType
    for (const [type, key] of Object.entries(TYPE_KEY)) {
      if (type !== projectType && doc.hasIn(['project', key])) {
        doc.deleteIn(['project', key])
      }
    }
  }
  fs.mkdirSync(path.join(projectRoot, '.scaffold'), { recursive: true })
  // Use the codebase-wide atomic writer (src/utils/fs.ts) — temp-file-then-rename
  // in one place, so a crash mid-write can never leave a truncated config.yml.
  atomicWriteFile(configPath, doc.toString())
}

/**
 * D10a apply: persist approved map-candidate dispositions into
 * .scaffold/config.yml `artifact_map`. AST edit (comments and existing
 * content preserved), atomic write. Callers must only pass mappings the
 * approved plan showed (plan_key enforcement happens in the apply driver,
 * i.e. the CLI layer's re-render-and-compare before applyAdoptionPlan is
 * ever invoked). Writing the mapping is a durable curation decision on its
 * own — it does not imply the step verifies; that is a separate, honest
 * re-verification (see applyAdoptionPlan below).
 */
export function applyArtifactMappings(
  projectRoot: string,
  mappings: ReadonlyArray<{ step: string; target: string }>,
): void {
  if (mappings.length === 0) return
  const configPath = path.join(projectRoot, '.scaffold', 'config.yml')
  const doc = parseDocument(fs.readFileSync(configPath, 'utf8'))
  if (doc.errors.length > 0) {
    throw configParseError(configPath, doc.errors[0].message)
  }
  for (const { step, target } of mappings) {
    doc.setIn(['artifact_map', step], target)
  }
  atomicWriteFile(configPath, doc.toString())
}

/**
 * Execute an approved Adoption Plan (D1/D2/D3). The caller has already
 * re-rendered against live reality and verified the plan_key — this function
 * only performs the writes the plan's apply-action records describe, then
 * closes with a doctor pass (Terraform's "done = clean plan" criterion).
 */
export async function applyAdoptionPlan(options: {
  projectRoot: string
  plan: AdoptionPlan
  scaffoldVersion: string
}): Promise<ApplyResult> {
  const { projectRoot, plan } = options

  // Write the approved config FIRST so the pipeline resolves against the final
  // methodology + project-type (brownfield preset + overlays), THEN build the
  // StateManager with the REAL eligibility + config callbacks and the pipeline
  // graph hash. A placeholder `() => []` would persist an empty `next_eligible`
  // that raw-cache readers (the dashboard reads state.next_eligible directly)
  // trust verbatim — so `scaffold` would report no work even with eligible
  // pending steps. This mirrors how `next`/`status`/`complete` build the manager.
  let initialized = false
  if (plan.initialize !== null) {
    writeInitializeConfig(projectRoot, plan.initialize)
    initialized = true
  }

  // D10a: persist approved map-candidate dispositions BEFORE loading pipeline
  // context, so the honest re-verification below (and config resolution in
  // general) observes the final artifact_map. applyArtifactMappings no-ops on
  // an empty list, so this is safe to call unconditionally.
  const mapCandidates = plan.steps.filter(
    (record): record is AdoptionPlan['steps'][number] & { target: string } =>
      record.disposition === 'map-candidate' && record.target !== undefined,
  )
  applyArtifactMappings(projectRoot, mapCandidates.map((r) => ({ step: r.step_slug, target: r.target })))

  const context = loadPipelineContext(projectRoot)
  const pipeline = resolvePipeline(context)
  const producesFor = (slug: string): string[] =>
    [...(context.metaPrompts.get(slug)?.frontmatter.outputs ?? [])]

  const stateManager = new StateManager(
    projectRoot,
    pipeline.computeEligible,
    () => context.config ?? undefined,
    undefined,
    pipeline.globalSteps,
    pipeline.getPipelineHash('global'),
  )
  if (initialized) {
    stateManager.initializeState({
      enabledSteps: plan.steps.map((record) => ({
        slug: record.step_slug,
        produces: producesFor(record.step_slug),
      })),
      scaffoldVersion: options.scaffoldVersion,
      methodology: plan.methodology,
      initMode: plan.mode,
    })
  }

  const state = stateManager.loadState()
  const now = new Date().toISOString()
  // Completed steps must carry a depth (StepStateEntry types it "only when
  // completed" and state validation expects it on a completed entry). Adoption
  // marks a pre-existing completion whose original depth we can't recover, so
  // preserve the entry's own depth when present, else fall back to the
  // methodology's default depth (mvp=1, deep=5, else 3 — the wizard's mapping).
  const defaultDepth: DepthLevel =
    plan.methodology === 'mvp' ? 1 : plan.methodology === 'deep' ? 5 : 3
  const marked: string[] = []
  const reopened: string[] = []
  const recorded: string[] = []
  let auditCount = 0

  const auditFor = (
    record: AdoptionPlan['steps'][number],
    entry: StepStateEntry | undefined,
    event: 'verification-reversal' | 'partial-artifacts',
    reason: string,
  ): VerificationAuditRecord => ({
    ts: now,
    actor: ACTOR,
    event,
    step_slug: record.step_slug,
    from_status: entry?.status ?? null,
    from_verification: entry?.verification ?? null,
    to_status: 'pending',
    to_verification: 'unverified',
    evidence: {
      outputs_present: record.outputs_present,
      outputs_missing: record.outputs_missing,
      detect_checks: record.detect_checks,
    },
    reason,
    plan_key: plan.plan_key,
  })

  for (const record of plan.steps) {
    const entry = state.steps[record.step_slug]
    if (record.apply_action === 'mark-completed') {
      const next: StepStateEntry = {
        ...(entry ?? { status: 'pending', source: 'pipeline' }),
        status: 'completed',
        at: now,
        completed_by: ACTOR,
        produces: producesFor(record.step_slug),
        verification: 'verified',
        depth: entry?.depth ?? defaultDepth,
      }
      if (next.completed_at === undefined) next.completed_at = now
      state.steps[record.step_slug] = next
      marked.push(record.step_slug)
    } else if (record.apply_action === 'reopen-pending') {
      appendAuditRecord(projectRoot, auditFor(record, entry, 'verification-reversal',
        `state claimed completed (completed_by=${entry?.completed_by ?? 'unknown'}, `
        + `at=${entry?.at ?? 'unknown'}) but D3 verification failed`))
      auditCount++
      state.steps[record.step_slug] = {
        ...(entry ?? { source: 'pipeline' }),
        // Refresh produces from the CURRENT resolved contract (consistent with
        // mark-completed/record-pending) — a reopened step must not keep a stale
        // historical produces list.
        produces: producesFor(record.step_slug),
        status: 'pending',
        verification: 'unverified',
      } as StepStateEntry
      reopened.push(record.step_slug)
    } else if (record.apply_action === 'record-pending') {
      appendAuditRecord(projectRoot, auditFor(record, entry, 'partial-artifacts',
        `partial artifacts found on disk with no completion claim: ${record.outputs_present.join(', ')}`))
      auditCount++
      state.steps[record.step_slug] = {
        ...(entry ?? { source: 'pipeline' }),
        status: 'pending',
        produces: producesFor(record.step_slug),
        verification: 'unverified',
      } as StepStateEntry
      recorded.push(record.step_slug)
    }
    // apply_action 'none': nothing to write
  }

  // D10a: honest re-verification. Applying a mapping NEVER blindly marks a
  // step complete — only a real verifyStep pass (detect: contract included,
  // against context.config?.artifact_map which now includes the write above)
  // promotes the step to completed/verified. Anything else is left exactly as
  // initialized/loaded (pending, unverified) and surfaces a warning instead —
  // e.g. the mapped file satisfies outputs but the step's own detect: check
  // still targets its canonical (unmapped) path, or the file vanished between
  // plan and apply.
  const mapWarnings: string[] = []
  for (const record of mapCandidates) {
    const mp = context.metaPrompts.get(record.step_slug)
    const entry = state.steps[record.step_slug]
    const verification = verifyStep(
      record.step_slug, entry, mp?.frontmatter.outputs ?? [], mp?.frontmatter.detect ?? null,
      projectRoot, context.config?.artifact_map,
    )
    if (verification.verification === 'verified') {
      const next: StepStateEntry = {
        ...(entry ?? { status: 'pending', source: 'pipeline' }),
        status: 'completed',
        at: now,
        completed_by: ACTOR,
        produces: producesFor(record.step_slug),
        verification: 'verified',
        depth: entry?.depth ?? defaultDepth,
      }
      if (next.completed_at === undefined) next.completed_at = now
      state.steps[record.step_slug] = next
      marked.push(record.step_slug)
    } else {
      const failedDetect = verification.detect.checks
        .filter((check) => !check.passed)
        .map((check) => `${check.kind}:${check.target}`)
      mapWarnings.push(
        `artifact_map.${record.step_slug} -> ${record.target} did not satisfy verification `
        + `(missing: ${verification.outputsMissing.join(', ') || 'none'}`
        + (failedDetect.length > 0 ? `; failed detect: ${failedDetect.join(', ')}` : '')
        + ') — step left pending.',
      )
    }
  }

  stateManager.saveState(state)
  const doctor = runDoctor(projectRoot)
  return {
    initialized,
    marked_completed: marked,
    reopened,
    recorded_pending: recorded,
    audit_records: auditCount,
    warnings: mapWarnings,
    doctor,
  }
}
