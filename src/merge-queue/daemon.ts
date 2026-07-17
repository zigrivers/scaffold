// src/merge-queue/daemon.ts
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ulid } from 'ulid'
import { appendEvent, readJournal } from './journal.js'
import { TERMINAL_PR_STATES, queuedPrs, reduceState } from './state.js'
import { composeBatch, splitBatch } from './batch.js'
import {
  QUARANTINE_THRESHOLD, addToQuarantine, fileQuarantineBead, recentFlakeCount, recordFlake,
} from './flakes.js'
import type { GhClient, PrInfo } from './gh.js'
import type { GitOps } from './git.js'
import type { GateResult } from './gate.js'
import type { MergeQueueConfig, QueueState } from './types.js'

export interface DaemonDeps {
  gh: GhClient
  git: GitOps
  runGate: (opts: {
    cwd: string; command: string; timeoutMs: number; logPath: string
    env?: Record<string, string>
  }) => GateResult | Promise<GateResult>
  config: MergeQueueConfig
  mqDir: string
  projectRoot: string
  log: (msg: string) => void
  now: () => Date
}

export const PAUSED_FILE = 'PAUSED'

const IN_FLIGHT_BATCH_STATES = ['CONSTRUCTING', 'RUNNING', 'GREEN', 'LANDING', 'SPLITTING']

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

type BatchOutcome =
  | { kind: 'done' }
  | { kind: 'aborted' }
  | { kind: 'split'; batchId: string; left: number[]; right: number[] }

export class MergeQueueDaemon {
  constructor(private deps: DaemonDeps) {}

  /** Consecutive gh.viewPr failures per PR (spec: cap runaway retries). In-memory
   *  only — resets on daemon restart, which is fine since reconcile() re-derives
   *  ground truth from the journal/GitHub anyway. */
  private viewFailures = new Map<number, number>()

  private at(): string { return this.deps.now().toISOString() }
  private state(): QueueState { return reduceState(readJournal(this.deps.mqDir)) }

  paused(): string | null {
    const file = path.join(this.deps.mqDir, PAUSED_FILE)
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null
  }

  private pause(reason: string): void {
    fs.mkdirSync(this.deps.mqDir, { recursive: true })
    fs.writeFileSync(path.join(this.deps.mqDir, PAUSED_FILE), reason + '\n')
    this.deps.log(`PAUSED: ${reason}`)
  }

  async run(opts: { once?: boolean } = {}): Promise<void> {
    this.reconcile()
    for (;;) {
      let outcome: 'idle' | 'worked' = 'idle'
      try {
        outcome = await this.cycle()
      } catch (err) {
        this.deps.log(`cycle error: ${String(err)}`)
        try {
          this.reconcile()
        } catch (reconcileErr) {
          this.deps.log(`reconcile after error failed: ${String(reconcileErr)}`)
        }
      }
      if (opts.once) return
      if (outcome === 'idle') await sleep(this.deps.config.poll_seconds * 1000)
    }
  }

  async cycle(): Promise<'idle' | 'worked'> {
    const { gh, git, config, mqDir, log } = this.deps
    if (this.paused() !== null) { log('paused — skipping cycle'); return 'idle' }
    git.fetchOrigin()
    const base = git.defaultBranch()
    if (gh.postMergeRed(base)) {
      log(`post-merge red on ${base} — holding the queue`)
      return 'idle'
    }

    // Remote-agent seam (spec D10): absorb PRs labeled mq:ready. Only a fresh PR
    // or one that already landed cleanly gets re-enqueued — an EJECTED,
    // NEEDS_REBASE, or CANCELLED entry is a decision (human or daemon) that a
    // lingering label must not silently overturn.
    const pre = this.state()
    for (const pr of gh.listLabeled(config.ready_label)) {
      const existing = pre.entries.get(pr)
      if (!existing || existing.state === 'LANDED') {
        appendEvent(mqDir, { type: 'enqueued', pr, at: this.at() })
      }
    }

    const queued = queuedPrs(this.state())
    if (queued.length === 0) return 'idle'

    const infos = new Map<number, PrInfo>()
    for (const entry of queued) {
      let info: PrInfo
      try {
        info = gh.viewPr(entry.pr)
      } catch (err) {
        const failures = (this.viewFailures.get(entry.pr) ?? 0) + 1
        this.viewFailures.set(entry.pr, failures)
        log(`warn: cannot view PR #${entry.pr}: ${String(err)} (attempt ${failures})`)
        if (failures >= 5) {
          appendEvent(mqDir, {
            type: 'pr_state', pr: entry.pr, state: 'CANCELLED', at: this.at(),
            note: 'unviewable after 5 attempts — check the PR number and gh auth',
          })
          this.viewFailures.delete(entry.pr)
        }
        continue
      }
      this.viewFailures.delete(entry.pr)
      if (info.state !== 'OPEN') {
        appendEvent(mqDir, {
          type: 'pr_state', pr: entry.pr, state: 'CANCELLED', at: this.at(),
          note: `closed externally (${info.state})`,
        })
        continue
      }
      infos.set(entry.pr, info)
    }
    const eligible = queued.filter(e => infos.has(e.pr))
    if (eligible.length === 0) return 'idle'

    const members = composeBatch(eligible, infos, config.batch_cap)

    // Bisection stack — bors batch-then-bisect within the single lane. Halves
    // requeue AHEAD of new arrivals by construction (they run in this cycle).
    const stack: { members: number[]; parent?: string }[] = [{ members }]
    let batchRan = false
    while (stack.length > 0) {
      if (this.paused() !== null) {
        log('paused mid-cycle — stopping the bisection stack')
        break
      }
      const item = stack.shift()
      if (!item) break
      batchRan = true
      const outcome = await this.runBatch(item.members, item.parent, infos, base)
      if (outcome.kind === 'split') {
        stack.unshift({ members: outcome.right, parent: outcome.batchId })
        stack.unshift({ members: outcome.left, parent: outcome.batchId })
      } else if (outcome.kind === 'aborted') {
        break
      }
    }
    return batchRan ? 'worked' : 'idle'
  }

  private async runBatch(
    members: number[],
    parent: string | undefined,
    infos: Map<number, PrInfo>,
    base: string,
  ): Promise<BatchOutcome> {
    const { git, config, mqDir, log } = this.deps
    const batchId = ulid().toLowerCase()
    appendEvent(mqDir, { type: 'batch_created', batchId, members, parent, at: this.at() })
    for (const pr of members) {
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'IN_BATCH', batchId, at: this.at() })
    }

    const baseSha = git.originHeadSha(base)
    const prs = members.map(pr => {
      const info = infos.get(pr)
      if (!info) throw new Error(`no PrInfo for batched PR #${pr}`)
      return { pr, headSha: info.headSha }
    })
    const { ref, applied, rejected, alreadyApplied } = git.constructCandidate(batchId, prs, base)
    for (const pr of rejected) {
      this.eject(pr, batchId, 'NEEDS_REBASE',
        `does not apply cleanly onto origin/${base} — rebase and re-enqueue`)
    }
    for (const pr of alreadyApplied) {
      this.cancelAlreadyApplied(pr, batchId, base)
    }
    if (applied.length === 0) {
      appendEvent(mqDir, {
        type: 'batch_state', batchId, state: 'ABORTED', at: this.at(), note: 'no members applied',
      })
      git.deleteCandidate(batchId)
      return { kind: 'done' }
    }

    const candidateTree = git.treeOf(ref)
    appendEvent(mqDir, {
      type: 'batch_state', batchId, state: 'RUNNING', baseSha, candidateTree, at: this.at(),
    })
    for (const pr of applied) {
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'TESTING', batchId, at: this.at() })
    }

    let gate = await this.gateRun(batchId, base)
    appendEvent(mqDir, {
      type: 'gate_metrics', batchId, seconds: gate.seconds, result: gate.result, at: this.at(),
    })

    // Timeout → infra-vs-test disambiguation: retry the whole batch once (spec §5.3).
    if (gate.result === 'timeout') {
      log(`batch ${batchId}: gate timeout — retrying once`)
      gate = await this.gateRun(batchId, base)
      appendEvent(mqDir, {
        type: 'gate_metrics', batchId, seconds: gate.seconds, result: gate.result, at: this.at(),
      })
      if (gate.result === 'timeout') gate = { ...gate, result: 'red' }
    }

    // Flake protocol (spec D8): rerun failed test files once with identical config.
    if (gate.result === 'red' && gate.failedTests.length > 0) {
      for (const pr of applied) {
        appendEvent(mqDir, { type: 'pr_state', pr, state: 'FLAKE_RETRY', batchId, at: this.at() })
      }
      const retry = await this.gateRun(batchId, base, gate.failedTests)
      if (retry.result === 'green') {
        for (const testId of gate.failedTests) {
          recordFlake(mqDir, testId, this.at())
          const count = recentFlakeCount(this.state(), testId, this.deps.now())
          if (count >= QUARANTINE_THRESHOLD &&
              addToQuarantine(this.deps.projectRoot, config.quarantine_path, testId)) {
            fileQuarantineBead(this.deps.projectRoot, testId)
            log(`quarantined flaky test ${testId} (${count} events/7d)`)
          }
        }
        gate = retry
      }
    }

    // Base moved during the gate → candidate tested against a stale base (spec §5.2 step 6).
    git.fetchOrigin()
    if (git.originHeadSha(base) !== baseSha) {
      appendEvent(mqDir, {
        type: 'batch_state', batchId, state: 'ABORTED', at: this.at(), note: 'base moved during gate',
      })
      for (const pr of applied) {
        appendEvent(mqDir, {
          type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId, at: this.at(), note: 'base moved',
        })
      }
      git.deleteCandidate(batchId)
      return { kind: 'aborted' }
    }

    if (gate.result === 'green') {
      this.land(batchId, applied, base, candidateTree)
      git.deleteCandidate(batchId)
      return { kind: 'done' }
    }

    // Red. Singleton → eject; otherwise bisect.
    if (applied.length === 1) {
      appendEvent(mqDir, { type: 'batch_state', batchId, state: 'RED', at: this.at() })
      this.eject(applied[0], batchId, 'EJECTED', `gate failed — log: ${gate.logPath}`)
      git.deleteCandidate(batchId)
      return { kind: 'done' }
    }
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'SPLITTING', at: this.at() })
    for (const pr of applied) {
      appendEvent(mqDir, {
        type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId, at: this.at(),
        note: 'bisecting red batch',
      })
    }
    const [left, right] = splitBatch(applied)
    git.deleteCandidate(batchId)
    return { kind: 'split', batchId, left, right }
  }

  private async gateRun(batchId: string, base: string, retryTests?: string[]): Promise<GateResult> {
    const { git, config, runGate, mqDir } = this.deps
    const env: Record<string, string> = { MQ_AFFECTED_BASE: `origin/${base}` }
    if (retryTests) env.MQ_RETRY_TESTS = retryTests.join(',')
    return runGate({
      cwd: git.ensureGateWorktree(),
      command: config.gate_command,
      timeoutMs: config.gate_timeout_minutes * 60_000,
      logPath: path.join(mqDir, 'logs', `${batchId}${retryTests ? '-retry' : ''}.log`),
      env,
    })
  }

  private land(batchId: string, members: number[], base: string, candidateTree: string): void {
    const { gh, git, mqDir, log } = this.deps
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'GREEN', at: this.at() })
    for (const pr of members) {
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'PASSED', batchId, at: this.at() })
    }
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'LANDING', at: this.at() })
    const landed: number[] = []
    for (let i = 0; i < members.length; i++) {
      const pr = members[i]
      // Write-ahead: LANDING before the merge attempt; idempotent via mergedAt.
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'LANDING', batchId, at: this.at() })
      try {
        if (gh.viewPr(pr).mergedAt === null) gh.squashMerge(pr)
      } catch (err) {
        // Partial landing: what already merged is real and must not be re-tested
        // against a stale candidate (spec D9) — pause instead of running the NRS
        // check, and requeue everything that did not get a chance to merge.
        appendEvent(mqDir, {
          type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId, at: this.at(),
          note: 'merge failed mid-batch',
        })
        for (const rest of members.slice(i + 1)) {
          appendEvent(mqDir, {
            type: 'pr_state', pr: rest, state: 'REQUEUED_SPLIT', batchId, at: this.at(),
            note: 'batch landing aborted',
          })
        }
        this.pause(
          `partial landing in batch ${batchId}: ${landed.length}/${members.length} merged before ` +
          `"${String(err)}" — verify origin/${base} (post-merge suite), then rm .mq/PAUSED`,
        )
        appendEvent(mqDir, {
          type: 'batch_state', batchId, state: 'DONE', at: this.at(), note: 'partial land — paused',
        })
        return
      }
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'LANDED', batchId, at: this.at() })
      landed.push(pr)
      try {
        gh.comment(pr, `**merge-queue**: landed in batch ${batchId}`)
      } catch { /* comment is best-effort */ }
      this.closeBead(pr)
    }
    git.fetchOrigin()
    const landedTree = git.treeOf(`origin/${base}`)
    if (landedTree !== candidateTree) {
      // Not-Rocket-Science invariant (spec D9): what landed must be what was tested.
      this.pause(
        `NRS violation: origin/${base} tree ${landedTree} != tested candidate tree ` +
        `${candidateTree} (batch ${batchId}) — investigate before unpausing (rm .mq/PAUSED)`,
      )
      appendEvent(mqDir, {
        type: 'batch_state', batchId, state: 'DONE', at: this.at(), note: 'NRS MISMATCH — paused',
      })
      return
    }
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'DONE', at: this.at() })
    log(`batch ${batchId}: landed ${members.length} PR(s)`)
  }

  private eject(
    pr: number,
    batchId: string,
    state: 'EJECTED' | 'NEEDS_REBASE',
    reason: string,
  ): void {
    const { gh, mqDir, log } = this.deps
    appendEvent(mqDir, { type: 'pr_state', pr, state, batchId, at: this.at(), note: reason })
    try {
      gh.comment(pr, `**merge-queue**: ${state} — ${reason}`)
      this.reopenBead(pr)
    } catch (err) {
      log(`warn: could not comment/reopen for PR #${pr}: ${String(err)}`)
    }
  }

  /** A squash-merge that staged nothing means the diff is already on the base
   *  (spec: don't wedge the batch on a stale-but-already-landed PR). No
   *  queueFailures increment — this isn't a queue failure, it's a stale PR. */
  private cancelAlreadyApplied(pr: number, batchId: string, base: string): void {
    const { gh, mqDir, log } = this.deps
    const note = `diff already applied to origin/${base} — close the PR`
    appendEvent(mqDir, { type: 'pr_state', pr, state: 'CANCELLED', batchId, at: this.at(), note })
    try {
      gh.comment(pr, `**merge-queue**: ${note}`)
    } catch (err) {
      log(`warn: could not comment for PR #${pr}: ${String(err)}`)
    }
  }

  /** Bead feedback loop (spec §5.5): reopen the bead named by "Closes <id>" in the PR body. */
  private reopenBead(pr: number): void {
    this.beadCmd(pr, ['update', '{id}', '--status', 'open'])
  }

  /** Fire-and-forget contract (spec §5.5): the DAEMON closes the bead on land —
   *  the enqueueing agent moved on and never returns to verify the merge. */
  private closeBead(pr: number): void {
    this.beadCmd(pr, ['close', '{id}'])
  }

  private beadCmd(pr: number, argTemplate: string[]): void {
    let body = ''
    try {
      body = this.deps.gh.viewPr(pr).body
    } catch {
      return
    }
    const match = body.match(/Closes ([a-z][a-z0-9-]*-[a-z0-9]+)/i)
    if (!match) return
    try {
      execFileSync('bd', argTemplate.map(a => a === '{id}' ? match[1] : a), {
        cwd: this.deps.projectRoot, stdio: 'ignore',
      })
    } catch { /* bd absent — advisory only */ }
  }

  /** Startup recovery (spec §5.4): journal vs refs vs GitHub. */
  reconcile(): void {
    const { gh, git, mqDir, log } = this.deps
    const state = this.state()
    for (const batch of state.batches.values()) {
      if (!IN_FLIGHT_BATCH_STATES.includes(batch.state)) continue
      appendEvent(mqDir, {
        type: 'batch_state', batchId: batch.id, state: 'ABORTED', at: this.at(),
        note: 'daemon restart',
      })
      for (const pr of batch.members) {
        const entry = state.entries.get(pr)
        if (!entry || TERMINAL_PR_STATES.has(entry.state)) continue
        let mergedAt: string | null = null
        try {
          mergedAt = gh.viewPr(pr).mergedAt
        } catch { /* treat as unmerged */ }
        appendEvent(mqDir, mergedAt !== null
          ? {
            type: 'pr_state', pr, state: 'LANDED', batchId: batch.id, at: this.at(),
            note: 'recovered: merged before crash',
          }
          : {
            type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId: batch.id, at: this.at(),
            note: 'recovered: daemon restart',
          })
      }
    }
    // Sweep candidate refs that no longer belong to an active batch.
    const activeRefs = new Set(
      [...this.state().batches.values()]
        .filter(b => IN_FLIGHT_BATCH_STATES.includes(b.state))
        .map(b => b.candidateRef),
    )
    for (const ref of git.listCandidateRefs()) {
      if (!activeRefs.has(ref)) {
        git.deleteCandidate(ref.replace('refs/merge-queue/batch-', ''))
      }
    }
    log('reconcile complete')
  }
}
