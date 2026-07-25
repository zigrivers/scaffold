// src/cli/commands/mq.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkSync, lockSync } from 'proper-lockfile'
import yargs from 'yargs'
import mqCommand, { gateTargetResolves, mqHandler } from './mq.js'
import { appendEvent, readJournal } from '../../merge-queue/journal.js'
import { reduceState } from '../../merge-queue/state.js'
import type { BootstrapDeps } from '../../merge-queue/bootstrap.js'
import type { GhClient, PrInfo } from '../../merge-queue/gh.js'
import type { CandidateResult, GitOps } from '../../merge-queue/git.js'
import { defaultMergeQueueConfig } from '../../merge-queue/types.js'

function scratchRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-cli-'))
  execFileSync('git', ['init', '-b', 'main', dir])
  execFileSync('git', ['-C', dir, 'config', 'user.name', 't'])
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t.invalid'])
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x\n')
  execFileSync('git', ['-C', dir, 'add', 'f.txt'])
  execFileSync('git', ['-C', dir, 'commit', '-m', 'base'])
  return dir
}

afterEach(() => {
  delete process.env.MQ_NO_AUTOSTART
})

describe('scaffold mq', () => {
  it('declares the mq command surface (bootstrap included)', () => {
    expect(mqCommand.command).toBe('mq <action>')
  })

  it('parses "mq daemon --root <path>" under strict mode (autostart contract)', async () => {
    // Regression: autostart spawns `mq daemon --root <primary>`. Under the CLI's
    // strict parser an undeclared --root aborts the detached daemon silently.
    let seen: { action?: string; root?: string } = {}
    await yargs(['mq', 'daemon', '--root', '/tmp/x'])
      .command({ ...mqCommand, handler: a => { seen = { action: String(a.action), root: a.root as string } } })
      .strict()
      .fail(false)
      .parseAsync()
    expect(seen).toEqual({ action: 'daemon', root: '/tmp/x' })
  })

  it('enqueue appends a journal event (autostart suppressed)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', pr: 12, root })
    const events = readJournal(path.join(root, '.mq'))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'enqueued', pr: 12 })
  })

  it('enqueue without --pr sets a failure exit code', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', root })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })

  it('eject records CANCELLED for a queued PR', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', pr: 7, root })
    await mqHandler({ action: 'eject', pr: 7, root })
    const events = readJournal(path.join(root, '.mq'))
    expect(events[1]).toMatchObject({ type: 'pr_state', pr: 7, state: 'CANCELLED' })
  })

  it('eject on a PR not in the queue is a no-op (no CANCELLED appended)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'eject', pr: 99, root })
    expect(readJournal(path.join(root, '.mq'))).toHaveLength(0)
  })

  it('eject does not clobber a terminal state (LANDED stays LANDED)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    const mqDir = path.join(root, '.mq')
    await mqHandler({ action: 'enqueue', pr: 5, root })
    appendEvent(mqDir, { type: 'pr_state', pr: 5, state: 'LANDED', at: new Date().toISOString() })
    await mqHandler({ action: 'eject', pr: 5, root })
    expect(reduceState(readJournal(mqDir)).entries.get(5)?.state).toBe('LANDED')
  })

  it('stats runs against an empty queue without throwing', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await expect(mqHandler({ action: 'stats', root })).resolves.toBeUndefined()
  })

  it('daemon returns cleanly when the lock is already held', async () => {
    const root = scratchRepo()
    const mqDir = path.join(root, '.mq')
    fs.mkdirSync(mqDir, { recursive: true })
    const release = lockSync(mqDir, { lockfilePath: path.join(mqDir, 'daemon.lock'), stale: 60_000 })
    try {
      await expect(mqHandler({ action: 'daemon', once: true, root })).resolves.toBeUndefined()
    } finally {
      release()
    }
  })

  it('daemon releases the lock when deps construction throws', async () => {
    const root = scratchRepo()
    const mqDir = path.join(root, '.mq')
    process.env.MQ_GH_CMD = '/nonexistent/gh-binary'
    try {
      await expect(mqHandler({ action: 'daemon', once: true, root })).rejects.toThrow(/gh CLI/)
    } finally {
      delete process.env.MQ_GH_CMD
    }
    expect(checkSync(mqDir, { lockfilePath: path.join(mqDir, 'daemon.lock'), stale: 60_000 })).toBe(false)
  })
})

describe('scaffold mq bootstrap (CLI wiring)', () => {
  function opsYaml(root: string): void {
    fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
    fs.writeFileSync(path.join(root, '.scaffold', 'agent-ops.yaml'), 'project_name: p\n')
  }
  function fakeDeps(root: string): Partial<BootstrapDeps> {
    const gh: GhClient = {
      viewPr: (pr: number): PrInfo => ({
        number: pr, state: 'OPEN', headSha: 'SHA-A', mergedAt: null,
        additions: 0, deletions: 0, title: 't', body: '',
      }),
      squashMerge: (): void => { /* recorded via journal assertions */ },
      mergeCommitSha: (): string | null => 'M1',
      comment: (): void => { /* unused */ },
      listLabeled: (): number[] => [],
      postMergeRed: (): boolean => false,
    }
    const git: GitOps = {
      primaryRoot: () => root,
      defaultBranch: () => 'main',
      fetchOrigin: (): void => { /* no-op */ },
      originHeadSha: () => 'BASE',
      treeOf: () => 'TREE',
      ensureGateWorktree: () => path.join(root, '.mq', 'gate'),
      checkoutDetachedInGate: () => path.join(root, '.mq', 'gate'),
      syncPrimaryToMerge: (): void => { /* no-op */ },
      constructCandidate: (): CandidateResult => { throw new Error('unused') },
      deleteCandidate: (): void => { /* unused */ },
      listCandidateRefs: (): string[] => [],
    }
    return {
      gh, git,
      runGate: () => ({ result: 'green' as const, seconds: 1, logPath: '/dev/null', failedTests: [] }),
      // The fake git returns .mq/gate as the gated tree, which holds no assets —
      // stub the gated-tree seams so preflight passes without scaffolding one.
      readMergeConfig: () => defaultMergeQueueConfig(),
      verifyGatedAssets: () => ({ ok: true, missing: [] }),
      armHooks: () => ({ messages: [] }),
      armSched: () => ({ ok: true, messages: [] }),
      smokeDaemon: () => ({ ok: true, detail: 'clean' }),
      runDoctor: null,
      gateTargetResolves: () => true,
      newId: () => '01TEST',
    }
  }
  it('bootstrap journals intent → merged → armed and exits 0', async () => {
    const root = scratchRepo()
    opsYaml(root)
    await mqHandler({ action: 'bootstrap', pr: 41, root }, { bootstrapDeps: fakeDeps(root) })
    const types = readJournal(path.join(root, '.mq')).map(e => e.type)
    expect(types).toEqual(['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'])
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
  it('bootstrap --finish with no attempt exits 1', async () => {
    const root = scratchRepo()
    opsYaml(root)
    await mqHandler({ action: 'bootstrap', pr: 41, finish: true, root }, { bootstrapDeps: fakeDeps(root) })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('bootstrap without --pr exits 1', async () => {
    const root = scratchRepo()
    await mqHandler({ action: 'bootstrap', root })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('parses "mq bootstrap --pr 7 --finish" under strict mode', async () => {
    let seen: { action?: string; pr?: number; finish?: boolean } = {}
    await yargs(['mq', 'bootstrap', '--pr', '7', '--finish'])
      .command({
        ...mqCommand,
        handler: a => {
          seen = { action: String(a.action), pr: a.pr as number, finish: a.finish as boolean }
        },
      })
      .strict()
      .fail(false)
      .parseAsync()
    expect(seen).toEqual({ action: 'bootstrap', pr: 7, finish: true })
  })
})

describe('gateTargetResolves (security: no shell injection via the command string)', () => {
  it('does not execute shell metacharacters in the command — a $(...) payload never runs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-gate-inj-'))
    const marker = path.join(root, 'PWNED')
    // If exe[0] were interpolated into `bash -c`, this substitution would run
    // `touch PWNED` and create the file. With the quoted-positional fix, bash
    // looks for a command literally named "$(touch …)x" — not found, no exec.
    const payload = `$(touch ${marker})x`
    expect(gateTargetResolves(root, payload)).toBe(false)
    expect(fs.existsSync(marker)).toBe(false)
    // A `;` chained payload likewise never reaches the shell as syntax.
    expect(gateTargetResolves(root, `foo;touch ${marker}`)).toBe(false)
    expect(fs.existsSync(marker)).toBe(false)
  })
  it('still resolves a real executable on PATH (true) and a missing one (false)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-gate-ok-'))
    expect(gateTargetResolves(root, 'bash --version')).toBe(true)
    expect(gateTargetResolves(root, 'definitely-not-a-real-cmd-xyz')).toBe(false)
  })
  it('resolves the head executable past a quoted-space env prefix (quote-aware split)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-gate-q-'))
    // A strict whitespace split would tokenize "FOO='bar" / "baz'" and mis-read
    // the executable; quote-aware parsing keeps the env value one token and
    // finds `bash`.
    expect(gateTargetResolves(root, 'FOO=\'bar baz\' bash --version')).toBe(true)
  })
})
