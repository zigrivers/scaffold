// src/merge-queue/daemon.ts
import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ulid } from 'ulid'
import { appendEvent, readJournal } from './journal.js'
import { TERMINAL_PR_STATES, beadSyncKey, queuedPrs, reduceState } from './state.js'
import { composeBatch, splitBatch, touchesOverlapZone } from './batch.js'
import {
  QUARANTINE_THRESHOLD, addToQuarantine, fileQuarantineBead, recentFlakeCount, recordFlake,
} from './flakes.js'
import {
  affectedGateKey, fullGateKey, hashFileOrAbsent, lookupGateCache, recordGateCache,
} from './gate-cache.js'
import type { GhClient, PrInfo } from './gh.js'
import type { GitOps } from './git.js'
import type { GateResult } from './gate.js'
import { tiaMapPath } from '../tia/map.js'
import type {
  BatchRecord, BeadSyncRecord, MergeQueueConfig, PrEntry, PrState, QueueState,
} from './types.js'
import { waitForWake } from './wake.js'

export interface DaemonDeps {
  gh: GhClient
  git: GitOps
  runGate: (opts: {
    cwd: string; command: string; timeoutMs: number; logPath: string
    env?: Record<string, string>; pidFile?: string
  }) => GateResult | Promise<GateResult>
  config: MergeQueueConfig
  mqDir: string
  projectRoot: string
  log: (msg: string) => void
  now: () => Date
  /** D15 seam: wait for a journal append or the poll timeout while idle.
   *  Production default is waitForWake (fs.watch + debounce). */
  wake?: (mqDir: string, timeoutMs: number) => Promise<'journal' | 'timeout'>
  /** D15: fire ONE post-merge poller pass right after a landing (main just
   *  moved). Best-effort; the scheduler remains the cross-machine safety net. */
  triggerPoller?: () => void
  /** Test seam for Beads feedback commands. Production defaults to `bd`. */
  runBeadCommand?: (args: string[], cwd: string) => Promise<void>
}

export const PAUSED_FILE = 'PAUSED'
export const GATE_PID_FILE = 'gate.pid'

const IN_FLIGHT_BATCH_STATES = ['CONSTRUCTING', 'RUNNING', 'GREEN', 'LANDING', 'SPLITTING']

/** D13: an entry's changed-file set, or null when unknown (never fetched, or the
 *  last fetch failed) — an unknown set conservatively conflicts with everything. */
function knownFiles(e: PrEntry): string[] | null {
  return e.filesHeadSha !== undefined ? e.files ?? [] : null
}

/** PR states that mean "mid-flight in a batch" — a crash here must be recovered. */
const MIDFLIGHT_PR_STATES: ReadonlySet<PrState> = new Set<PrState>([
  'IN_BATCH', 'TESTING', 'FLAKE_RETRY', 'PASSED', 'LANDING',
])

const BEAD_CLOSE_REPLAY_LIMIT = 8
const BEAD_CLOSE_MAX_ATTEMPTS = 3
const BEAD_COMMAND_TIMEOUT_MS = 30_000

function runBd(args: string[], cwd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile('bd', args, {
      cwd, timeout: BEAD_COMMAND_TIMEOUT_MS, killSignal: 'SIGTERM',
    }, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

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
  private beadCommandsInFlight = new Set<string>()

  private at(): string { return this.deps.now().toISOString() }
  private state(): QueueState { return reduceState(readJournal(this.deps.mqDir)) }

  /** Hand control back to the event loop so proper-lockfile's lock-renewal timer
   *  can run between long synchronous git/gh calls (keeps the singleton lock from
   *  going falsely stale during a busy cycle). */
  private yieldToLoop(): Promise<void> {
    return new Promise<void>(resolve => setImmediate(resolve))
  }

  /** True when the PR's current journal state is terminal (LANDED/EJECTED/
   *  NEEDS_REBASE/CANCELLED) — i.e. it was withdrawn or finished elsewhere. */
  private isTerminal(state: QueueState, pr: number): boolean {
    const e = state.entries.get(pr)
    return e ? TERMINAL_PR_STATES.has(e.state) : false
  }

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
      let caught: unknown = null
      try {
        outcome = await this.cycle()
      } catch (err) {
        caught = err
        this.deps.log(`cycle error: ${String(err)}`)
        try {
          this.reconcile()
        } catch (reconcileErr) {
          this.deps.log(`reconcile after error failed: ${String(reconcileErr)}`)
        }
      }
      if (opts.once) {
        // The one-shot path is for tests/debugging — surface a swallowed cycle
        // error instead of masking it (the long-running daemon keeps going).
        if (caught) throw caught
        return
      }
      if (outcome === 'idle') {
        // D15: wake immediately on a journal append (enqueue / eject / release
        // from another process); poll_seconds remains the fallback ceiling.
        await (this.deps.wake ?? waitForWake)(
          this.deps.mqDir, this.deps.config.poll_seconds * 1000,
        )
      }
    }
  }

  async cycle(): Promise<'idle' | 'worked'> {
    const { gh, git, config, mqDir, log } = this.deps
    if (this.paused() !== null) { log('paused — skipping cycle'); return 'idle' }
    this.retryBeadCloseouts()
    git.fetchOrigin()
    const base = git.defaultBranch()
    if (gh.postMergeRed(base)) {
      log(`post-merge red on ${base} — holding the queue`)
      return 'idle'
    }

    // Remote-agent seam (spec D10): absorb PRs labeled mq:ready. Absorb ONLY a PR
    // the queue has never seen — any existing entry (LANDED included) is a decision
    // a lingering label must not overturn. Re-enqueuing a LANDED PR would re-view it
    // as MERGED and flip its final state to CANCELLED, mis-reporting a good landing.
    const pre = this.state()
    for (const pr of gh.listLabeled(config.ready_label)) {
      if (!pre.entries.has(pr)) {
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
        const msg = String(err)
        // Only a DEFINITIVE PR-not-found answer cancels the PR. Match gh's specific
        // "not a PR" phrasings — NOT a bare "404"/"could not resolve", which also
        // covers repository-access, auth, and remote-config failures. A transient
        // failure (network, auth expiry, rate limit, outage) must never cancel:
        // during an outage every viewPr throws, and cancelling then would nuke the
        // whole queue. Transient failures pause the daemon instead (recoverable).
        if (/could not resolve to a pull\s?request|no pull requests found/i.test(msg)) {
          appendEvent(mqDir, {
            type: 'pr_state', pr: entry.pr, state: 'CANCELLED', at: this.at(),
            note: 'PR not found on GitHub — check the number',
          })
          this.viewFailures.delete(entry.pr)
          continue
        }
        const failures = (this.viewFailures.get(entry.pr) ?? 0) + 1
        this.viewFailures.set(entry.pr, failures)
        log(`warn: transient error viewing PR #${entry.pr}: ${msg} (attempt ${failures})`)
        if (failures >= 5) {
          this.pause(
            `repeated GitHub API failures viewing PR #${entry.pr} (${msg}) — ` +
            'check gh auth / network, then rm .mq/PAUSED',
          )
          break // a pause is queue-wide — stop collecting and let this cycle end
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
      // D13: refresh the changed-file set when the head moved (or was never
      // fetched). Journaled so restarts and later cycles reuse it for free.
      if (entry.filesHeadSha !== info.headSha) {
        try {
          const files = gh.changedFiles(entry.pr)
          appendEvent(mqDir, {
            type: 'pr_files', pr: entry.pr, headSha: info.headSha, files, at: this.at(),
          })
          entry.files = files
          entry.filesHeadSha = info.headSha
        } catch (err) {
          // Unknown files conservatively overlap with everything (solo batch).
          log(`warn: could not list changed files for PR #${entry.pr}: ${String(err)}`)
          entry.files = undefined
          entry.filesHeadSha = undefined
        }
      }
      // Yield between blocking viewPr calls so proper-lockfile's heartbeat timer
      // can fire — a long unbroken run of synchronous gh/git calls would otherwise
      // starve it past the stale threshold and let a second daemon start.
      await this.yieldToLoop()
    }
    // A transient-error pause may have fired mid-collection — do not compose/run/
    // land a batch while paused; end the cycle so the pause is honored.
    if (this.paused() !== null) return 'idle'
    const eligible = queued.filter(e => infos.has(e.pr))
    if (eligible.length === 0) return 'idle'

    // D13: hold policy — a zone-touching PR is parked for a human instead of
    // being gated solo. Positive zone match only: unknown file sets go the
    // conservative SOLO route (never a silent human bottleneck), and a PR a
    // human already released is never re-held.
    const zones = config.overlap_zones
    let batchable = eligible
    if (zones.length > 0 && config.overlap_zone_policy === 'hold') {
      batchable = []
      for (const e of eligible) {
        const known = knownFiles(e)
        if (!e.zoneReleased && known !== null && touchesOverlapZone(known, zones)) {
          appendEvent(mqDir, {
            type: 'pr_state', pr: e.pr, state: 'HELD_HUMAN', at: this.at(),
            note: `touches an overlap zone — release with: scaffold mq release --pr ${e.pr}`,
          })
          continue
        }
        batchable.push(e)
      }
      if (batchable.length === 0) return 'idle'
    }
    const files = new Map<number, string[] | null>()
    for (const e of batchable) {
      files.set(e.pr, knownFiles(e))
    }
    const members = composeBatch(batchable, infos, config.batch_cap, {
      files, overlapZones: zones,
    })

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

    // D12: gate-result cache. The key covers every input that selects or scopes
    // tests; a hit means this exact combination already ran green, so the gate
    // is skipped — but every post-gate safety check below still runs.
    const cacheEnabled = config.gate_cache_max_entries > 0
    const quarantineHash = hashFileOrAbsent(
      path.join(this.deps.projectRoot, config.quarantine_path), 'quarantine',
    )
    const cacheKey = affectedGateKey({
      candidateTree,
      baseTree: git.treeOf(`origin/${base}`),
      command: config.gate_command,
      quarantineHash,
      // Shared helper (not a hardcoded literal) so this cache key always tracks
      // the real map path — if TIA_DIR/TIA_MAP_FILE ever change, invalidation
      // must change with them, or a stale TIA-narrowed green could satisfy a
      // later tree with a different map.
      tiaMapHash: hashFileOrAbsent(tiaMapPath(mqDir), 'tia'),
    })
    const cached = cacheEnabled ? lookupGateCache(mqDir, cacheKey) : null
    let gate: GateResult
    if (cached !== null) {
      appendEvent(mqDir, {
        type: 'gate_cached', batchId, key: cacheKey, savedSeconds: cached.seconds, at: this.at(),
      })
      log(`batch ${batchId}: gate cache hit — skipping the gate (~${cached.seconds}s saved)`)
      gate = { result: 'green', seconds: 0, logPath: '(gate cache hit)', failedTests: [] }
    } else {
      let flakeRetried = false
      gate = await this.gateRun(batchId, base)
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
          flakeRetried = true
        }
      }

      // D12: record only an untainted green — a flake-retry green re-proved just
      // the failed files, not the whole selection, so it must never seed future
      // skips. Red/timeout results are never cached.
      if (cacheEnabled && gate.result === 'green' && !flakeRetried) {
        recordGateCache(
          mqDir, { key: cacheKey, seconds: gate.seconds, at: this.at() },
          config.gate_cache_max_entries,
        )
        // When the merge gate IS the full gate (small projects run `make check`
        // for both), seed the full-gate cache too, so the post-merge poller can
        // skip re-running the identical tree it is about to verify.
        if (config.gate_command === config.full_gate_command) {
          recordGateCache(
            mqDir,
            {
              key: fullGateKey({
                tree: candidateTree, command: config.full_gate_command, quarantineHash,
              }),
              seconds: gate.seconds, at: this.at(),
            },
            config.gate_cache_max_entries,
          )
        }
      }
    }

    // A member withdrawn during the gate (mq eject / external close) poisons the
    // tested candidate — its diff is in the tree. Abort and requeue the survivors
    // for a clean rebuild WHATEVER the gate said. This guards every post-gate path
    // (green, red-singleton, split, base-moved) — not just the green pre-land check.
    const afterGate = this.state()
    const withdrawn = applied.filter(pr => this.isTerminal(afterGate, pr))
    if (withdrawn.length > 0) {
      appendEvent(mqDir, {
        type: 'batch_state', batchId, state: 'ABORTED', at: this.at(),
        note: `member(s) ${withdrawn.map(p => `#${p}`).join(', ')} withdrawn during gate — rebuilding`,
      })
      for (const pr of applied) {
        if (this.isTerminal(afterGate, pr)) continue // leave the withdrawn PR terminal
        appendEvent(mqDir, {
          type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId, at: this.at(),
          note: 'batch member withdrawn — rebuilding',
        })
      }
      git.deleteCandidate(batchId)
      return { kind: 'aborted' }
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
      const testedHeads = new Map(prs.map(p => [p.pr, p.headSha]))
      const landedCount = await this.land(batchId, applied, base, candidateTree, testedHeads)
      git.deleteCandidate(batchId)
      if (landedCount > 0) {
        // D15: the base just moved — kick one post-merge poller pass directly
        // instead of waiting for the scheduler. Fire-and-forget: a pause set
        // during landing is respected by the poller itself (non-poller pauses
        // make it skip), so kicking unconditionally on any landing is safe.
        try { this.deps.triggerPoller?.() } catch { /* advisory only */ }
      }
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
      // Record the gate PGID so a crashed daemon's orphaned gate can be reaped on
      // the next startup before the gate worktree is reused (spec §5.4).
      pidFile: path.join(mqDir, GATE_PID_FILE),
    })
  }

  private async land(
    batchId: string,
    members: number[],
    base: string,
    candidateTree: string,
    testedHeads: Map<number, string>,
  ): Promise<number> {
    const { gh, git, mqDir, log } = this.deps

    // Pre-land validation (spec D9). The candidate tree was built from these exact
    // members at these exact head SHAs. Between batch construction and here the
    // gate ran for minutes — during which a member may have been ejected/cancelled
    // (`mq eject`, external close) or pushed a new revision. Either way the tested
    // tree no longer reflects reality, so landing it would merge a withdrawn or
    // untested diff. Re-read the journal + live heads; if anything moved, requeue
    // the still-valid members for a clean rebuild and land nothing.
    const fresh = this.state()
    const live = new Map<number, PrInfo>()
    let invalidated: string | null = null
    for (const pr of members) {
      const entry = fresh.entries.get(pr)
      if (entry && TERMINAL_PR_STATES.has(entry.state) && entry.state !== 'LANDED') {
        invalidated ??= `#${pr} left the batch (${entry.state}) during the gate`
        continue
      }
      let info: PrInfo
      try {
        info = gh.viewPr(pr)
      } catch (err) {
        invalidated ??= `#${pr} unviewable at land time (${String(err)})`
        continue
      }
      live.set(pr, info)
      if (info.mergedAt === null && info.headSha !== testedHeads.get(pr)) {
        invalidated ??= `#${pr} head advanced during the gate`
      }
    }
    if (invalidated !== null) {
      appendEvent(mqDir, {
        type: 'batch_state', batchId, state: 'ABORTED', at: this.at(),
        note: `candidate invalidated (${invalidated}) — rebuilding`,
      })
      for (const pr of members) {
        const entry = fresh.entries.get(pr)
        if (entry && TERMINAL_PR_STATES.has(entry.state)) continue // already terminal — leave it
        appendEvent(mqDir, {
          type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId, at: this.at(),
          note: 'candidate invalidated — rebuilding',
        })
      }
      log(`batch ${batchId}: ${invalidated} — requeued survivors, landed nothing`)
      return 0
    }

    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'GREEN', at: this.at() })
    for (const pr of members) {
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'PASSED', batchId, at: this.at() })
    }
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'LANDING', at: this.at() })
    const landed: number[] = []
    for (let i = 0; i < members.length; i++) {
      const pr = members[i]
      // Per-merge withdrawal recheck (spec D9): an `mq eject` issued DURING the
      // landing loop — after the pre-land validation — must still stop this PR
      // from merging. With nothing landed yet, abort+rebuild; once earlier members
      // have landed we are committed to the candidate, so pause for a human.
      if (this.isTerminal(this.state(), pr)) {
        if (landed.length === 0) {
          appendEvent(mqDir, {
            type: 'batch_state', batchId, state: 'ABORTED', at: this.at(),
            note: `#${pr} withdrawn during landing — rebuilding`,
          })
          const fresh = this.state()
          for (const m of members) {
            if (this.isTerminal(fresh, m)) continue
            appendEvent(mqDir, {
              type: 'pr_state', pr: m, state: 'REQUEUED_SPLIT', batchId, at: this.at(),
              note: 'sibling withdrawn during landing — rebuilding',
            })
          }
          return 0
        }
        this.requeueUnlanded(members, i + 1, batchId, 'sibling withdrawn mid-landing — retry after review')
        this.pause(
          `#${pr} withdrawn mid-landing of batch ${batchId} after ${landed.length} landed — ` +
          `verify origin/${base}, then rm .mq/PAUSED`,
        )
        appendEvent(mqDir, {
          type: 'batch_state', batchId, state: 'DONE', at: this.at(),
          note: 'withdrawn mid-landing — paused',
        })
        return landed.length
      }
      // Write-ahead: LANDING before the merge attempt; idempotent via mergedAt.
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'LANDING', batchId, at: this.at() })
      try {
        // gh refuses (--match-head-commit) if the head raced past our validation.
        if ((live.get(pr)?.mergedAt ?? null) === null) gh.squashMerge(pr, testedHeads.get(pr))
      } catch (err) {
        // The merge command failed. Its response may have been lost AFTER GitHub
        // merged, so re-query. Three outcomes: merged → treat as landed (lost ack);
        // not-merged → safe to requeue/partial-pause; unknown (the confirmation
        // view ALSO failed) → indeterminate, and requeuing would risk a double
        // merge / NRS bypass, so pause for a human.
        let confirmed: 'merged' | 'not-merged' | 'unknown' = 'unknown'
        try {
          confirmed = (gh.viewPr(pr).mergedAt ?? null) !== null ? 'merged' : 'not-merged'
        } catch { confirmed = 'unknown' }
        if (confirmed === 'merged') {
          appendEvent(mqDir, { type: 'pr_state', pr, state: 'LANDED', batchId, at: this.at() })
          landed.push(pr)
          try {
            gh.comment(pr, `**merge-queue**: landed in batch ${batchId}`)
          } catch { /* comment is best-effort */ }
          this.closeBead(pr, live.get(pr)?.body)
          continue
        }
        if (confirmed === 'unknown') {
          // Leave #${pr} in LANDING (its true state is unknown — reconcile resolves
          // it on the next daemon restart). Requeue the untried tail so it is not
          // stranded in PASSED while the queue is paused.
          this.requeueUnlanded(members, i + 1, batchId, 'after an indeterminate landing — retry after review')
          this.pause(
            `indeterminate merge for PR #${pr} in batch ${batchId} (${String(err)}) — ` +
            'confirm on GitHub whether it merged, then rm .mq/PAUSED and restart the daemon',
          )
          appendEvent(mqDir, {
            type: 'batch_state', batchId, state: 'DONE', at: this.at(),
            note: 'indeterminate merge — paused',
          })
          return landed.length
        }
        if (landed.length === 0) {
          // Nothing has landed yet — this is NOT a partial landing (a transient
          // failure, head race, or externally-closed PR). Requeue the whole batch
          // and rebuild next cycle; pausing the entire queue here would be a
          // denial of service on a routine, recoverable merge error.
          appendEvent(mqDir, {
            type: 'batch_state', batchId, state: 'ABORTED', at: this.at(),
            note: `merge failed before any land (${String(err)}) — rebuilding`,
          })
          const fresh = this.state()
          for (const m of members) {
            if (this.isTerminal(fresh, m)) continue
            appendEvent(mqDir, {
              type: 'pr_state', pr: m, state: 'REQUEUED_SPLIT', batchId, at: this.at(),
              note: 'merge failed before any land — rebuilding',
            })
          }
          return 0
        }
        // Partial landing (some PRs already merged): what landed is real and must
        // not be re-tested against a stale candidate (spec D9) — pause instead of
        // running the NRS check, and requeue everything that did not get to merge.
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
        return landed.length
      }
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'LANDED', batchId, at: this.at() })
      landed.push(pr)
      try {
        gh.comment(pr, `**merge-queue**: landed in batch ${batchId}`)
      } catch { /* comment is best-effort */ }
      this.closeBead(pr, live.get(pr)?.body)
      // Yield so the lock heartbeat can fire between blocking merge calls.
      await this.yieldToLoop()
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
      return landed.length
    }
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'DONE', at: this.at() })
    log(`batch ${batchId}: landed ${members.length} PR(s)`)
    return landed.length
  }

  /** Requeue every not-yet-terminal member from `fromIndex` on, so a paused batch
   *  never leaves its untried tail stranded in a mid-flight (PASSED/LANDING) state. */
  private requeueUnlanded(members: number[], fromIndex: number, batchId: string, note: string): void {
    const fresh = this.state()
    for (const pr of members.slice(fromIndex)) {
      if (this.isTerminal(fresh, pr)) continue
      appendEvent(this.deps.mqDir, {
        type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId, at: this.at(), note,
      })
    }
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
    // The change is already on the base, so the underlying work landed — close the
    // bead too (fire-and-forget contract), don't leave it open forever.
    this.closeBead(pr)
  }

  /** Bead feedback loop (spec §5.5): reopen the bead named in the PR body. */
  private reopenBead(pr: number, knownBody?: string): void {
    // Reopen remains advisory and best-effort. Durable receipts and replay are
    // intentionally limited to post-merge closeout, where an agent has already
    // moved on and no human remains in the loop to notice a failed transition.
    this.beadCmd(pr, 'reopen', ['update', '{id}', '--status', 'open'], knownBody)
  }

  /** Fire-and-forget contract (spec §5.5): the DAEMON closes the bead on land —
   *  the enqueueing agent moved on and never returns to verify the merge. */
  private closeBead(pr: number, knownBody?: string): void {
    this.beadCmd(pr, 'close', ['close', '{id}'], knownBody)
  }

  /** knownBody lets callers that already fetched the PR skip a redundant gh.viewPr. */
  private beadCmd(
    pr: number,
    action: 'close' | 'reopen',
    argTemplate: string[],
    knownBody?: string,
  ): void {
    const { gh, log, mqDir, projectRoot } = this.deps
    const commandKey = `${action}:${pr}`
    if (this.beadCommandsInFlight.has(commandKey)) return
    const prior = action === 'close'
      ? this.state().beadSync.get(beadSyncKey(pr, action))
      : undefined
    if (
      action === 'close' &&
      (prior?.result === 'succeeded' ||
        prior?.result === 'skipped' ||
        prior?.result === 'abandoned')
    ) return

    let body = knownBody
    if (body === undefined) {
      try {
        body = gh.viewPr(pr).body
      } catch (err) {
        const note = `could not read PR body: ${String(err)}`
        if (action === 'close') {
          const attempts = this.nextBeadAttempt(prior)
          const result = this.failedBeadResult(attempts)
          appendEvent(mqDir, {
            type: 'bead_sync', pr, action, result,
            attempts, at: this.at(), note,
          })
          log(`warn: bead close ${result} for PR #${pr}: ${note}`)
        } else {
          log(`warn: bead reopen for PR #${pr} failed: ${note}`)
        }
        return
      }
    }
    const canonical = body.match(/Closes ([a-z][a-z0-9-]*-[a-z0-9]+)/i)
    const fallback = body.match(/(?:^|\n)\s*Bead:\s*([a-z][a-z0-9-]*-[a-z0-9]+)/i)
    const beadId = canonical?.[1] ?? fallback?.[1]
    if (!beadId) {
      const note = 'PR body has no "Closes <id>" Bead mapping'
      if (action === 'close') {
        appendEvent(mqDir, {
          type: 'bead_sync', pr, action, result: 'skipped', at: this.at(), note,
        })
      }
      log(`warn: bead ${action} skipped for PR #${pr}: ${note}`)
      return
    }
    if (!canonical) {
      log(`warn: PR #${pr} uses non-canonical "Bead:" mapping; prefer "Closes ${beadId}"`)
    }

    const args = argTemplate.map(a => a === '{id}' ? beadId : a)
    this.beadCommandsInFlight.add(commandKey)
    const attempts = action === 'close' ? this.nextBeadAttempt(prior) : 0
    if (action === 'close') {
      appendEvent(mqDir, {
        type: 'bead_sync', pr, action, beadId, result: 'attempted', attempts, at: this.at(),
      })
    }
    const runner = this.deps.runBeadCommand ?? runBd
    void runner(args, projectRoot)
      .then(() => {
        if (action === 'close') {
          appendEvent(mqDir, {
            type: 'bead_sync', pr, action, beadId, result: 'succeeded', attempts, at: this.at(),
          })
        }
      })
      .catch((err: unknown) => {
        const note = String(err)
        if (action === 'close') {
          const missingCommand =
            typeof err === 'object' && err !== null &&
            'code' in err && err.code === 'ENOENT'
          const result = missingCommand ? 'skipped' : this.failedBeadResult(attempts)
          appendEvent(mqDir, {
            type: 'bead_sync', pr, action, beadId, result,
            attempts, at: this.at(), note,
          })
          log(`warn: bead close ${result} for PR #${pr} (${beadId}): ${note}`)
        } else {
          log(`warn: bead reopen failed for PR #${pr} (${beadId}): ${note}`)
        }
      })
      .finally(() => this.beadCommandsInFlight.delete(commandKey))
  }

  private nextBeadAttempt(prior: BeadSyncRecord | undefined): number {
    if (!prior) return 1
    return (prior.attempts ?? (
      prior.result === 'attempted' || prior.result === 'failed' ? 1 : 0
    )) + 1
  }

  private failedBeadResult(attempts: number): 'failed' | 'abandoned' {
    return attempts >= BEAD_CLOSE_MAX_ATTEMPTS ? 'abandoned' : 'failed'
  }

  /** Retry failed closeouts and migrate legacy LANDED entries that predate
   *  bead_sync receipts. Never-attempted and oldest-attempted work runs first;
   *  the fixed batch size limits child-process bursts without starving history. */
  private retryBeadCloseouts(): void {
    const state = this.state()
    const candidates = [...state.entries.values()]
      .filter(entry => {
        if (entry.state !== 'LANDED') return false
        const receipt = state.beadSync.get(beadSyncKey(entry.pr, 'close'))
        return !this.beadCommandsInFlight.has(beadSyncKey(entry.pr, 'close')) &&
          receipt?.result !== 'succeeded' &&
          receipt?.result !== 'skipped' &&
          receipt?.result !== 'abandoned'
      })
      .sort((a, b) => {
        const aReceipt = state.beadSync.get(beadSyncKey(a.pr, 'close'))
        const bReceipt = state.beadSync.get(beadSyncKey(b.pr, 'close'))
        if (!aReceipt && bReceipt) return -1
        if (aReceipt && !bReceipt) return 1
        return (aReceipt?.at ?? a.enqueuedAt).localeCompare(
          bReceipt?.at ?? b.enqueuedAt,
        ) || a.enqueuedAt.localeCompare(b.enqueuedAt)
      })
      .slice(0, BEAD_CLOSE_REPLAY_LIMIT)
    for (const entry of candidates) this.closeBead(entry.pr)
  }

  /** Startup recovery (spec §5.4): journal vs refs vs GitHub. */
  reconcile(): void {
    const { git, mqDir, log } = this.deps
    this.reapOrphanGate()
    const state = this.state()
    for (const batch of state.batches.values()) {
      if (!IN_FLIGHT_BATCH_STATES.includes(batch.state)) continue
      // A crash mid-LANDING is special: some members may have merged. Recover it
      // as a UNIT — pause on a partial landing, run the NRS assertion when all
      // merged — instead of the generic per-member requeue (spec §5.4).
      if (batch.state === 'LANDING') {
        this.recoverLandingBatch(batch, state)
        continue
      }
      appendEvent(mqDir, {
        type: 'batch_state', batchId: batch.id, state: 'ABORTED', at: this.at(),
        note: 'daemon restart',
      })
      for (const pr of batch.members) {
        const entry = state.entries.get(pr)
        if (!entry) continue
        if (TERMINAL_PR_STATES.has(entry.state)) {
          // A crash between the LANDED journal write and closeBead() would leave the
          // bead open forever (spec §5.5). Replay the idempotent close before skipping.
          if (entry.state === 'LANDED') this.closeBead(pr)
          continue
        }
        this.recoverMember(pr, batch.id, 'recovered: daemon restart')
      }
    }
    // Crash-safety sweep: a crash after a terminal batch_state (ABORTED/RED/DONE)
    // but before its members were transitioned leaves them stuck in a mid-flight PR
    // state that the in-flight-batch loop above never revisits. Recover any such
    // orphan regardless of its batch's state.
    for (const entry of this.state().entries.values()) {
      if (MIDFLIGHT_PR_STATES.has(entry.state)) {
        this.recoverMember(entry.pr, entry.batchId, 'recovered: orphaned mid-flight')
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
    this.retryBeadCloseouts()
    log('reconcile complete')
  }

  /** Recover a batch that crashed mid-LANDING as a UNIT (spec §5.4): query every
   *  member, mark the merged ones LANDED + close their beads, and then —
   *  - partial (some merged, some not): requeue the tail and PAUSE (a human must
   *    reconcile what did/didn't land against a now-stale candidate);
   *  - all merged: run the NRS tree assertion (pause on mismatch);
   *  - none merged: requeue everyone for a clean rebuild. */
  private recoverLandingBatch(batch: BatchRecord, state: QueueState): void {
    const { gh, git, mqDir } = this.deps
    const merged: number[] = []
    const unmerged: number[] = []
    for (const pr of batch.members) {
      const entry = state.entries.get(pr)
      if (!entry || (TERMINAL_PR_STATES.has(entry.state) && entry.state !== 'LANDED')) continue
      let info: PrInfo | null = null
      try {
        info = gh.viewPr(pr)
      } catch { /* treat as unmerged */ }
      if (info?.mergedAt != null) {
        merged.push(pr)
        if (entry.state !== 'LANDED') {
          appendEvent(mqDir, {
            type: 'pr_state', pr, state: 'LANDED', batchId: batch.id, at: this.at(),
            note: 'recovered: merged during landing',
          })
        }
        this.closeBead(pr, info.body)
      } else {
        unmerged.push(pr)
      }
    }
    if (merged.length > 0 && unmerged.length > 0) {
      for (const pr of unmerged) {
        appendEvent(mqDir, {
          type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId: batch.id, at: this.at(),
          note: 'recovered: unmerged tail of a crashed partial landing',
        })
      }
      this.pause(
        `crash during landing of batch ${batch.id}: ${merged.length}/${batch.members.length} merged` +
        ' — verify origin and the post-merge suite, then rm .mq/PAUSED',
      )
      appendEvent(mqDir, {
        type: 'batch_state', batchId: batch.id, state: 'DONE', at: this.at(),
        note: 'recovered partial landing — paused',
      })
      return
    }
    if (merged.length > 0 && unmerged.length === 0) {
      if (batch.candidateTree) {
        git.fetchOrigin()
        const base = git.defaultBranch()
        const landedTree = git.treeOf(`origin/${base}`)
        if (landedTree !== batch.candidateTree) {
          this.pause(
            `NRS violation recovered for batch ${batch.id}: origin/${base} tree ${landedTree} != ` +
            `tested candidate ${batch.candidateTree} — investigate before unpausing (rm .mq/PAUSED)`,
          )
        }
      }
      appendEvent(mqDir, {
        type: 'batch_state', batchId: batch.id, state: 'DONE', at: this.at(),
        note: 'recovered: fully landed',
      })
      return
    }
    for (const pr of unmerged) {
      appendEvent(mqDir, {
        type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId: batch.id, at: this.at(),
        note: 'recovered: landing never started',
      })
    }
    appendEvent(mqDir, {
      type: 'batch_state', batchId: batch.id, state: 'ABORTED', at: this.at(),
      note: 'recovered: no members merged',
    })
  }

  /** Requeue (or, if it actually merged, LAND) a member left mid-flight by a crash. */
  private recoverMember(pr: number, batchId: string | undefined, note: string): void {
    const { gh, mqDir } = this.deps
    let info: PrInfo | null = null
    try {
      info = gh.viewPr(pr)
    } catch { /* treat as unmerged */ }
    if (info?.mergedAt != null) {
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'LANDED', batchId, at: this.at(), note })
      // Fire-and-forget: close the bead a crash may have skipped (spec §5.5).
      this.closeBead(pr, info.body)
    } else {
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId, at: this.at(), note })
    }
  }

  /** Kill an orphaned gate process group left by a crashed prior daemon before the
   *  gate worktree is reused — otherwise it mutates the worktree concurrently with
   *  the new run and corrupts gate results (spec §5.4). Guards against PID reuse:
   *  a stored PID that a reboot has recycled to an UNRELATED process must never be
   *  SIGKILLed, so we only kill when the live process still runs our gate command. */
  private reapOrphanGate(): void {
    const { mqDir, log } = this.deps
    const pidFile = path.join(mqDir, GATE_PID_FILE)
    if (!fs.existsSync(pidFile)) return
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
    if (Number.isInteger(pid) && pid > 0 && this.looksLikeOurGate(pid)) {
      try {
        process.kill(-pid, 'SIGKILL') // negative pid = whole group
        log(`reaped orphaned gate process group ${pid}`)
      } catch { /* already gone */ }
    }
    fs.rmSync(pidFile, { force: true })
  }

  /** PID-reuse guard: the live process with this pid must still be running our
   *  configured gate command before we send it SIGKILL. A recycled pid pointing
   *  at some unrelated process fails this check and is left untouched. */
  private looksLikeOurGate(pid: number): boolean {
    try {
      const cmd = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })
      return cmd.includes(this.deps.config.gate_command)
    } catch {
      return false // no such pid, or ps unavailable — do not kill
    }
  }
}
