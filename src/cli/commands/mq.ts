// src/cli/commands/mq.ts
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { ulid } from 'ulid'
import { checkSync, lock } from 'proper-lockfile'
import type { Argv, CommandModule } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadAgentOpsConfig } from '../../core/agent-ops/config.js'
import { parseShell } from '../../core/parse-shell.js'
import { GATE_PID_FILE, MergeQueueDaemon, PAUSED_FILE } from '../../merge-queue/daemon.js'
import { appendEvent, readJournal } from '../../merge-queue/journal.js'
import { reduceState, TERMINAL_PR_STATES } from '../../merge-queue/state.js'
import { computeStats } from '../../merge-queue/stats.js'
import { createGhClient } from '../../merge-queue/gh.js'
import { createGitOps } from '../../merge-queue/git.js'
import { runGate } from '../../merge-queue/gate.js'
import { runBootstrap, type BootstrapDeps } from '../../merge-queue/bootstrap.js'
import { installHooks } from '../../core/hooks/install.js'
import { pickSchedBackend } from '../../sched/platform.js'
import { buildPostMergePollerJob } from '../../sched/jobs.js'
import {
  fullGateKey, hashFileOrAbsent, lookupGateCache, recordGateCache,
} from '../../merge-queue/gate-cache.js'

export interface MqArgs {
  action: string
  pr?: number
  foreground?: boolean
  finish?: boolean
  once?: boolean
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
  checkTree?: string
  recordTree?: string
  seconds?: number
  instrumented?: boolean
}

export interface MqOverrides {
  /** Test seam for `mq bootstrap` — any subset of BootstrapDeps. */
  bootstrapDeps?: Partial<BootstrapDeps>
}

/** Preflight helper (D9): does the configured gate command RESOLVE?
 *  `make -n` for make targets (proves resolution, not health — doctor's
 *  GATE_PROBE covers health); `command -v` on the head word otherwise.
 *  Leading `VAR=value` env assignments (e.g. `NODE_ENV=test vitest`) are
 *  skipped so the real executable is resolved, not the assignment. */
export function gateTargetResolves(projectRoot: string, command: string): boolean {
  // Quote-aware tokenization so `FOO='bar baz' make check` and paths with spaces
  // resolve to the right head word (a strict whitespace split would over-tokenize
  // the quoted value and mis-read the executable).
  const words = parseShell(command)
  // Drop leading env-assignment words (NAME=value) — shell-prefix syntax.
  const isEnvAssign = (w: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w)
  let head = 0
  while (head < words.length && isEnvAssign(words[head])) head++
  const exe = words.slice(head)
  if (exe.length === 0 || exe[0] === '') return false
  try {
    if (exe[0] === 'make') {
      execFileSync('make', ['-n', ...exe.slice(1)], { cwd: projectRoot, stdio: 'ignore', timeout: 30_000 })
    } else {
      // exe[0] comes from a project-supplied command (possibly an untrusted
      // adopted repo) — pass it as a quoted positional ($1), NEVER interpolated
      // into the bash string, so backticks/$(...)/; in it can't execute. The
      // `--` after `command -v` ends option parsing so an executable whose name
      // starts with `-` is treated as an operand, not a flag.
      execFileSync('bash', ['-c', 'command -v -- "$1"', '--', exe[0]], {
        cwd: projectRoot, stdio: 'ignore', timeout: 30_000,
      })
    }
    return true
  } catch {
    return false
  }
}

// Must exceed the longest time a single blocking git/gh call can hold the event
// loop (those are execFileSync with a 120s cap) so the lock is never judged stale
// while the daemon is alive and merely busy — a false-stale lock would let a
// SECOND daemon start and break the singleton guarantee.
const LOCK_STALE_MS = 180_000

function lockOpts(mqDir: string) {
  return { lockfilePath: path.join(mqDir, 'daemon.lock'), stale: LOCK_STALE_MS }
}

function daemonAlive(mqDir: string): boolean {
  try {
    return checkSync(mqDir, lockOpts(mqDir))
  } catch {
    return false
  }
}

function autostartDaemon(primary: string): void {
  const child = spawn(process.execPath, [process.argv[1], 'mq', 'daemon', '--root', primary], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

export async function mqHandler(argv: MqArgs, overrides: MqOverrides = {}): Promise<void> {
  const outputMode = resolveOutputMode(argv)
  const output = createOutputContext(outputMode)
  const startRoot = argv.root ?? process.cwd()
  const git = createGitOps(startRoot)
  const primary = git.primaryRoot()
  const mqDir = path.join(primary, '.mq')
  fs.mkdirSync(mqDir, { recursive: true })

  const needPr = (): number | null => {
    if (argv.pr === undefined || !Number.isInteger(argv.pr) || argv.pr < 1) {
      output.error(`mq ${argv.action}: --pr <number> is required`)
      process.exitCode = 1
      return null
    }
    return argv.pr
  }

  switch (argv.action) {
  case 'enqueue': {
    const pr = needPr()
    if (pr === null) return
    appendEvent(mqDir, { type: 'enqueued', pr, at: new Date().toISOString() })
    if (process.env.MQ_NO_AUTOSTART !== '1' && !daemonAlive(mqDir)) autostartDaemon(primary)
    output.success(
      `enqueued PR #${pr} — the daemon will land or eject it; watch: scaffold mq status`,
    )
    return
  }
  case 'eject': {
    const pr = needPr()
    if (pr === null) return
    // Don't clobber a terminal state: ejecting an already-LANDED PR would flip its
    // journal entry LANDED → CANCELLED and mis-report a good landing. Match the
    // daemon's own terminal-state guards.
    const entry = reduceState(readJournal(mqDir)).entries.get(pr)
    if (!entry) {
      output.warn(`PR #${pr} is not in the queue — nothing to eject`)
      return
    }
    if (TERMINAL_PR_STATES.has(entry.state)) {
      output.warn(`PR #${pr} is already ${entry.state} — nothing to eject`)
      return
    }
    appendEvent(mqDir, {
      type: 'pr_state', pr, state: 'CANCELLED', at: new Date().toISOString(),
      note: 'ejected by user',
    })
    output.success(`ejected PR #${pr} from the queue`)
    return
  }
  case 'status': {
    const state = reduceState(readJournal(mqDir))
    const pausedFile = path.join(mqDir, PAUSED_FILE)
    const paused = fs.existsSync(pausedFile) ? fs.readFileSync(pausedFile, 'utf8').trim() : null
    const entries = [...state.entries.values()]
      .filter(e => argv.pr === undefined || e.pr === argv.pr)
    if (argv.format === 'json') {
      output.result({ paused, daemonAlive: daemonAlive(mqDir), entries })
      return
    }
    if (paused !== null) output.warn(`QUEUE PAUSED: ${paused}`)
    output.info(`daemon: ${daemonAlive(mqDir) ? 'running' : 'not running'}`)
    if (entries.length === 0) {
      output.info('queue empty')
      return
    }
    for (const e of entries) {
      output.info(
        `#${e.pr}  ${e.state}${e.batchId ? `  batch=${e.batchId}` : ''}${e.note ? `  (${e.note})` : ''}`,
      )
    }
    return
  }
  case 'stats': {
    const stats = computeStats(readJournal(mqDir), new Date())
    if (argv.format === 'json') {
      output.result(stats)
      return
    }
    output.info(`arrivals (24h): ${stats.arrivalsLast24h}`)
    output.info(`landed (total): ${stats.landedTotal}`)
    output.info(
      `gate runs: ${stats.gateRuns.green} green / ${stats.gateRuns.red} red / ` +
      `${stats.gateRuns.timeout} timeout`,
    )
    output.info(`median gate: ${stats.medianGateSeconds ?? '—'} s`)
    output.info(`flake events (7d): ${stats.flakesLast7d}`)
    output.info(
      `gate cache: ${stats.gateCacheHits} hit(s), ~${stats.gateCacheSecondsSaved} s saved`,
    )
    output.info(
      `full gate (poller): ${stats.fullGatePlain.runs} plain ` +
      `(median ${stats.fullGatePlain.medianSeconds ?? '—'} s) / ` +
      `${stats.fullGateInstrumented.runs} instrumented ` +
      `(median ${stats.fullGateInstrumented.medianSeconds ?? '—'} s)`,
    )
    return
  }
  case 'gate-cache': {
    // Full-gate cache plumbing for the post-merge poller (D12). The key is
    // computed HERE so the hashing logic lives in exactly one place (TS), never
    // re-implemented in bash.
    const cfg = loadAgentOpsConfig(primary).merge_queue
    const quarantineHash = hashFileOrAbsent(path.join(primary, cfg.quarantine_path), 'quarantine')
    if (argv.checkTree) {
      const hit = cfg.gate_cache_max_entries > 0
        ? lookupGateCache(mqDir, fullGateKey({
          tree: argv.checkTree, command: cfg.full_gate_command, quarantineHash,
        }))
        : null
      if (hit !== null) {
        output.success(`full-gate cache hit (recorded ${hit.at}, ${hit.seconds}s)`)
        return
      }
      output.info('full-gate cache miss')
      process.exitCode = 1
      return
    }
    if (argv.recordTree) {
      const at = new Date().toISOString()
      recordGateCache(mqDir, {
        key: fullGateKey({ tree: argv.recordTree, command: cfg.full_gate_command, quarantineHash }),
        seconds: argv.seconds ?? 0,
        at,
      }, cfg.gate_cache_max_entries)
      appendEvent(mqDir, {
        type: 'full_gate_recorded', tree: argv.recordTree, seconds: argv.seconds ?? 0,
        instrumented: argv.instrumented === true, at,
      })
      output.success(`recorded green full gate for tree ${argv.recordTree}`)
      return
    }
    output.error('mq gate-cache: pass --check-tree <sha> or --record-tree <sha>')
    process.exitCode = 1
    return
  }
  case 'bootstrap': {
    const pr = needPr()
    if (pr === null) return
    const o = overrides.bootstrapDeps ?? {}
    const config = o.config ?? loadAgentOpsConfig(primary).merge_queue
    // Spawn the scaffold CLI itself for the smoke/doctor passes: the spec pins
    // those command surfaces (exit codes), so the CLI is the stable seam.
    const cli = (args: string[], timeoutMs: number): number => {
      const r = spawnSync(process.execPath, [process.argv[1], ...args], {
        cwd: primary, stdio: 'ignore', timeout: timeoutMs,
      })
      return r.status ?? 2
    }
    const deps: BootstrapDeps = {
      gh: o.gh ?? createGhClient(primary),
      git: o.git ?? git,
      runGate: o.runGate ?? runGate,
      config,
      mqDir: o.mqDir ?? mqDir,
      projectRoot: o.projectRoot ?? primary,
      // D9: read the config the PR installs, from the gated tree (not primary).
      readMergeConfig: o.readMergeConfig ?? ((gatedTree: string) => loadAgentOpsConfig(gatedTree).merge_queue),
      // D9: verify the PR's committed queue assets exist in the gated tree.
      verifyGatedAssets: o.verifyGatedAssets ?? ((gatedTree: string, cfg): { ok: boolean; missing: string[] } => {
        const required = [
          path.join('.scaffold', 'agent-ops.yaml'),
          path.join('scripts', 'mq-guard.sh'),
        ]
        if (cfg.gate_executor === 'local-poller') {
          required.push(path.join('scripts', 'ops', 'post-merge-poller.sh'))
        }
        const missing = required.filter(rel => !fs.existsSync(path.join(gatedTree, rel)))
        return { ok: missing.length === 0, missing }
      }),
      armHooks: o.armHooks ?? ((): { messages: string[] } => {
        const r = installHooks(primary)
        return {
          messages: [
            ...r.added.map(l => `hooks: registered ${l}`),
            ...r.alreadyPresent.map(l => `hooks: already registered ${l}`),
            ...r.skipped.map(s => `hooks: ${s.reason}`),
          ],
        }
      }),
      // Armed POST-merge (see verifyAndArm): the poller script now exists at
      // primary, so buildPostMergePollerJob(primary) resolves. Re-read the
      // executor from primary (just merged) and no-op for non-local-poller.
      armSched: o.armSched ?? ((): { ok: boolean; messages: string[] } => {
        // loadAgentOpsConfig throws on a malformed .scaffold/agent-ops.yaml — keep it
        // inside the guard so this closure honors its never-throw contract (verifyAndArm
        // also wraps the call site, but the default impl must not rely on that).
        try {
          if (loadAgentOpsConfig(primary).merge_queue.gate_executor !== 'local-poller') {
            return { ok: true, messages: ['sched: skipped (gate_executor is not local-poller)'] }
          }
          const res = pickSchedBackend().install(buildPostMergePollerJob(primary))
          return { ok: res.ok, messages: res.messages.map(m => `sched: ${m}`) }
        } catch (err) {
          return { ok: false, messages: [`sched: ${err instanceof Error ? err.message : String(err)}`] }
        }
      }),
      smokeDaemon: o.smokeDaemon ?? ((): { ok: boolean; detail: string } => {
        const status = cli(['mq', 'daemon', '--once', '--root', primary], 300_000)
        return status === 0
          ? { ok: true, detail: 'mq daemon --once cycle completed clean' }
          : { ok: false, detail: `mq daemon --once exited ${status}` }
      }),
      runDoctor: o.runDoctor !== undefined
        ? o.runDoctor
        : (): { exitCode: number; summary: string } => {
          const status = cli(['doctor'], 300_000)
          return {
            exitCode: status,
            summary: status === 0
              ? 'healthy'
              : status === 1
                ? 'warnings — run scaffold doctor for detail'
                : 'errors — run scaffold doctor for detail',
          }
        },
      // Preflight resolves against the gated tree (the engine passes it); the
      // exported helper already takes (root, command).
      gateTargetResolves: o.gateTargetResolves ?? gateTargetResolves,
      log: o.log ?? (m => output.info(m)),
      now: o.now ?? ((): Date => new Date()),
      newId: o.newId ?? ((): string => ulid()),
    }
    const outcome = await runBootstrap(deps, { pr, finish: argv.finish })
    if (outcome.ok) {
      output.success(`mq bootstrap: ${outcome.stage} (attempt ${outcome.bootstrapId ?? '—'})`)
    } else {
      output.error(`mq bootstrap stopped at ${outcome.stage} — see messages above`)
      process.exitCode = 1
    }
    return
  }
  case 'daemon': {
    let release: () => Promise<void>
    try {
      release = await lock(mqDir, { ...lockOpts(mqDir), update: 15_000 })
    } catch (err) {
      if ((err as { code?: string }).code === 'ELOCKED') {
        output.info('mq daemon already running — nothing to do')
        return
      }
      output.error(`mq daemon: could not acquire the lock: ${String(err)}`)
      process.exitCode = 1
      return
    }
    let onSignal: (() => void) | undefined
    try {
      const logFile = path.join(mqDir, 'logs', 'daemon.log')
      fs.mkdirSync(path.dirname(logFile), { recursive: true })
      const log = (msg: string): void => {
        const line = `${new Date().toISOString()} ${msg}`
        fs.appendFileSync(logFile, line + '\n')
        if (argv.foreground) output.info(line)
      }
      const config = loadAgentOpsConfig(primary).merge_queue
      const pollerScript = path.join(primary, 'scripts', 'ops', 'post-merge-poller.sh')
      const triggerPoller = (): void => {
        // Only meaningful when the local poller is the gate executor and the
        // script is installed; its own lock serializes overlapping passes.
        if (config.gate_executor !== 'local-poller') return
        if (!fs.existsSync(pollerScript)) return
        const child = spawn('bash', [pollerScript], { detached: true, stdio: 'ignore' })
        child.unref()
      }
      const daemon = new MergeQueueDaemon({
        gh: createGhClient(primary),
        git: createGitOps(primary),
        runGate,
        config,
        mqDir,
        projectRoot: primary,
        log,
        now: () => new Date(),
        triggerPoller,
      })
      // Graceful shutdown: kill any in-flight gate process group and release the
      // lock immediately, instead of leaking the gate and leaving the lock stale
      // for up to LOCK_STALE_MS before a replacement daemon can take over.
      const killGate = (): void => {
        const pf = path.join(mqDir, GATE_PID_FILE)
        if (!fs.existsSync(pf)) return
        const pid = Number(fs.readFileSync(pf, 'utf8').trim())
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ }
        }
        fs.rmSync(pf, { force: true })
      }
      onSignal = (): void => {
        killGate()
        void release().finally(() => process.exit(130))
      }
      process.once('SIGINT', onSignal)
      process.once('SIGTERM', onSignal)
      log(`daemon started (pid ${process.pid})`)
      await daemon.run({ once: argv.once })
    } finally {
      // Remove the handlers on normal completion (the --once path returns here) so
      // they don't accumulate across invocations; process.once only auto-removes
      // when the signal actually fires.
      if (onSignal !== undefined) {
        process.removeListener('SIGINT', onSignal)
        process.removeListener('SIGTERM', onSignal)
      }
      await release()
    }
    return
  }
  default:
    output.error(`unknown mq action "${argv.action}"`)
    process.exitCode = 1
  }
}

const mqCommand: CommandModule<Record<string, unknown>, MqArgs> = {
  command: 'mq <action>',
  describe: 'Local batching merge queue: enqueue PRs, run the daemon, inspect status, bootstrap the first merge',
  builder: (yargs: Argv) => {
    return yargs
      .positional('action', {
        describe: 'Action to perform',
        choices: ['enqueue', 'daemon', 'status', 'eject', 'stats', 'bootstrap', 'gate-cache'] as const,
        type: 'string',
        demandOption: true,
      })
      .option('pr', { type: 'number', describe: 'PR number (enqueue / eject / bootstrap / status filter)' })
      .option('finish', {
        type: 'boolean', default: false,
        describe: 'Resume an unfinished bootstrap attempt (never starts a new one)',
      })
      .option('foreground', {
        type: 'boolean', default: false, describe: 'Log to stdout as well as .mq/logs/daemon.log',
      })
      // Required by autostart, which spawns `mq daemon --root <primary>`. Without
      // this declaration the CLI's strict parser rejects --root and the detached
      // daemon exits immediately, silently breaking fire-and-forget autostart.
      .option('root', { type: 'string', hidden: true, describe: 'Project root directory' })
      .option('once', { type: 'boolean', default: false, hidden: true })
      .option('check-tree', {
        type: 'string', hidden: true, describe: 'gate-cache: tree sha to look up (full-gate key)',
      })
      .option('record-tree', {
        type: 'string', hidden: true, describe: 'gate-cache: tree sha to record as green',
      })
      .option('seconds', {
        type: 'number', hidden: true, describe: 'gate-cache: wall-clock seconds of the recorded run',
      })
      .option('instrumented', {
        type: 'boolean', default: false, hidden: true,
        describe: 'gate-cache: the recorded run was coverage-instrumented',
      })
  },
  handler: mqHandler,
}

export default mqCommand
