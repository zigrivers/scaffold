// src/cli/commands/mq.ts
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { checkSync, lock } from 'proper-lockfile'
import type { Argv, CommandModule } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadAgentOpsConfig } from '../../core/agent-ops/config.js'
import { MergeQueueDaemon, PAUSED_FILE } from '../../merge-queue/daemon.js'
import { appendEvent, readJournal } from '../../merge-queue/journal.js'
import { reduceState } from '../../merge-queue/state.js'
import { computeStats } from '../../merge-queue/stats.js'
import { createGhClient } from '../../merge-queue/gh.js'
import { createGitOps } from '../../merge-queue/git.js'
import { runGate } from '../../merge-queue/gate.js'

export interface MqArgs {
  action: string
  pr?: number
  foreground?: boolean
  once?: boolean
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

const LOCK_STALE_MS = 60_000

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

export async function mqHandler(argv: MqArgs): Promise<void> {
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
    return
  }
  case 'daemon': {
    let release: (() => Promise<void>) | undefined
    try {
      release = await lock(mqDir, { ...lockOpts(mqDir), update: 15_000 })
    } catch {
      output.info('mq daemon already running — nothing to do')
      return
    }
    const logFile = path.join(mqDir, 'logs', 'daemon.log')
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    const log = (msg: string): void => {
      const line = `${new Date().toISOString()} ${msg}`
      fs.appendFileSync(logFile, line + '\n')
      if (argv.foreground) output.info(line)
    }
    const config = loadAgentOpsConfig(primary).merge_queue
    const daemon = new MergeQueueDaemon({
      gh: createGhClient(primary),
      git: createGitOps(primary),
      runGate,
      config,
      mqDir,
      projectRoot: primary,
      log,
      now: () => new Date(),
    })
    log(`daemon started (pid ${process.pid})`)
    try {
      await daemon.run({ once: argv.once })
    } finally {
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
  describe: 'Local batching merge queue: enqueue PRs, run the daemon, inspect status',
  builder: (yargs: Argv) => {
    return yargs
      .positional('action', {
        describe: 'Action to perform',
        choices: ['enqueue', 'daemon', 'status', 'eject', 'stats'] as const,
        type: 'string',
        demandOption: true,
      })
      .option('pr', { type: 'number', describe: 'PR number (enqueue / eject / status filter)' })
      .option('foreground', {
        type: 'boolean', default: false, describe: 'Log to stdout as well as .mq/logs/daemon.log',
      })
      .option('once', { type: 'boolean', default: false, hidden: true })
  },
  handler: mqHandler,
}

export default mqCommand
