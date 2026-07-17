import { afterAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MergeQueueDaemon, type DaemonDeps } from '../src/merge-queue/daemon.js'
import { appendEvent, readJournal } from '../src/merge-queue/journal.js'
import { reduceState } from '../src/merge-queue/state.js'
import { defaultMergeQueueConfig } from '../src/merge-queue/types.js'
import { createGhClient } from '../src/merge-queue/gh.js'
import { createGitOps } from '../src/merge-queue/git.js'
import { runGate } from '../src/merge-queue/gate.js'

const GH_STUB = `#!/usr/bin/env python3
"""gh stub for merge-queue e2e: registry-backed, lands squashes on a real bare origin."""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, 'prs.json')
ORIGIN = os.path.join(HERE, 'origin.git')

def load(): return json.load(open(REG))
def save(reg): json.dump(reg, open(REG, 'w'))
def sh(args, cwd=None): return subprocess.check_output(args, cwd=cwd, text=True).strip()

args = sys.argv[1:]

if args[:2] == ['pr', 'view']:
    pr = load()[args[2]]
    print(json.dumps({
        'number': int(args[2]), 'state': pr['state'], 'headRefOid': pr['headSha'],
        'mergedAt': pr['mergedAt'], 'additions': 1, 'deletions': 0,
        'title': pr['branch'], 'body': pr.get('body', ''),
    }))
elif args[:2] == ['pr', 'merge']:
    num = args[2]
    reg = load()
    pr = reg[num]
    work = os.path.join(HERE, 'land-' + num)
    sh(['git', 'clone', '-q', ORIGIN, work])
    sh(['git', '-C', work, 'config', 'user.name', 'gh-stub'])
    sh(['git', '-C', work, 'config', 'user.email', 'stub@test.invalid'])
    sh(['git', '-C', work, 'merge', '--squash', 'origin/' + pr['branch']])
    sh(['git', '-C', work, 'commit', '-q', '-m', pr['branch'] + ' (#' + num + ')'])
    sh(['git', '-C', work, 'push', '-q', 'origin', 'HEAD'])
    pr['state'] = 'MERGED'
    pr['mergedAt'] = '2026-07-17T00:00:00Z'
    save(reg)
elif args[:2] == ['pr', 'comment']:
    with open(os.path.join(HERE, 'comments.log'), 'a') as f:
        f.write(args[2] + ': ' + args[args.index('--body') + 1] + '\\n')
elif args[:2] == ['pr', 'list']:
    print('[]')
elif args[:2] == ['run', 'list']:
    sys.exit(1)  # no workflows -> postMergeRed() treats as green
else:
    sys.exit(1)
`

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

// Every buildWorld() temp root, torn down in afterAll so runs don't leak the
// MQ_GH_CMD override or accumulate mq-e2e-* directories on disk.
const worldRoots: string[] = []
afterAll(() => {
  delete process.env.MQ_GH_CMD
  for (const root of worldRoots) fs.rmSync(root, { recursive: true, force: true })
})

interface World {
  clone: string
  stubDir: string
  deps: DaemonDeps
  daemon: MergeQueueDaemon
  mqDir: string
  registerPr(num: number, branch: string, file: string): void
  enqueue(num: number): void
  originFiles(): string
  states(): Record<string, string>
}

function buildWorld(gateCommand: string): World {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-e2e-'))
  worldRoots.push(dir)
  const stubDir = path.join(dir, 'stub')
  fs.mkdirSync(stubDir)
  const origin = path.join(stubDir, 'origin.git')
  const clone = path.join(dir, 'clone')
  execFileSync('git', ['init', '--bare', '-b', 'main', origin])
  execFileSync('git', ['clone', origin, clone], { stdio: 'ignore' })
  sh(clone, 'config', 'user.name', 'e2e')
  sh(clone, 'config', 'user.email', 'e2e@test.invalid')
  fs.writeFileSync(path.join(clone, 'base.txt'), 'base\n')
  sh(clone, 'add', 'base.txt')
  sh(clone, 'commit', '-m', 'base')
  sh(clone, 'push', '-u', 'origin', 'main')
  sh(clone, 'remote', 'set-head', 'origin', 'main')

  const stub = path.join(stubDir, 'gh')
  fs.writeFileSync(stub, GH_STUB)
  fs.chmodSync(stub, 0o755)
  fs.writeFileSync(path.join(stubDir, 'prs.json'), '{}')
  process.env.MQ_GH_CMD = stub

  const mqDir = path.join(clone, '.mq')
  const deps: DaemonDeps = {
    gh: createGhClient(clone),
    git: createGitOps(clone),
    runGate,
    config: { ...defaultMergeQueueConfig(), gate_command: gateCommand, gate_timeout_minutes: 1 },
    mqDir,
    projectRoot: clone,
    log: () => {},
    now: () => new Date(),
  }
  return {
    clone, stubDir, deps, mqDir,
    daemon: new MergeQueueDaemon(deps),
    registerPr(num, branch, file) {
      sh(clone, 'checkout', '-b', branch, 'origin/main')
      fs.writeFileSync(path.join(clone, file), `${branch}\n`)
      sh(clone, 'add', file)
      sh(clone, 'commit', '-m', branch)
      sh(clone, 'push', '-u', 'origin', branch)
      const headSha = sh(clone, 'rev-parse', 'HEAD')
      sh(clone, 'checkout', 'main')
      const reg = JSON.parse(fs.readFileSync(path.join(stubDir, 'prs.json'), 'utf8'))
      reg[String(num)] = { branch, headSha, state: 'OPEN', mergedAt: null, body: '' }
      fs.writeFileSync(path.join(stubDir, 'prs.json'), JSON.stringify(reg))
    },
    enqueue(num) {
      appendEvent(mqDir, { type: 'enqueued', pr: num, at: new Date().toISOString() })
    },
    originFiles() {
      sh(clone, 'fetch', 'origin')
      return sh(clone, 'ls-tree', '--name-only', 'origin/main')
    },
    states() {
      const s = reduceState(readJournal(mqDir))
      return Object.fromEntries([...s.entries.values()].map(e => [String(e.pr), e.state]))
    },
  }
}

describe('merge-queue e2e', () => {
  it('lands a two-PR batch on the real origin and the NRS check holds', { timeout: 60_000 }, async () => {
    const w = buildWorld('true')
    w.registerPr(1, 'pr-a', 'a.txt')
    w.registerPr(2, 'pr-b', 'b.txt')
    w.enqueue(1)
    w.enqueue(2)
    expect(await w.daemon.cycle()).toBe('worked')
    expect(w.states()).toEqual({ '1': 'LANDED', '2': 'LANDED' })
    expect(w.originFiles()).toContain('a.txt')
    expect(w.originFiles()).toContain('b.txt')
    expect(w.daemon.paused()).toBeNull() // real squash trees matched — the offline Spike-1 twin
  })

  it('ejects a red singleton and comments the log path', { timeout: 60_000 }, async () => {
    const w = buildWorld('exit 1')
    w.registerPr(1, 'pr-red', 'r.txt')
    w.enqueue(1)
    await w.daemon.cycle()
    expect(w.states()).toEqual({ '1': 'EJECTED' })
    const comments = fs.readFileSync(path.join(w.stubDir, 'comments.log'), 'utf8')
    expect(comments).toContain('EJECTED')
  })

  it('recovers a dead in-flight batch on reconcile', { timeout: 60_000 }, async () => {
    const w = buildWorld('true')
    w.registerPr(1, 'pr-crash', 'c.txt')
    w.enqueue(1)
    const at = new Date().toISOString()
    appendEvent(w.mqDir, { type: 'batch_created', batchId: 'dead', members: [1], at })
    appendEvent(w.mqDir, { type: 'pr_state', pr: 1, state: 'TESTING', batchId: 'dead', at })
    appendEvent(w.mqDir, { type: 'batch_state', batchId: 'dead', state: 'RUNNING', at })
    w.daemon.reconcile()
    expect(w.states()).toEqual({ '1': 'REQUEUED_SPLIT' })
    // and the next cycle lands it
    expect(await w.daemon.cycle()).toBe('worked')
    expect(w.states()).toEqual({ '1': 'LANDED' })
  })
})
