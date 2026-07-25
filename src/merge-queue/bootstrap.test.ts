import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  latestAttemptFor, planResume, reduceBootstrapAttempts, runBootstrap, type BootstrapDeps,
} from './bootstrap.js'
import { appendEvent, readJournal } from './journal.js'
import { reduceState } from './state.js'
import { defaultMergeQueueConfig } from './types.js'
import type { JournalEvent } from './types.js'
import type { GhClient, PrInfo } from './gh.js'
import type { CandidateResult, GitOps } from './git.js'
import type { GateResult } from './gate.js'

const T1 = '2026-07-19T10:00:00.000Z'
const T2 = '2026-07-19T10:01:00.000Z'
const T3 = '2026-07-19T10:02:00.000Z'

function intent(id: string, pr = 41, sha = 'SHA-A', at = T1): JournalEvent {
  return { type: 'bootstrap_intent', bootstrapId: id, pr, gatedHeadSha: sha, at }
}
function merged(id: string, pr = 41, sha = 'SHA-A', mergeSha = 'M1', at = T2): JournalEvent {
  return { type: 'bootstrap_merged', bootstrapId: id, pr, gatedHeadSha: sha, mergeCommitSha: mergeSha, at }
}
function armed(id: string, pr = 41, sha = 'SHA-A', at = T3): JournalEvent {
  return { type: 'bootstrap_armed', bootstrapId: id, pr, gatedHeadSha: sha, at }
}

describe('reduceBootstrapAttempts (D9 state machine)', () => {
  it('folds intent → merged → armed per id, carrying pr, gated SHA, and merge SHA', () => {
    const attempts = reduceBootstrapAttempts([intent('01A'), merged('01A'), armed('01A')])
    expect(attempts.get('01A')).toEqual({
      bootstrapId: '01A', pr: 41, gatedHeadSha: 'SHA-A',
      mergeCommitSha: 'M1', stage: 'armed', at: T3,
    })
  })
  it('an intent-only id stays at stage intent with no merge SHA', () => {
    const a = reduceBootstrapAttempts([intent('01A')]).get('01A')
    expect(a?.stage).toBe('intent')
    expect(a?.mergeCommitSha).toBeNull()
  })
  it('keeps attempts for different ids separate (a stale attempt can never arm a new one)', () => {
    const attempts = reduceBootstrapAttempts([
      intent('01A', 41, 'SHA-A'), // aborted attempt: intent only
      intent('01B', 41, 'SHA-B', T2), merged('01B', 41, 'SHA-B', 'M2', T3),
    ])
    expect(attempts.get('01A')?.stage).toBe('intent')
    expect(attempts.get('01B')?.stage).toBe('merged')
  })
  it('latestAttemptFor picks the newest id for the PR (ULIDs sort lexicographically)', () => {
    const events = [intent('01A'), armed('01A'), intent('01B', 41, 'SHA-B', T2)]
    expect(latestAttemptFor(events, 41)?.bootstrapId).toBe('01B')
    expect(latestAttemptFor(events, 99)).toBeNull()
  })
})

describe('planResume (GitHub-authoritative reconciliation, D9)', () => {
  const base = {
    bootstrapId: '01A', pr: 41, gatedHeadSha: 'SHA-A',
    mergeCommitSha: null as string | null, stage: 'intent' as const, at: T1,
  }
  it('no attempt ⇒ fresh', () => {
    expect(planResume(null, { state: 'OPEN', headSha: 'SHA-A' })).toEqual({ kind: 'fresh' })
  })
  it('armed attempt ⇒ complete (idempotent no-op)', () => {
    const a = { ...base, stage: 'armed' as const }
    expect(planResume(a, { state: 'MERGED', headSha: 'SHA-A' }).kind).toBe('complete')
  })
  it('merged-without-armed ⇒ arm-and-verify (exactly what --finish surfaces)', () => {
    const a = { ...base, stage: 'merged' as const, mergeCommitSha: 'M1' }
    expect(planResume(a, { state: 'MERGED', headSha: 'SHA-A' }).kind).toBe('arm-and-verify')
  })
  it('intent + GitHub MERGED ⇒ record-merge-then-arm (crash window; never re-merge)', () => {
    expect(planResume(base, { state: 'MERGED', headSha: 'SHA-A' }).kind).toBe('record-merge-then-arm')
  })
  it('intent + OPEN + head unchanged ⇒ rerun-merge under the SAME id', () => {
    expect(planResume(base, { state: 'OPEN', headSha: 'SHA-A' }).kind).toBe('rerun-merge')
  })
  it('intent + OPEN + head moved ⇒ aborted (terminal for the id; retry opens a new id)', () => {
    const d = planResume(base, { state: 'OPEN', headSha: 'SHA-NEW' })
    expect(d.kind).toBe('aborted')
    if (d.kind === 'aborted') expect(d.reason).toMatch(/head moved/)
  })
  it('intent + CLOSED ⇒ aborted', () => {
    expect(planResume(base, { state: 'CLOSED', headSha: 'SHA-A' }).kind).toBe('aborted')
  })
})

describe('journal compatibility', () => {
  it('reduceState ignores bootstrap events (queue state is unaffected)', () => {
    const events: JournalEvent[] = [
      { type: 'enqueued', pr: 7, at: T1 },
      intent('01A'), merged('01A'), armed('01A'),
    ]
    const state = reduceState(events)
    expect(state.entries.get(7)?.state).toBe('QUEUED')
    expect(state.entries.size).toBe(1)
  })
})

function makeGh(script: {
  states?: PrInfo['state'][]
  heads?: string[]
  mergeSha?: string | null
}): GhClient & { merged: { pr: number; expectedHead?: string }[] } {
  const states = [...(script.states ?? ['OPEN'])]
  const heads = [...(script.heads ?? ['SHA-A'])]
  const next = <T>(arr: T[]): T => (arr.length > 1 ? arr.shift() as T : arr[0])
  const gh = {
    merged: [] as { pr: number; expectedHead?: string }[],
    viewPr(pr: number): PrInfo {
      return {
        number: pr, state: next(states), headSha: next(heads), mergedAt: null,
        additions: 0, deletions: 0, title: 't', body: '',
      }
    },
    squashMerge(pr: number, expectedHead?: string): void {
      gh.merged.push({ pr, expectedHead })
    },
    mergeCommitSha: (): string | null => script.mergeSha === undefined ? 'MERGESHA' : script.mergeSha,
    comment(): void { /* unused */ },
    listLabeled: (): number[] => [],
    postMergeRed: (): boolean => false,
  }
  return gh
}

function makeGit(root: string): GitOps & { checkouts: string[] } {
  const g = {
    checkouts: [] as string[],
    primaryRoot: (): string => root,
    defaultBranch: (): string => 'main',
    fetchOrigin(): void { /* no-op */ },
    originHeadSha: (): string => 'BASE',
    treeOf: (): string => 'TREE',
    ensureGateWorktree: (): string => path.join(root, '.mq', 'gate'),
    checkoutDetachedInGate(sha: string): string {
      g.checkouts.push(sha)
      return path.join(root, '.mq', 'gate')
    },
    syncPrimaryToMerge(sha: string): void { g.checkouts.push(`sync:${sha}`) },
    constructCandidate(): CandidateResult { throw new Error('not used by bootstrap') },
    deleteCandidate(): void { /* unused */ },
    listCandidateRefs: (): string[] => [],
  }
  return g
}

interface Recorded {
  hooksArmed: number
  schedArmed: number
  smoked: number
  gates: string[]
}

function makeDeps(root: string, over: Partial<BootstrapDeps> = {}): { deps: BootstrapDeps; rec: Recorded } {
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(root, '.scaffold', 'agent-ops.yaml'), 'project_name: p\n')
  const rec: Recorded = { hooksArmed: 0, schedArmed: 0, smoked: 0, gates: [] }
  const ids = ['01A', '01B', '01C']
  const green: GateResult = { result: 'green', seconds: 3, logPath: '/dev/null', failedTests: [] }
  const deps: BootstrapDeps = {
    gh: makeGh({}),
    git: makeGit(root),
    runGate: opts => {
      rec.gates.push(opts.command)
      return green
    },
    config: defaultMergeQueueConfig(),
    mqDir: path.join(root, '.mq'),
    projectRoot: root,
    armHooks: () => {
      rec.hooksArmed += 1
      return { messages: ['hooks: registered PreToolUse: scripts/mq-guard.sh (merge-queue routing guard)'] }
    },
    armSched: () => {
      rec.schedArmed += 1
      return { ok: true, messages: ['sched: verified loaded'] }
    },
    smokeDaemon: () => {
      rec.smoked += 1
      return { ok: true, detail: 'mq daemon --once cycle completed clean' }
    },
    runDoctor: () => ({ exitCode: 0, summary: 'healthy' }),
    gateTargetResolves: () => true,
    log: () => { /* silent */ },
    now: () => new Date('2026-07-19T12:00:00.000Z'),
    sleep: async () => { /* no-op — merge-SHA backoff runs instantly in tests */ },
    newId: () => ids.shift() ?? '01Z',
    ...over,
  }
  return { deps, rec }
}

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-bootstrap-'))
}

describe('runBootstrap (D9 engine)', () => {
  it('happy path: gate on head, arm-first, then intent → merge(match-head) → merged → armed', async () => {
    const root = tmpRoot()
    const gh = makeGh({})
    const { deps, rec } = makeDeps(root, { gh })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(true)
    expect(out.stage).toBe('complete')
    expect(out.bootstrapId).toBe('01A')
    expect(rec.gates).toEqual([deps.config.full_gate_command]) // FULL gate in preflight
    // 'SHA-A' from preflight's checkoutDetachedInGate; 'sync:MERGESHA' from
    // verifyAndArm's post-merge syncPrimaryToMerge (D9: fast-forward primary
    // to the merge commit BEFORE arming the scheduler — see git.ts).
    expect(deps.git as ReturnType<typeof makeGit>).toMatchObject({ checkouts: ['SHA-A', 'sync:MERGESHA'] })
    expect(rec.hooksArmed).toBe(1)
    expect(rec.schedArmed).toBe(1)
    expect(gh.merged).toEqual([{ pr: 41, expectedHead: 'SHA-A' }])
    const events = readJournal(deps.mqDir)
    expect(events.map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'])
    expect(events.every(e => 'bootstrapId' in e && e.bootstrapId === '01A')).toBe(true)
    expect(events.every(e => 'gatedHeadSha' in e && e.gatedHeadSha === 'SHA-A')).toBe(true)
    expect(events[1]).toMatchObject({ mergeCommitSha: 'MERGESHA', pr: 41 })
  })
  it(
    'armHooks dirty-tree race (fix): hooks arm AFTER syncPrimaryToMerge, never before, even ' +
      'when the gated PR tree itself modifies .claude/settings.json — reaches bootstrap_armed clean',
    async () => {
      const root = tmpRoot()
      const order: string[] = []
      const git = makeGit(root)
      const realSync = git.syncPrimaryToMerge
      git.syncPrimaryToMerge = (sha: string): void => {
        order.push('sync')
        realSync(sha)
      }
      const { deps, rec } = makeDeps(root, {
        git,
        // Simulates the gated PR's tree having modified .claude/settings.json:
        // armHooks still runs (idempotent deep-merge), but only after sync.
        armHooks: () => {
          order.push('armHooks')
          rec.hooksArmed += 1
          return { messages: ['hooks: registered PreToolUse: scripts/mq-guard.sh (merge-queue routing guard)'] }
        },
      })
      const out = await runBootstrap(deps, { pr: 41 })
      expect(out.ok).toBe(true)
      expect(out.stage).toBe('complete')
      // The race this test guards: hooks must never arm before the ff-only sync
      // — arming pre-merge would dirty primary and could abort the sync if the
      // PR also commits .claude/settings.json.
      expect(order).toEqual(['sync', 'armHooks'])
      expect(rec.hooksArmed).toBe(1)
      const events = readJournal(deps.mqDir)
      expect(events.map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'])
    },
  )
  it(
    'a syncPrimaryToMerge failure (e.g. primary dirty because the PR also commits ' +
      '.claude/settings.json) degrades gracefully instead of throwing uncaught',
    async () => {
      const root = tmpRoot()
      const git = makeGit(root)
      git.syncPrimaryToMerge = (): void => {
        throw new Error(
          'fatal: Your local changes to the following files would be overwritten by merge:\n'
            + '\t.claude/settings.json',
        )
      }
      const { deps, rec } = makeDeps(root, { git })
      const out = await runBootstrap(deps, { pr: 41 })
      expect(out.ok).toBe(false)
      expect(out.stage).toBe('arm')
      expect(out.messages.join('\n')).toMatch(/could not be fast-forwarded/)
      expect(out.messages.join('\n')).toMatch(/reconcile the primary worktree/)
      expect(out.messages.join('\n')).toMatch(/--finish/)
      // Never arm hooks against a primary that failed to sync.
      expect(rec.hooksArmed).toBe(0)
      expect(rec.schedArmed).toBe(0)
      // The merge itself is still recorded — no data loss, just an unarmed pause.
      const events = readJournal(deps.mqDir)
      expect(events.map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged'])
    },
  )
  it(
    'an armHooks failure (e.g. malformed .claude/settings.json in the merged tree) degrades ' +
      'gracefully to a recoverable --finish instead of throwing uncaught',
    async () => {
      const root = tmpRoot()
      const { deps, rec } = makeDeps(root, {
        armHooks: (): { messages: string[] } => {
          throw new Error('.claude/settings.json is not a JSON object — refusing to modify it')
        },
      })
      const out = await runBootstrap(deps, { pr: 41 })
      expect(out.ok).toBe(false)
      expect(out.stage).toBe('arm')
      expect(out.messages.join('\n')).toMatch(/hooks were NOT registered/)
      expect(out.messages.join('\n')).toMatch(/--finish/)
      // Scheduler is never armed after a hooks failure.
      expect(rec.schedArmed).toBe(0)
      // The merge is still recorded (armHooks runs after the SHA is journaled).
      const events = readJournal(deps.mqDir)
      expect(events.map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged'])
    },
  )
  it(
    'an armSched failure (e.g. malformed .scaffold/agent-ops.yaml in the merged tree) degrades ' +
      'gracefully to a recoverable --finish instead of throwing uncaught',
    async () => {
      const root = tmpRoot()
      const { deps, rec } = makeDeps(root, {
        armSched: (): { ok: boolean; messages: string[] } => {
          throw new Error('agent-ops config: invalid YAML — refusing to arm')
        },
      })
      const out = await runBootstrap(deps, { pr: 41 })
      expect(out.ok).toBe(false)
      expect(out.stage).toBe('arm')
      expect(out.messages.join('\n')).toMatch(/scheduler was NOT armed/)
      expect(out.messages.join('\n')).toMatch(/--finish/)
      // Hooks armed (they run before sched) but the daemon smoke never ran.
      expect(rec.hooksArmed).toBe(1)
      expect(rec.smoked).toBe(0)
      // The merge is still recorded (armSched runs after the SHA is journaled).
      const events = readJournal(deps.mqDir)
      expect(events.map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged'])
    },
  )
  it(
    'a squashMerge failure (network/auth/PR-state) degrades to stage:merge + --finish, never an uncaught crash',
    async () => {
      const root = tmpRoot()
      const gh = makeGh({})
      gh.squashMerge = (): void => { throw new Error('gh: could not merge (HTTP 502)') }
      const { deps, rec } = makeDeps(root, { gh })
      const out = await runBootstrap(deps, { pr: 41 })
      expect(out.ok).toBe(false)
      expect(out.stage).toBe('merge')
      expect(out.messages.join('\n')).toMatch(/did not complete/)
      expect(out.messages.join('\n')).toMatch(/--finish/)
      // Only the intent is journaled — nothing merged or armed.
      expect(readJournal(deps.mqDir).map(e => e.type)).toEqual(['bootstrap_intent'])
      expect(rec.hooksArmed).toBe(0)
      expect(rec.schedArmed).toBe(0)
    },
  )
  it(
    'a preflight infra failure (e.g. fetchOrigin network error) degrades to stage:preflight, journals nothing',
    async () => {
      const root = tmpRoot()
      const git = makeGit(root)
      git.fetchOrigin = (): void => { throw new Error('git: could not fetch origin (network)') }
      const { deps } = makeDeps(root, { git })
      const out = await runBootstrap(deps, { pr: 41 })
      expect(out.ok).toBe(false)
      expect(out.stage).toBe('preflight')
      expect(out.messages.join('\n')).toMatch(/preflight failed/)
      expect(out.messages.join('\n')).toMatch(/re-run/)
      // Preflight is pre-journaling — nothing is written.
      expect(readJournal(deps.mqDir)).toEqual([])
    },
  )
  it('aborts when the head moves between intent and merge — id terminal, retry uses a new id', async () => {
    const root = tmpRoot()
    // viewPr call 1 (reconcile+preflight): SHA-A; call 2 (revalidation): SHA-NEW.
    const gh = makeGh({ heads: ['SHA-A', 'SHA-NEW'] })
    const { deps } = makeDeps(root, { gh })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(false)
    expect(out.stage).toBe('aborted')
    expect(gh.merged).toEqual([])
    expect(readJournal(deps.mqDir).map(e => e.type)).toEqual(['bootstrap_intent'])
    // Retry: fresh gh (head settled at SHA-NEW) reuses the journal — new id 01B.
    const { deps: deps2 } = makeDeps(root, {
      gh: makeGh({ heads: ['SHA-NEW'] }),
      newId: () => '01B',
    })
    const out2 = await runBootstrap(deps2, { pr: 41 })
    expect(out2.ok).toBe(true)
    expect(out2.bootstrapId).toBe('01B')
    const intents = readJournal(deps.mqDir).filter(e => e.type === 'bootstrap_intent')
    expect(intents.map(e => (e as { bootstrapId: string }).bootstrapId)).toEqual(['01A', '01B'])
  })
  it('crash window: intent journaled, GitHub reports MERGED ⇒ records retroactively, never re-merges', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root)
    appendEvent(deps.mqDir, {
      type: 'bootstrap_intent', bootstrapId: '00X', pr: 41,
      gatedHeadSha: 'SHA-A', at: '2026-07-19T11:00:00.000Z',
    })
    const gh = makeGh({ states: ['MERGED'], mergeSha: 'RECOVERED' })
    const { deps: resumed, rec } = makeDeps(root, { gh })
    const out = await runBootstrap(resumed, { pr: 41 })
    expect(out.ok).toBe(true)
    expect(out.bootstrapId).toBe('00X')
    expect(gh.merged).toEqual([]) // never re-merged
    const events = readJournal(deps.mqDir)
    expect(events.map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'])
    expect(events[1]).toMatchObject({ bootstrapId: '00X', mergeCommitSha: 'RECOVERED' })
    expect(rec.hooksArmed).toBe(1) // idempotent re-arm on resume
  })
  it('--finish completes a merged-without-armed attempt without re-merging', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root)
    appendEvent(deps.mqDir, {
      type: 'bootstrap_intent', bootstrapId: '00X', pr: 41,
      gatedHeadSha: 'SHA-A', at: '2026-07-19T11:00:00.000Z',
    })
    appendEvent(deps.mqDir, {
      type: 'bootstrap_merged', bootstrapId: '00X', pr: 41,
      gatedHeadSha: 'SHA-A', mergeCommitSha: 'M1', at: '2026-07-19T11:00:01.000Z',
    })
    const gh = makeGh({ states: ['MERGED'] })
    const { deps: resumed, rec } = makeDeps(root, { gh })
    const out = await runBootstrap(resumed, { pr: 41, finish: true })
    expect(out.ok).toBe(true)
    expect(out.stage).toBe('complete')
    expect(gh.merged).toEqual([])
    expect(rec.smoked).toBe(1)
    expect(readJournal(deps.mqDir).at(-1)).toMatchObject({ type: 'bootstrap_armed', bootstrapId: '00X' })
  })
  it('--finish with no unfinished attempt fails without side effects', async () => {
    const root = tmpRoot()
    const { deps, rec } = makeDeps(root)
    const out = await runBootstrap(deps, { pr: 41, finish: true })
    expect(out.ok).toBe(false)
    expect(rec.hooksArmed).toBe(0)
    expect(readJournal(deps.mqDir)).toEqual([])
  })
  it('a red preflight gate stops before arming or journaling anything', async () => {
    const root = tmpRoot()
    const red: GateResult = { result: 'red', seconds: 9, logPath: '/tmp/log', failedTests: [] }
    const { deps, rec } = makeDeps(root, { runGate: () => red })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(false)
    expect(out.stage).toBe('preflight')
    expect(rec.hooksArmed).toBe(0)
    expect(readJournal(deps.mqDir)).toEqual([])
  })
  it('unresolvable gate targets fail preflight with the gate-component remediation', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root, { gateTargetResolves: () => false })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(false)
    expect(out.messages.join('\n')).toMatch(/agent-ops install --component gate/)
  })
  it('a PR that does not commit the queue assets in its gated tree fails preflight before arming', async () => {
    const root = tmpRoot()
    // The first queue-installing PR must COMMIT its assets so they land at merge;
    // verifyGatedAssets checks the GATED tree, never primary. A PR that leaves
    // them out (uncommitted post-gate mutation) is rejected before any arming.
    const { deps, rec } = makeDeps(root, {
      verifyGatedAssets: () => ({ ok: false, missing: ['scripts/mq-guard.sh', 'scripts/ops/post-merge-poller.sh'] }),
    })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(false)
    expect(out.stage).toBe('preflight')
    expect(out.messages.join('\n')).toMatch(/does not install the queue/)
    expect(rec.hooksArmed).toBe(0)
    expect(readJournal(deps.mqDir)).toEqual([])
  })
  it('a failed daemon smoke leaves merged-without-armed and points at --finish', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root, { smokeDaemon: () => ({ ok: false, detail: 'exited 1' }) })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(false)
    expect(out.stage).toBe('verify')
    expect(out.messages.join('\n')).toMatch(/--finish/)
    expect(readJournal(deps.mqDir).map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged'])
  })
  it(
    'never journals an empty merge SHA — stops when GitHub has not exposed the commit, ' +
      'and resume reconciles',
    async () => {
      const root = tmpRoot()
      // Merge succeeds but GitHub has not exposed the merge commit SHA yet.
      const { deps } = makeDeps(root, { gh: makeGh({ mergeSha: null }) })
      const out = await runBootstrap(deps, { pr: 41 })
      expect(out.ok).toBe(false)
      expect(out.stage).toBe('merge')
      expect(out.messages.join('\n')).toMatch(/--finish/)
      // The journal must NOT carry a bootstrap_merged with an empty SHA.
      expect(readJournal(deps.mqDir).map(e => e.type)).toEqual(['bootstrap_intent'])
      // Resume once GitHub exposes the SHA: intent-without-merged + MERGED ⇒
      // record-merge-then-arm records the real SHA, then arms.
      const { deps: resumed } = makeDeps(root, {
        gh: makeGh({ states: ['MERGED'], mergeSha: 'LATE-SHA' }),
      })
      const out2 = await runBootstrap(resumed, { pr: 41, finish: true })
      expect(out2.ok).toBe(true)
      const events = readJournal(deps.mqDir)
      expect(events.map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'])
      expect(events[1]).toMatchObject({ mergeCommitSha: 'LATE-SHA', pr: 41 })
    })
  it('an armed attempt is a clean no-op', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root)
    for (const type of ['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'] as const) {
      appendEvent(deps.mqDir, {
        type, bootstrapId: '00X', pr: 41, gatedHeadSha: 'SHA-A',
        ...(type === 'bootstrap_merged' ? { mergeCommitSha: 'M1' } : {}),
        at: '2026-07-19T11:00:00.000Z',
      } as never)
    }
    const { deps: again, rec } = makeDeps(root, { gh: makeGh({ states: ['MERGED'] }) })
    const out = await runBootstrap(again, { pr: 41 })
    expect(out.ok).toBe(true)
    expect(rec.hooksArmed).toBe(0)
    expect(readJournal(deps.mqDir)).toHaveLength(3)
  })
})
