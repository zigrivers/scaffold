// src/merge-queue/daemon.test.ts
import { describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MergeQueueDaemon, PAUSED_FILE, type DaemonDeps } from './daemon.js'
import { appendEvent, readJournal } from './journal.js'
import { reduceState, queuedPrs } from './state.js'
import { defaultMergeQueueConfig } from './types.js'
import type { GhClient, PrInfo } from './gh.js'
import type { CandidateResult, GitOps } from './git.js'
import type { GateResult } from './gate.js'

const AT = '2026-07-17T12:00:00.000Z'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-daemon-')) }

function prInfo(n: number, over: Partial<PrInfo> = {}): PrInfo {
  return {
    number: n, state: 'OPEN', headSha: `sha${n}`, mergedAt: null,
    additions: n, deletions: 0, title: `pr${n}`, body: '', ...over,
  }
}

class FakeGh implements GhClient {
  infos = new Map<number, PrInfo>()
  merged: number[] = []
  comments: { pr: number; body: string }[] = []
  labeled: number[] = []
  red = false
  failMerge = new Set<number>()
  notFound = new Set<number>()          // viewPr throws a definitive "gone" error
  failMergeButLands = new Set<number>() // squashMerge throws but the PR is merged (lost ack)
  indeterminate = new Set<number>()     // squashMerge throws AND the confirming view then fails
  onSquash?: (pr: number) => void       // fired after a successful merge (to inject mid-loop events)
  private breakView = new Set<number>()
  viewErrors = new Map<number, string>() // pr -> exact error message viewPr should throw
  viewPr(pr: number): PrInfo {
    if (this.breakView.has(pr)) throw new Error('network unreachable during confirmation')
    if (this.notFound.has(pr)) throw new Error('Could not resolve to a PullRequest')
    const custom = this.viewErrors.get(pr)
    if (custom !== undefined) throw new Error(custom)
    const info = this.infos.get(pr)
    if (!info) throw new Error(`transient blip viewing PR ${pr}`)
    return info
  }
  mergeHeads: (string | undefined)[] = []
  squashMerge(pr: number, expectedHead?: string): void {
    if (this.indeterminate.has(pr)) {
      this.breakView.add(pr) // the post-merge confirmation view will also fail
      throw new Error('merge ack lost')
    }
    if (this.failMergeButLands.has(pr)) {
      this.infos.set(pr, { ...this.viewPr(pr), state: 'MERGED', mergedAt: AT })
      throw new Error('lost response after merge')
    }
    if (this.failMerge.has(pr)) throw new Error('boom')
    this.merged.push(pr)
    this.mergeHeads.push(expectedHead)
    this.infos.set(pr, { ...this.viewPr(pr), state: 'MERGED', mergedAt: AT })
    this.onSquash?.(pr)
  }
  comment(pr: number, body: string): void { this.comments.push({ pr, body }) }
  listLabeled(): number[] { return this.labeled }
  postMergeRed(): boolean { return this.red }
}

class FakeGit implements GitOps {
  headShas: string[] = ['S1']          // FIFO, last value sticky
  trees: Record<string, string> = {}   // ref -> tree; default 'TREE'
  candidates: CandidateResult[] = []   // scripted per constructCandidate call
  constructed: { batchId: string; prs: number[] }[] = []
  deleted: string[] = []
  liveRefs: string[] = []
  constructor(private root: string) {}
  primaryRoot(): string { return this.root }
  defaultBranch(): string { return 'main' }
  fetchOrigin(): void { /* no-op */ }
  originHeadSha(): string {
    return this.headShas.length > 1 ? (this.headShas.shift() as string) : this.headShas[0]
  }
  treeOf(ref: string): string { return this.trees[ref] ?? 'TREE' }
  ensureGateWorktree(): string { return path.join(this.root, '.mq', 'gate') }
  constructCandidate(batchId: string, prs: { pr: number }[]): CandidateResult {
    this.constructed.push({ batchId, prs: prs.map(p => p.pr) })
    const scripted = this.candidates.shift()
    return scripted ?? {
      ref: `refs/merge-queue/batch-${batchId}`, applied: prs.map(p => p.pr), rejected: [],
      alreadyApplied: [],
    }
  }
  deleteCandidate(batchId: string): void { this.deleted.push(batchId) }
  listCandidateRefs(): string[] { return this.liveRefs }
}

function harness(over: Partial<DaemonDeps> = {}) {
  const root = tmp()
  const mqDir = path.join(root, '.mq')
  const gh = new FakeGh()
  const git = new FakeGit(root)
  const gateResults: GateResult[] = []
  const gateCalls: Parameters<DaemonDeps['runGate']>[0][] = []
  const deps: DaemonDeps = {
    gh, git,
    runGate: opts => {
      gateCalls.push(opts)
      const next = gateResults.shift()
      return next ?? { result: 'green', seconds: 1, logPath: '/dev/null', failedTests: [] }
    },
    config: defaultMergeQueueConfig(),
    mqDir, projectRoot: root,
    log: () => {},
    now: () => new Date(AT),
    ...over,
  }
  const daemon = new MergeQueueDaemon(deps)
  const enqueue = (pr: number) => {
    gh.infos.set(pr, prInfo(pr))
    appendEvent(mqDir, { type: 'enqueued', pr, at: AT })
  }
  const states = () => {
    const s = reduceState(readJournal(mqDir))
    return Object.fromEntries([...s.entries.values()].map(e => [e.pr, e.state]))
  }
  return { daemon, deps, gh, git, gateResults, gateCalls, enqueue, states, mqDir, root }
}

describe('MergeQueueDaemon.cycle', () => {
  it('lands a green batch of two and passes the NRS check', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    expect(await h.daemon.cycle()).toBe('worked')
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'LANDED' })
    expect(h.gh.merged).toEqual([1, 2])
    expect(h.daemon.paused()).toBeNull()
    expect(h.git.deleted.length).toBe(1)
  })

  it('passes MQ_AFFECTED_BASE to the gate and runs it in the gate worktree', async () => {
    const h = harness()
    h.enqueue(1)
    await h.daemon.cycle()
    expect(h.gateCalls[0].env?.MQ_AFFECTED_BASE).toBe('origin/main')
    expect(h.gateCalls[0].cwd).toBe(path.join(h.root, '.mq', 'gate'))
    expect(h.gateCalls[0].command).toBe('make check-affected')
  })

  it('absorbs label-enqueued PRs (remote seam)', async () => {
    const h = harness()
    h.gh.labeled = [5]
    h.gh.infos.set(5, prInfo(5))
    expect(await h.daemon.cycle()).toBe('worked')
    expect(h.states()[5]).toBe('LANDED')
  })

  it('cancels externally closed PRs instead of batching them', async () => {
    const h = harness()
    h.enqueue(1)
    h.gh.infos.set(1, prInfo(1, { state: 'MERGED', mergedAt: AT }))
    // No batch ever runs (nothing was eligible) -> idle, so the poll sleep applies.
    expect(await h.daemon.cycle()).toBe('idle')
    expect(h.states()[1]).toBe('CANCELLED')
    expect(h.gh.merged).toEqual([])
  })

  it('ejects a red singleton with the gate log in the PR comment', async () => {
    const h = harness()
    h.enqueue(1)
    h.gateResults.push({ result: 'red', seconds: 2, logPath: '/logs/b.log', failedTests: [] })
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('EJECTED')
    expect(h.gh.comments[0].pr).toBe(1)
    expect(h.gh.comments[0].body).toContain('/logs/b.log')
    const entry = reduceState(readJournal(h.mqDir)).entries.get(1)
    expect(entry?.queueFailures).toBe(1)
  })

  it('bisects a red pair: green half lands, red half is ejected', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    // parent(1,2) red -> split -> [1] green -> [2] red
    h.gateResults.push(
      { result: 'red', seconds: 2, logPath: '/l/p.log', failedTests: [] },
      { result: 'green', seconds: 1, logPath: '/l/l.log', failedTests: [] },
      { result: 'red', seconds: 1, logPath: '/l/r.log', failedTests: [] },
    )
    await h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'EJECTED' })
    expect(h.gh.merged).toEqual([1])
    expect(h.git.constructed.map(c => c.prs)).toEqual([[1, 2], [1], [2]])
  })

  it('flake retry: failed tests rerun once; green retry lands and records the flake', async () => {
    const h = harness()
    h.enqueue(1)
    h.gateResults.push(
      { result: 'red', seconds: 2, logPath: '/l/a.log', failedTests: ['src/f.test.ts'] },
      { result: 'green', seconds: 1, logPath: '/l/a2.log', failedTests: [] },
    )
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('LANDED')
    expect(h.gateCalls[1].env?.MQ_RETRY_TESTS).toBe('src/f.test.ts')
    const flakes = reduceState(readJournal(h.mqDir)).flakes
    expect(flakes).toEqual([{ testId: 'src/f.test.ts', at: AT }])
  })

  it('quarantines a test on its 3rd flake event in 7 days', async () => {
    const h = harness()
    appendEvent(h.mqDir, { type: 'flake', testId: 'src/f.test.ts', at: '2026-07-15T00:00:00.000Z' })
    appendEvent(h.mqDir, { type: 'flake', testId: 'src/f.test.ts', at: '2026-07-16T00:00:00.000Z' })
    h.enqueue(1)
    h.gateResults.push(
      { result: 'red', seconds: 2, logPath: '/l/a.log', failedTests: ['src/f.test.ts'] },
      { result: 'green', seconds: 1, logPath: '/l/a2.log', failedTests: [] },
    )
    await h.daemon.cycle()
    const qFile = path.join(h.root, '.mq/quarantine.txt')
    expect(fs.readFileSync(qFile, 'utf8')).toBe('src/f.test.ts\n')
  })

  it('ejects NEEDS_REBASE members without killing the batch', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.git.candidates.push({
      ref: 'refs/merge-queue/batch-x', applied: [1], rejected: [2], alreadyApplied: [],
    })
    await h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'NEEDS_REBASE' })
    expect(h.gh.comments.some(c => c.pr === 2 && /rebase/i.test(c.body))).toBe(true)
  })

  it('aborts and requeues when the base moved during the gate', async () => {
    const h = harness()
    h.enqueue(1)
    h.git.headShas = ['S1', 'S2'] // batch start sees S1; post-gate check sees S2
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('REQUEUED_SPLIT')
    expect(h.gh.merged).toEqual([])
    const s = reduceState(readJournal(h.mqDir))
    expect(queuedPrs(s).map(e => e.pr)).toEqual([1])
  })

  it('holds the queue while post-merge is red', async () => {
    const h = harness()
    h.enqueue(1)
    h.gh.red = true
    expect(await h.daemon.cycle()).toBe('idle')
    expect(h.states()[1]).toBe('QUEUED')
  })

  it('timeout is retried once whole, then treated as red', async () => {
    const h = harness()
    h.enqueue(1)
    h.gateResults.push(
      { result: 'timeout', seconds: 99, logPath: '/l/t1.log', failedTests: [] },
      { result: 'timeout', seconds: 99, logPath: '/l/t2.log', failedTests: [] },
    )
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('EJECTED')
    expect(h.gateCalls.length).toBe(2)
  })

  it('pauses on an NRS tree mismatch after landing', async () => {
    const h = harness()
    h.enqueue(1)
    h.git.trees['origin/main'] = 'DIFFERENT'
    await h.daemon.cycle()
    expect(h.daemon.paused()).toMatch(/NRS violation/)
    expect(fs.existsSync(path.join(h.mqDir, PAUSED_FILE))).toBe(true)
    // paused daemon does nothing next cycle
    h.enqueue(2)
    expect(await h.daemon.cycle()).toBe('idle')
  })

  it('a mid-cycle NRS pause stops the bisection stack', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.git.trees['origin/main'] = 'DIFFERENT'
    // parent(1,2) red -> split -> [1] green (lands, then NRS pause fires) -> [2] never runs
    h.gateResults.push(
      { result: 'red', seconds: 2, logPath: '/l/p.log', failedTests: [] },
      { result: 'green', seconds: 1, logPath: '/l/l.log', failedTests: [] },
    )
    await h.daemon.cycle()
    expect(h.gh.merged).toEqual([1])
    expect(h.git.constructed.map(c => c.prs)).toEqual([[1, 2], [1]])
    expect(h.daemon.paused()).toMatch(/NRS violation/)
  })

  it('partial landing pauses and requeues the unmerged tail', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.gh.failMerge.add(2)
    await h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'REQUEUED_SPLIT' })
    expect(h.daemon.paused()).toMatch(/partial landing/)
    expect(h.gh.merged).toEqual([1])
  })

  it('a transient view error keeps the PR QUEUED and pauses the daemon after 5 attempts (never cancels)', async () => {
    const h = harness()
    // No gh.infos entry -> viewPr throws a transient (non-"gone") error.
    appendEvent(h.mqDir, { type: 'enqueued', pr: 1, at: AT })
    for (let i = 0; i < 4; i++) {
      expect(await h.daemon.cycle()).toBe('idle')
      expect(h.states()[1]).toBe('QUEUED')
      expect(h.daemon.paused()).toBeNull()
    }
    expect(await h.daemon.cycle()).toBe('idle')
    expect(h.states()[1]).toBe('QUEUED')                     // NOT cancelled — an outage must not nuke the queue
    expect(h.daemon.paused()).toMatch(/GitHub API failures/) // paused for a human instead
  })

  it('cancels a PR that GitHub reports as genuinely gone (not-found)', async () => {
    const h = harness()
    h.gh.notFound.add(1)
    appendEvent(h.mqDir, { type: 'enqueued', pr: 1, at: AT })
    expect(await h.daemon.cycle()).toBe('idle')
    expect(h.states()[1]).toBe('CANCELLED')
    expect(h.daemon.paused()).toBeNull()
  })

  it('does NOT cancel on a generic "could not resolve" (repo/auth) — treats it as transient', async () => {
    const h = harness()
    // A repository-access / auth failure, NOT a PR-not-found. Must stay QUEUED and
    // (after 5) pause — never cancel, which the old broad regex would have done.
    h.gh.viewErrors.set(1, 'GraphQL: Could not resolve to a Repository with the name X (HTTP 404)')
    appendEvent(h.mqDir, { type: 'enqueued', pr: 1, at: AT })
    for (let i = 0; i < 4; i++) {
      expect(await h.daemon.cycle()).toBe('idle')
      expect(h.states()[1]).toBe('QUEUED')
    }
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('QUEUED')                     // NOT cancelled
    expect(h.daemon.paused()).toMatch(/GitHub API failures/) // paused instead
  })

  it('a pause fired during PR collection aborts the cycle before any batch runs', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    // Simulate a pause landing mid-collection (e.g. from a concurrent transient
    // path): the cycle must not go on to compose/run/land a batch.
    const origView = h.gh.viewPr.bind(h.gh)
    let pausedOnce = false
    h.gh.viewPr = (pr: number) => {
      if (pr === 1 && !pausedOnce) {
        pausedOnce = true
        fs.writeFileSync(path.join(h.mqDir, 'PAUSED'), 'concurrent pause\n')
      }
      return origView(pr)
    }
    expect(await h.daemon.cycle()).toBe('idle')
    expect(h.gh.merged).toEqual([])
    expect(h.states()[1]).not.toBe('LANDED')
    expect(h.states()[2]).not.toBe('LANDED')
  })

  it('an EJECTED PR relabeled mq:ready is not re-absorbed', async () => {
    const h = harness()
    h.enqueue(1)
    h.gateResults.push({ result: 'red', seconds: 2, logPath: '/l/b.log', failedTests: [] })
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('EJECTED')
    h.gh.labeled = [1]
    expect(await h.daemon.cycle()).toBe('idle')
    expect(h.states()[1]).toBe('EJECTED')
    expect(h.git.constructed.length).toBe(1)
  })

  it('a LANDED PR with a lingering mq:ready label is not re-enqueued (stays LANDED)', async () => {
    const h = harness()
    h.enqueue(1)
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('LANDED')
    // The label was never removed; a second cycle must not re-view+re-enqueue it
    // (which would flip the good landing to CANCELLED when the next view sees MERGED).
    h.gh.labeled = [1]
    expect(await h.daemon.cycle()).toBe('idle')
    expect(h.states()[1]).toBe('LANDED')
  })

  it('a member withdrawn during a RED gate is neither ejected nor split — survivors rebuild', async () => {
    let onGate: (() => void) | null = null
    const h = harness({
      runGate: () => { onGate?.(); return { result: 'red', seconds: 2, logPath: '/l/r.log', failedTests: [] } },
    })
    h.enqueue(1)
    h.enqueue(2)
    onGate = () => appendEvent(h.mqDir, {
      type: 'pr_state', pr: 2, state: 'CANCELLED', at: AT, note: 'user eject',
    })
    await h.daemon.cycle()
    expect(h.states()[2]).toBe('CANCELLED')            // stays withdrawn — not re-EJECTED
    expect(h.states()[1]).toBe('REQUEUED_SPLIT')       // survivor rebuilds, no bisection of the poisoned tree
    expect(h.gh.merged).toEqual([])
    expect(h.git.constructed.map(c => c.prs)).toEqual([[1, 2]]) // no split happened
  })

  it('a lost-ack merge (command errors but GitHub merged) is recorded LANDED, not requeued', async () => {
    const h = harness()
    h.enqueue(1)
    h.gh.failMergeButLands.add(1)
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('LANDED')
    expect(h.daemon.paused()).toBeNull() // not a partial-landing pause
  })

  it('a merge failure before any land requeues and rebuilds without pausing the queue', async () => {
    const h = harness()
    h.enqueue(1)
    h.gh.failMerge.add(1) // fails, and the PR is NOT actually merged
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('REQUEUED_SPLIT')
    expect(h.gh.merged).toEqual([])
    expect(h.daemon.paused()).toBeNull() // 0 landed => not a partial landing => no pause
  })

  it('pauses on an indeterminate merge (the merge AND its confirmation both fail)', async () => {
    const h = harness()
    h.enqueue(1)
    h.gh.indeterminate.add(1)
    await h.daemon.cycle()
    expect(h.daemon.paused()).toMatch(/indeterminate/)
    expect(h.states()[1]).not.toBe('LANDED')
    expect(h.gh.merged).toEqual([])
  })

  it('an indeterminate merge requeues the untried tail before pausing (no stranded PASSED)', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.gh.indeterminate.add(1) // first member's merge outcome is unknowable
    await h.daemon.cycle()
    expect(h.daemon.paused()).toMatch(/indeterminate/)
    expect(h.states()[2]).toBe('REQUEUED_SPLIT') // tail recovered, not left in PASSED
  })

  it('a withdrawal DURING the landing loop stops the later PR and pauses (partial)', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    // Eject #2 the instant #1 merges — after the pre-land validation has passed.
    h.gh.onSquash = pr => {
      if (pr === 1) {
        appendEvent(h.mqDir, {
          type: 'pr_state', pr: 2, state: 'CANCELLED', at: AT, note: 'user eject mid-landing',
        })
      }
    }
    await h.daemon.cycle()
    expect(h.gh.merged).toEqual([1])                 // #1 landed before the eject
    expect(h.states()[2]).toBe('CANCELLED')          // #2 withdrawn mid-loop — never merged
    expect(h.daemon.paused()).toMatch(/withdrawn mid-landing/)
  })

  it('closes the bead when a PR is cancelled as already-applied', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.gh.infos.set(2, prInfo(2, { body: 'Closes proj-2' }))
    h.git.candidates.push({
      ref: 'refs/merge-queue/batch-x', applied: [1], rejected: [], alreadyApplied: [2],
    })
    const spy = vi.spyOn(
      h.daemon as unknown as { closeBead: (pr: number, body?: string) => void }, 'closeBead',
    )
    await h.daemon.cycle()
    expect(h.states()[2]).toBe('CANCELLED')
    expect(spy).toHaveBeenCalledWith(2)
  })

  it('binds each merge to the head SHA that was tested (--match-head-commit)', async () => {
    const h = harness()
    h.enqueue(1)
    await h.daemon.cycle()
    expect(h.gh.merged).toEqual([1])
    expect(h.gh.mergeHeads).toEqual(['sha1']) // the head captured at batch construction
  })

  it('does not land a member ejected during the gate; requeues the survivors', async () => {
    let onGate: (() => void) | null = null
    const h = harness({
      runGate: () => { onGate?.(); return { result: 'green', seconds: 1, logPath: '/dev/null', failedTests: [] } },
    })
    h.enqueue(1)
    h.enqueue(2)
    // Simulate `mq eject --pr 2` landing in the journal while the gate runs.
    onGate = () => appendEvent(h.mqDir, {
      type: 'pr_state', pr: 2, state: 'CANCELLED', at: AT, note: 'user eject',
    })
    await h.daemon.cycle()
    expect(h.gh.merged).toEqual([]) // candidate tree included the ejected diff — land nothing
    expect(h.states()[2]).toBe('CANCELLED')
    expect(h.states()[1]).toBe('REQUEUED_SPLIT') // survivor requeued for a clean rebuild
  })

  it('does not land a member whose head advanced during the gate', async () => {
    let onGate: (() => void) | null = null
    const h = harness({
      runGate: () => { onGate?.(); return { result: 'green', seconds: 1, logPath: '/dev/null', failedTests: [] } },
    })
    h.enqueue(1)
    // A push mid-gate: the live head no longer matches the tested head.
    onGate = () => h.gh.infos.set(1, prInfo(1, { headSha: 'sha1-NEW' }))
    await h.daemon.cycle()
    expect(h.gh.merged).toEqual([])
    expect(h.states()[1]).toBe('REQUEUED_SPLIT')
  })

  it('cancels an already-applied PR without ejecting or blocking the rest of the batch', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.git.candidates.push({
      ref: 'refs/merge-queue/batch-x', applied: [1], rejected: [], alreadyApplied: [2],
    })
    await h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'CANCELLED' })
    const entry = reduceState(readJournal(h.mqDir)).entries.get(2)
    expect(entry?.note).toBe('diff already applied to origin/main — close the PR')
    expect(h.gh.comments.some(c => c.pr === 2 && /already applied/i.test(c.body))).toBe(true)
    expect(h.gh.merged).toEqual([1])
  })
})

describe('MergeQueueDaemon.reconcile', () => {
  it('requeues members of a dead in-flight batch, marks crash-merged PRs LANDED, sweeps refs', () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    appendEvent(h.mqDir, { type: 'batch_created', batchId: 'dead', members: [1, 2], at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 1, state: 'TESTING', batchId: 'dead', at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 2, state: 'TESTING', batchId: 'dead', at: AT })
    appendEvent(h.mqDir, { type: 'batch_state', batchId: 'dead', state: 'RUNNING', at: AT })
    h.gh.infos.set(1, prInfo(1, { state: 'MERGED', mergedAt: AT })) // merged before crash
    h.git.liveRefs = ['refs/merge-queue/batch-dead']
    h.daemon.reconcile()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'REQUEUED_SPLIT' })
    expect(h.git.deleted).toContain('dead')
  })

  it('closes the bead when it recovers a crash-merged PR', () => {
    const h = harness()
    h.enqueue(1)
    appendEvent(h.mqDir, { type: 'batch_created', batchId: 'dead', members: [1], at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 1, state: 'TESTING', batchId: 'dead', at: AT })
    appendEvent(h.mqDir, { type: 'batch_state', batchId: 'dead', state: 'RUNNING', at: AT })
    h.gh.infos.set(1, prInfo(1, { state: 'MERGED', mergedAt: AT, body: 'Closes proj-1' }))
    const spy = vi.spyOn(
      h.daemon as unknown as { closeBead: (pr: number, body?: string) => void },
      'closeBead',
    )
    h.daemon.reconcile()
    expect(h.states()[1]).toBe('LANDED')
    expect(spy).toHaveBeenCalledWith(1, 'Closes proj-1')
  })

  it('replays closeBead for a member already journaled LANDED (crash between LANDED and close)', () => {
    const h = harness()
    h.enqueue(1)
    appendEvent(h.mqDir, { type: 'batch_created', batchId: 'dead', members: [1], at: AT })
    // The PR was journaled LANDED but the daemon crashed before closeBead ran.
    appendEvent(h.mqDir, { type: 'pr_state', pr: 1, state: 'LANDED', batchId: 'dead', at: AT })
    appendEvent(h.mqDir, { type: 'batch_state', batchId: 'dead', state: 'LANDING', at: AT })
    h.gh.infos.set(1, prInfo(1, { state: 'MERGED', mergedAt: AT, body: 'Closes proj-1' }))
    const spy = vi.spyOn(
      h.daemon as unknown as { closeBead: (pr: number, body?: string) => void },
      'closeBead',
    )
    h.daemon.reconcile()
    expect(spy).toHaveBeenCalledWith(1, 'Closes proj-1') // idempotent replay for the already-LANDED member
  })

  it('recovers a crashed LANDING batch that fully merged and asserts NRS (no pause)', () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    appendEvent(h.mqDir, { type: 'batch_created', batchId: 'land', members: [1, 2], at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 1, state: 'LANDING', batchId: 'land', at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 2, state: 'LANDING', batchId: 'land', at: AT })
    appendEvent(h.mqDir, {
      type: 'batch_state', batchId: 'land', state: 'LANDING', candidateTree: 'TREE', at: AT,
    })
    h.gh.infos.set(1, prInfo(1, { state: 'MERGED', mergedAt: AT }))
    h.gh.infos.set(2, prInfo(2, { state: 'MERGED', mergedAt: AT }))
    // FakeGit.treeOf returns 'TREE' by default → matches the recorded candidateTree.
    h.daemon.reconcile()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'LANDED' })
    expect(h.daemon.paused()).toBeNull()
  })

  it('pauses and requeues the tail when a LANDING batch crashed mid-partial-landing', () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    appendEvent(h.mqDir, { type: 'batch_created', batchId: 'land', members: [1, 2], at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 1, state: 'LANDING', batchId: 'land', at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 2, state: 'LANDING', batchId: 'land', at: AT })
    appendEvent(h.mqDir, {
      type: 'batch_state', batchId: 'land', state: 'LANDING', candidateTree: 'TREE', at: AT,
    })
    h.gh.infos.set(1, prInfo(1, { state: 'MERGED', mergedAt: AT })) // merged before crash
    h.gh.infos.set(2, prInfo(2))                                    // did not merge
    h.daemon.reconcile()
    expect(h.states()[1]).toBe('LANDED')
    expect(h.states()[2]).toBe('REQUEUED_SPLIT')
    expect(h.daemon.paused()).toMatch(/crash during landing/)
  })

  it('recovers an orphaned mid-flight member even when its batch is already terminal', () => {
    const h = harness()
    h.enqueue(1)
    // Crash after the batch was journaled ABORTED but before the member was
    // transitioned: the in-flight-batch loop never revisits it, so the sweep must.
    appendEvent(h.mqDir, { type: 'batch_created', batchId: 'dead', members: [1], at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 1, state: 'TESTING', batchId: 'dead', at: AT })
    appendEvent(h.mqDir, { type: 'batch_state', batchId: 'dead', state: 'ABORTED', at: AT })
    h.daemon.reconcile()
    expect(h.states()[1]).toBe('REQUEUED_SPLIT')
  })

  it('reaps an orphaned gate group only when the live process still runs the gate command', () => {
    const h = harness({ config: { ...defaultMergeQueueConfig(), gate_command: 'sleep 41.7' } })
    fs.mkdirSync(h.mqDir, { recursive: true })
    const child = spawn('sleep', ['41.7'], { detached: true, stdio: 'ignore' })
    child.unref()
    fs.writeFileSync(path.join(h.mqDir, 'gate.pid'), String(child.pid))
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true) // assert intent, don't really kill
    h.daemon.reconcile()
    expect(killSpy).toHaveBeenCalledWith(-(child.pid as number), 'SIGKILL')
    expect(fs.existsSync(path.join(h.mqDir, 'gate.pid'))).toBe(false)
    killSpy.mockRestore()
    try { process.kill(-(child.pid as number), 'SIGKILL') } catch { /* cleanup */ }
  })

  it('does NOT kill a recycled pid whose process is not our gate (PID-reuse safety)', () => {
    const h = harness({ config: { ...defaultMergeQueueConfig(), gate_command: 'sleep 88.3' } })
    fs.mkdirSync(h.mqDir, { recursive: true })
    const child = spawn('sleep', ['41.7'], { detached: true, stdio: 'ignore' }) // command ≠ gate_command
    child.unref()
    fs.writeFileSync(path.join(h.mqDir, 'gate.pid'), String(child.pid))
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    h.daemon.reconcile()
    expect(killSpy).not.toHaveBeenCalled()                            // command mismatch → left untouched
    expect(fs.existsSync(path.join(h.mqDir, 'gate.pid'))).toBe(false) // stale file still cleared
    killSpy.mockRestore()
    try { process.kill(-(child.pid as number), 'SIGKILL') } catch { /* cleanup */ }
  })
})

describe('MergeQueueDaemon.run', () => {
  it('a cycle error triggers reconcile and propagates on the --once path', async () => {
    const h = harness()
    h.enqueue(1)
    const spy = vi.spyOn(h.daemon, 'reconcile')
    let calls = 0
    h.git.fetchOrigin = () => {
      calls++
      if (calls === 1) throw new Error('network blip')
    }
    await expect(h.daemon.run({ once: true })).rejects.toThrow(/network blip/)
    expect(spy).toHaveBeenCalledTimes(2) // startup + after the cycle error
  })
})
