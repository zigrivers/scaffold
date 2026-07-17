// src/merge-queue/daemon.test.ts
import { describe, expect, it, vi } from 'vitest'
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
  viewPr(pr: number): PrInfo {
    const info = this.infos.get(pr)
    if (!info) throw new Error(`no such PR ${pr}`)
    return info
  }
  squashMerge(pr: number): void {
    if (this.failMerge.has(pr)) throw new Error('boom')
    this.merged.push(pr)
    this.infos.set(pr, { ...this.viewPr(pr), state: 'MERGED', mergedAt: AT })
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

  it('an unviewable PR keeps the daemon idle and is cancelled after 5 consecutive attempts', async () => {
    const h = harness()
    // No gh.infos entry for pr 1 -> viewPr always throws "no such PR 1".
    appendEvent(h.mqDir, { type: 'enqueued', pr: 1, at: AT })
    for (let i = 0; i < 4; i++) {
      expect(await h.daemon.cycle()).toBe('idle')
      expect(h.states()[1]).toBe('QUEUED')
    }
    expect(await h.daemon.cycle()).toBe('idle')
    expect(h.states()[1]).toBe('CANCELLED')
    const entry = reduceState(readJournal(h.mqDir)).entries.get(1)
    expect(entry?.note).toBe('unviewable after 5 attempts — check the PR number and gh auth')
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
})

describe('MergeQueueDaemon.run', () => {
  it('a cycle error triggers reconcile', async () => {
    const h = harness()
    h.enqueue(1)
    const spy = vi.spyOn(h.daemon, 'reconcile')
    let calls = 0
    h.git.fetchOrigin = () => {
      calls++
      if (calls === 1) throw new Error('network blip')
    }
    await h.daemon.run({ once: true })
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
