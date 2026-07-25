import path from 'node:path'
import { appendEvent, readJournal } from './journal.js'
import type { GhClient } from './gh.js'
import type { GitOps } from './git.js'
import type { GateResult } from './gate.js'
import type { JournalEvent, MergeQueueConfig } from './types.js'

export type BootstrapStage = 'intent' | 'merged' | 'armed'

export interface BootstrapAttempt {
  bootstrapId: string
  pr: number
  gatedHeadSha: string
  mergeCommitSha: string | null
  stage: BootstrapStage
  /** Timestamp of the id's latest journaled event. */
  at: string
}

/** Fold the journal into per-id bootstrap attempts (D9). Events for an id
 *  arrive strictly intent → merged → armed; later stages win. An id with only
 *  an intent is either in-flight or aborted — planResume decides which via
 *  GitHub's authoritative PR state, never the journal alone. */
export function reduceBootstrapAttempts(events: JournalEvent[]): Map<string, BootstrapAttempt> {
  const attempts = new Map<string, BootstrapAttempt>()
  for (const e of events) {
    if (e.type !== 'bootstrap_intent' && e.type !== 'bootstrap_merged' && e.type !== 'bootstrap_armed') {
      continue
    }
    const base: BootstrapAttempt = attempts.get(e.bootstrapId) ?? {
      bootstrapId: e.bootstrapId, pr: e.pr, gatedHeadSha: e.gatedHeadSha,
      mergeCommitSha: null, stage: 'intent', at: e.at,
    }
    if (e.type === 'bootstrap_merged') {
      if (base.stage !== 'armed') base.stage = 'merged'
      base.mergeCommitSha = e.mergeCommitSha
    } else if (e.type === 'bootstrap_armed') {
      base.stage = 'armed'
    }
    base.at = e.at
    attempts.set(e.bootstrapId, base)
  }
  return attempts
}

/** Latest attempt for a PR — ULIDs sort lexicographically in creation order,
 *  so the max bootstrapId is the newest attempt. */
export function latestAttemptFor(events: JournalEvent[], pr: number): BootstrapAttempt | null {
  const forPr = [...reduceBootstrapAttempts(events).values()].filter(a => a.pr === pr)
  if (forPr.length === 0) return null
  forPr.sort((a, b) => (a.bootstrapId < b.bootstrapId ? -1 : 1))
  return forPr[forPr.length - 1]
}

export type ResumeDecision =
  | { kind: 'fresh' }
  | { kind: 'complete'; attempt: BootstrapAttempt }
  | { kind: 'arm-and-verify'; attempt: BootstrapAttempt }
  | { kind: 'record-merge-then-arm'; attempt: BootstrapAttempt }
  | { kind: 'rerun-merge'; attempt: BootstrapAttempt }
  | { kind: 'aborted'; attempt: BootstrapAttempt; reason: string }

/** Reconcile the journaled attempt against GitHub's AUTHORITATIVE PR state
 *  (D9): intent-without-merged while GitHub says MERGED is the crash window
 *  between the merge API call and the journal write — record retroactively,
 *  never re-merge. An aborted attempt is terminal for its id. */
export function planResume(
  attempt: BootstrapAttempt | null,
  gh: { state: 'OPEN' | 'MERGED' | 'CLOSED'; headSha: string },
): ResumeDecision {
  if (attempt === null) return { kind: 'fresh' }
  if (attempt.stage === 'armed') return { kind: 'complete', attempt }
  if (attempt.stage === 'merged') return { kind: 'arm-and-verify', attempt }
  // stage === 'intent': did the crash hit the merge-API/journal window?
  if (gh.state === 'MERGED') return { kind: 'record-merge-then-arm', attempt }
  if (gh.state === 'CLOSED') {
    return {
      kind: 'aborted', attempt,
      reason: `PR #${attempt.pr} was closed without merging — attempt ${attempt.bootstrapId} `
        + 'is terminal; reopen the PR and re-run scaffold mq bootstrap',
    }
  }
  if (gh.headSha !== attempt.gatedHeadSha) {
    return {
      kind: 'aborted', attempt,
      reason: `PR head moved (gated ${attempt.gatedHeadSha}, now ${gh.headSha}) — the gate no longer `
        + `covers this head; attempt ${attempt.bootstrapId} is terminal, re-run scaffold mq bootstrap `
        + `--pr ${attempt.pr} for a fresh gated attempt`,
    }
  }
  return { kind: 'rerun-merge', attempt }
}

export interface BootstrapDeps {
  gh: GhClient
  git: GitOps
  runGate: (opts: {
    cwd: string; command: string; timeoutMs: number; logPath: string
    env?: Record<string, string>; pidFile?: string
  }) => GateResult | Promise<GateResult>
  /** Config loaded from PRIMARY (defaults on a first install) — used by resume
   *  paths, where the PR has already merged its config to primary. */
  config: MergeQueueConfig
  mqDir: string
  projectRoot: string
  /** D9: read the merge-queue config the PR *installs*, from the GATED PR tree
   *  (the checkoutDetachedInGate checkout). Omitted in pure-engine tests — the
   *  engine then falls back to `config`. */
  readMergeConfig?: (gatedTree: string) => MergeQueueConfig
  /** D9: verify the PR's committed queue assets (config, guard, poller, hook
   *  registration) exist in the GATED PR tree — they must ride the merge to
   *  primary, not be uncommitted post-gate mutations. Omitted in pure-engine
   *  tests — the engine then treats assets as present. */
  verifyGatedAssets?: (gatedTree: string, cfg: MergeQueueConfig) => { ok: boolean; missing: string[] }
  /** D8 primitive (idempotent) — arm the Claude Code hooks (self-gating at
   *  runtime, so registering pre-merge is safe). */
  armHooks: () => { messages: string[] }
  /** D6 primitive — arm the scheduler. Called POST-merge (the poller script
   *  lives at <primary>/scripts/ops/, present only once the PR lands), so it
   *  self-decides on the now-merged executor and no-ops for non-local-poller. */
  armSched: () => { ok: boolean; messages: string[] }
  /** Post-merge daemon smoke (`mq daemon --once`). */
  smokeDaemon: () => { ok: boolean; detail: string }
  /** Closing doctor pass (advisory) — null when the doctor CLI is unavailable. */
  runDoctor: (() => { exitCode: number; summary: string }) | null
  /** Does `command` resolve in `root`? Resolved against the GATED PR tree in
   *  preflight (the PR's gate scripts are not yet at primary). */
  gateTargetResolves: (root: string, command: string) => boolean
  log: (msg: string) => void
  now: () => Date
  /** Bounded-backoff sleep between merge-SHA lookups. Injected so tests run
   *  instantly; defaults to real setTimeout when omitted. */
  sleep?: (ms: number) => Promise<void>
  /** ULID seam. */
  newId: () => string
}

export interface BootstrapOutcome {
  ok: boolean
  bootstrapId: string | null
  stage: 'preflight' | 'arm' | 'merge' | 'verify' | 'complete' | 'aborted'
  messages: string[]
}

/** D9: arm-first guided first merge. Order — preflight (verify the PR's
 *  committed queue assets + gate targets + full gate, all against the GATED PR
 *  tree, since the first queue-installing PR's assets are not yet at primary) →
 *  arm hooks pre-merge (self-gating, safe) → journaled squash-merge with head
 *  revalidation → POST-merge arm scheduler (buildPostMergePollerJob(primary)
 *  now resolves) + daemon smoke + doctor → bootstrap_armed. A crash anywhere
 *  resumes via planResume with GitHub authoritative. */
export async function runBootstrap(
  deps: BootstrapDeps,
  opts: { pr: number; finish?: boolean },
): Promise<BootstrapOutcome> {
  const messages: string[] = []
  const say = (m: string): void => {
    messages.push(m)
    deps.log(m)
  }
  const at = (): string => deps.now().toISOString()
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  // D9 pins bootstrap_merged.mergeCommitSha as a REQUIRED non-empty string, but
  // GitHub is eventually consistent about exposing the merge commit. Poll with
  // bounded backoff; return null (NEVER an empty SHA) if it is still unavailable
  // so callers stop and let resume reconcile — the journal is never advanced
  // with an empty SHA.
  const resolveMergeSha = async (): Promise<string | null> => {
    for (const delayMs of [0, 500, 1000, 2000, 4000]) {
      if (delayMs > 0) await sleep(delayMs)
      const sha = deps.gh.mergeCommitSha(opts.pr)
      if (sha !== null && sha !== '') return sha
    }
    return null
  }

  const info = deps.gh.viewPr(opts.pr)
  const attempt = latestAttemptFor(readJournal(deps.mqDir), opts.pr)
  const decision = planResume(attempt, { state: info.state, headSha: info.headSha })

  // Arm hooks ONLY (pre-merge safe — the guard self-gates at runtime and the
  // committed .claude/settings.json rides the merge). The scheduler is armed
  // POST-merge in verifyAndArm, where the poller script exists at primary.
  const arm = (): boolean => {
    for (const m of deps.armHooks().messages) say(m)
    return true
  }

  const verifyAndArm = (a: { bootstrapId: string; gatedHeadSha: string }, mergeSha: string): BootstrapOutcome => {
    // POST-merge: bring the primary worktree up to the merge commit FIRST —
    // `gh pr merge` moved only the remote, so the poller script/config land
    // locally only now. THEN arm the scheduler: buildPostMergePollerJob(primary)
    // resolves because the PR's poller script has landed at primary. The arm
    // closure self-decides on the merged executor (no-ops for non-local-poller).
    deps.git.syncPrimaryToMerge(mergeSha)
    const sched = deps.armSched()
    for (const m of sched.messages) say(m)
    if (!sched.ok) {
      say(
        'bootstrap: the merge is recorded but the scheduler is NOT armed — fix it, ' +
        `then finish with: scaffold mq bootstrap --pr ${opts.pr} --finish`,
      )
      return { ok: false, bootstrapId: a.bootstrapId, stage: 'arm', messages }
    }
    const smoke = deps.smokeDaemon()
    say(`daemon smoke: ${smoke.detail}`)
    if (!smoke.ok) {
      say(
        'bootstrap: the merge is recorded but the queue is NOT verified — finish ' +
        `with: scaffold mq bootstrap --pr ${opts.pr} --finish`,
      )
      return { ok: false, bootstrapId: a.bootstrapId, stage: 'verify', messages }
    }
    appendEvent(deps.mqDir, {
      type: 'bootstrap_armed', bootstrapId: a.bootstrapId, pr: opts.pr,
      gatedHeadSha: a.gatedHeadSha, at: at(),
    })
    if (deps.runDoctor !== null) {
      const d = deps.runDoctor()
      say(`closing doctor pass: ${d.summary} (exit ${d.exitCode})`)
    } else {
      say('closing doctor pass unavailable — run: scaffold doctor')
    }
    say('bootstrap complete — the queue is armed; from now on: scaffold mq enqueue --pr <N>')
    return { ok: true, bootstrapId: a.bootstrapId, stage: 'complete', messages }
  }

  const recordMerged = (a: { bootstrapId: string; gatedHeadSha: string }, mergeSha: string): void => {
    appendEvent(deps.mqDir, {
      type: 'bootstrap_merged', bootstrapId: a.bootstrapId, pr: opts.pr,
      gatedHeadSha: a.gatedHeadSha, mergeCommitSha: mergeSha, at: at(),
    })
  }

  const finalizeMerge = async (a: { bootstrapId: string; gatedHeadSha: string }): Promise<BootstrapOutcome> => {
    const mergeSha = await resolveMergeSha()
    if (mergeSha === null) {
      // The merge is done on GitHub and bootstrap_intent is journaled, so do NOT
      // advance the journal with an empty SHA. Stop at the merge-verification
      // stage; resume reconciles once GitHub exposes the commit (planResume:
      // intent-without-merged + GitHub MERGED ⇒ record-merge-then-arm).
      say(
        `bootstrap: PR #${opts.pr} is merged, but GitHub has not exposed the merge ` +
        'commit SHA yet — the journal is NOT advanced; reconcile with: scaffold mq ' +
        `bootstrap --pr ${opts.pr} --finish`,
      )
      return { ok: false, bootstrapId: a.bootstrapId, stage: 'merge', messages }
    }
    recordMerged(a, mergeSha)
    say(`merged PR #${opts.pr} (bootstrap ${a.bootstrapId}, merge commit ${mergeSha})`)
    return verifyAndArm(a, mergeSha)
  }

  const mergeAndFinish = async (a: { bootstrapId: string; gatedHeadSha: string }): Promise<BootstrapOutcome> => {
    // Revalidate IMMEDIATELY before merging: never merge an ungated head (D9).
    const fresh = deps.gh.viewPr(opts.pr)
    if (fresh.state === 'MERGED') {
      say(`PR #${opts.pr} is already MERGED on GitHub — recording, never re-merging`)
      return finalizeMerge(a)
    }
    if (fresh.state === 'CLOSED') {
      say(`bootstrap ABORTED: PR #${opts.pr} was closed — attempt ${a.bootstrapId} is terminal`)
      return { ok: false, bootstrapId: a.bootstrapId, stage: 'aborted', messages }
    }
    if (fresh.headSha !== a.gatedHeadSha) {
      say(
        `bootstrap ABORTED: PR head moved (gated ${a.gatedHeadSha}, now ${fresh.headSha}) — ` +
        `attempt ${a.bootstrapId} is terminal; re-run scaffold mq bootstrap --pr ${opts.pr} ` +
        'for a fresh gated attempt',
      )
      return { ok: false, bootstrapId: a.bootstrapId, stage: 'aborted', messages }
    }
    deps.gh.squashMerge(opts.pr, a.gatedHeadSha)
    return finalizeMerge(a)
  }

  switch (decision.kind) {
  case 'complete':
    say(`bootstrap ${decision.attempt.bootstrapId} already completed (armed) — nothing to do`)
    return { ok: true, bootstrapId: decision.attempt.bootstrapId, stage: 'complete', messages }
  case 'arm-and-verify': {
    say(`resuming bootstrap ${decision.attempt.bootstrapId}: merge already journaled — re-arming idempotently`)
    if (!arm()) return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'arm', messages }
    // stage 'merged' always journaled a non-empty SHA (D9 invariant), but the
    // reduced type is `string | null` — narrow it explicitly before arming.
    const mergedSha = decision.attempt.mergeCommitSha
    if (mergedSha === null) {
      say(
        `bootstrap: attempt ${decision.attempt.bootstrapId} is at the merged stage without ` +
        `a merge SHA — cannot arm; finish with: scaffold mq bootstrap --pr ${opts.pr} --finish`,
      )
      return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'merge', messages }
    }
    return verifyAndArm(decision.attempt, mergedSha)
  }
  case 'record-merge-then-arm': {
    // Crash window: the merge API call succeeded, the journal write did not.
    const recovered = await resolveMergeSha()
    if (recovered === null) {
      // Never journal bootstrap_merged with an empty SHA — stop and let a later
      // resume record it once GitHub exposes the merge commit.
      say(
        `crash-window reconciliation: GitHub reports PR #${opts.pr} MERGED but has not ` +
        'exposed the merge commit SHA yet — the journal is NOT advanced; retry: scaffold mq ' +
        `bootstrap --pr ${opts.pr} --finish`,
      )
      return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'merge', messages }
    }
    recordMerged(decision.attempt, recovered)
    say(
      `crash-window reconciliation: GitHub reports PR #${opts.pr} MERGED — merge recorded ` +
      'retroactively (never re-merged)',
    )
    if (!arm()) return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'arm', messages }
    return verifyAndArm(decision.attempt, recovered)
  }
  case 'rerun-merge':
    say(`resuming bootstrap ${decision.attempt.bootstrapId}: intent journaled, merge not — re-running the merge stage`)
    if (!arm()) return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'arm', messages }
    return mergeAndFinish(decision.attempt)
  case 'aborted':
    if (opts.finish === true) {
      say(decision.reason)
      return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'aborted', messages }
    }
    say(`prior attempt ${decision.attempt.bootstrapId} is terminal — starting a fresh attempt (${decision.reason})`)
    break
  case 'fresh':
    if (opts.finish === true) {
      say(`mq bootstrap --finish: no unfinished bootstrap attempt for PR #${opts.pr}`)
      return { ok: false, bootstrapId: null, stage: 'preflight', messages }
    }
    break
  }

  // ---- fresh attempt: preflight --------------------------------------------
  if (info.state !== 'OPEN') {
    say(`bootstrap preflight: PR #${opts.pr} is ${info.state}, not OPEN`)
    return { ok: false, bootstrapId: null, stage: 'preflight', messages }
  }
  // Check out the gated PR tree FIRST: the first queue-installing PR's assets
  // (config, guard, poller, gate scripts, hook registration) live in the PR,
  // NOT at primary — primary receives them only at merge. Everything below
  // verifies + reads from the gated tree; the journal stays at primary.
  const gatedHeadSha = info.headSha
  deps.git.fetchOrigin()
  const gatedTree = deps.git.checkoutDetachedInGate(gatedHeadSha)
  const cfg = deps.readMergeConfig ? deps.readMergeConfig(gatedTree) : deps.config
  const assets = deps.verifyGatedAssets
    ? deps.verifyGatedAssets(gatedTree, cfg)
    : { ok: true, missing: [] as string[] }
  if (!assets.ok) {
    say(
      `bootstrap preflight: PR #${opts.pr} does not install the queue — the gated tree ` +
      `is missing committed asset(s): ${assets.missing.join(', ')}. The bootstrap PR must ` +
      'COMMIT the merge-queue config, guard, poller, and hook registration (scaffold ' +
      'agent-ops install --component merge-queue + scaffold hooks install, committed in ' +
      `the PR) so they land at merge; fix the PR, then re-run scaffold mq bootstrap --pr ${opts.pr}`,
    )
    return { ok: false, bootstrapId: null, stage: 'preflight', messages }
  }
  for (const command of [cfg.gate_command, cfg.full_gate_command]) {
    if (!deps.gateTargetResolves(gatedTree, command)) {
      say(
        `bootstrap preflight: gate command "${command}" does not resolve in the gated ` +
        'tree — the PR must install the gate component: scaffold agent-ops install ' +
        '--component gate',
      )
      return { ok: false, bootstrapId: null, stage: 'preflight', messages }
    }
  }
  say(`preflight: running the FULL gate on PR head ${gatedHeadSha} (${cfg.full_gate_command})`)
  const gate = await deps.runGate({
    cwd: gatedTree,
    command: cfg.full_gate_command,
    timeoutMs: cfg.gate_timeout_minutes * 60_000,
    logPath: path.join(deps.mqDir, 'logs', `bootstrap-${opts.pr}.log`),
  })
  if (gate.result !== 'green') {
    say(`bootstrap preflight: full gate ${gate.result} after ${gate.seconds}s — see ${gate.logPath}`)
    return { ok: false, bootstrapId: null, stage: 'preflight', messages }
  }
  say(`preflight: full gate green in ${gate.seconds}s`)

  // ---- arm-first: hooks only (the scheduler is armed post-merge, D9) --------
  if (!arm()) return { ok: false, bootstrapId: null, stage: 'arm', messages }

  // ---- merge under bootstrap semantics -------------------------------------
  const bootstrapId = deps.newId()
  appendEvent(deps.mqDir, {
    type: 'bootstrap_intent', bootstrapId, pr: opts.pr, gatedHeadSha, at: at(),
  })
  return mergeAndFinish({ bootstrapId, gatedHeadSha })
}
