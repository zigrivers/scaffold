import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { TERMINAL_STATUSES } from '../types.js'
import type { ChannelStatus } from '../types.js'
import type { OutputParserConfig } from '../config/schema.js'
import type { JobStore } from './job-store.js'
import { channelOutputMatchesIncompleteGuard } from './parser.js'
import { withNeutralPosture, sweepStaleNeutralDirs } from './host-isolation.js'

export interface DispatchOptions {
  command: string
  prompt: string
  flags: string[]
  env: Record<string, string>
  timeout: number
  stderr: 'capture' | 'suppress' | 'passthrough'
  /**
   * How to hand the prompt to the process. 'stdin' (default) pipes it to
   * stdin. 'prompt-file' writes it to a file in the channel dir and passes
   * the path via a {{prompt_file}} placeholder in flags (or appended when no
   * placeholder is present), for CLIs that require the prompt as an arg.
   */
  promptDelivery?: 'stdin' | 'prompt-file'
  /** Working directory for the spawned process. {{neutral_cwd}} is expanded
   *  (with {{neutral_home}} in env) into a per-run isolated dir before spawn. */
  cwd?: string
  /**
   * The channel's output parser spec. When it carries an `incomplete` guard
   * (unwrap-jsonpath), a run that completes with a guard-matching envelope
   * (grok's `stopReason: "Cancelled"` under same-account concurrent sessions,
   * verified on grok 0.2.103) is re-dispatched ONCE. The retry is serial — it
   * starts after the concurrency burst that cancelled the first attempt has
   * largely passed — so it usually restores real channel coverage instead of
   * falling through to the compensating pass. Omitted or guardless ⇒ plain
   * single dispatch.
   */
  retryOnIncomplete?: string | OutputParserConfig
}

/** Placeholder token replaced with the prompt-file path in prompt-file mode. */
const PROMPT_FILE_PLACEHOLDER = '{{prompt_file}}'

/** Track active child PIDs for cleanup on parent exit */
const activeChildren = new Set<number>()

/**
 * Track per-dispatch neutral-posture cleanups so a SIGINT/SIGTERM that
 * terminates the run also removes the isolated HOME/cwd temp dirs (which hold a
 * grok auth symlink). Each entry is removed once its own dispatch settles.
 */
const activePostureCleanups = new Set<() => void>()

function cleanupChildren(): void {
  for (const pid of activeChildren) {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      // Process may have already exited
    }
  }
  activeChildren.clear()
  // Remove any neutral-posture temp dirs from interrupted dispatches. Snapshot
  // first: a cleanup callback (or a settling dispatch) could mutate the live Set.
  for (const cleanup of [...activePostureCleanups]) {
    try { cleanup() } catch { /* best effort */ }
  }
  activePostureCleanups.clear()
}

// Register cleanup once
let cleanupRegistered = false
function ensureCleanupRegistered(): void {
  if (cleanupRegistered) return
  cleanupRegistered = true
  process.on('SIGINT', () => { cleanupChildren(); process.exit(130) })
  process.on('SIGTERM', () => { cleanupChildren(); process.exit(143) })
}

// Sweep stale neutral dirs once at process start
let sweepDone = false
function ensureSweepOnce(): void {
  if (sweepDone) return
  sweepDone = true
  try { sweepStaleNeutralDirs() } catch { /* best effort — never block dispatch */ }
}

/** Check whether a channel status represents a terminal (done) state */
export function isChannelComplete(status: ChannelStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

/**
 * True when the settled channel completed but its saved envelope matches the
 * parser spec's `incomplete` guard — i.e. the run was interrupted (grok's
 * `stopReason: "Cancelled"`) and is worth one serial re-dispatch. Probe errors
 * must never fail a dispatch that already settled, so this never throws.
 */
function completedRunMatchesIncompleteGuard(
  store: JobStore,
  jobId: string,
  channelName: string,
  parserSpec: string | OutputParserConfig,
): boolean {
  if (typeof parserSpec === 'string' || parserSpec.kind !== 'unwrap-jsonpath' || !parserSpec.incomplete) {
    return false
  }
  try {
    if (store.loadJob(jobId).channels[channelName]?.status !== 'completed') return false
    const stored = store.loadChannelOutput(jobId, channelName)
    // saveChannelOutput writes JSON.stringify(stdout); recover the raw envelope
    // string (same decode as the results pipeline).
    let raw: string
    try {
      const decoded = JSON.parse(stored)
      raw = typeof decoded === 'string' ? decoded : stored
    } catch {
      raw = stored
    }
    return channelOutputMatchesIncompleteGuard(raw, parserSpec)
  } catch {
    return false
  }
}

/**
 * Jittered delay before the incomplete-run retry. The first attempt's own
 * duration already spaces the retry out, but sibling MMR processes/worktrees
 * whose grok runs were cancelled by the SAME concurrency burst would otherwise
 * all retry in lockstep and can re-collide; the jitter de-synchronizes them.
 * (Cross-process coordination is deliberately out of scope — the schema
 * constraint plus one retry plus the compensating pass cover the residue.)
 * Overridable for tests via MMR_INCOMPLETE_RETRY_DELAY_MS.
 */
function incompleteRetryDelayMs(): number {
  const override = process.env.MMR_INCOMPLETE_RETRY_DELAY_MS
  if (override !== undefined && Number.isFinite(Number(override))) {
    return Math.max(0, Number(override))
  }
  return 2000 + Math.floor(Math.random() * 3000)
}

/**
 * Spawn a background process for a review channel and monitor it. When
 * `opts.retryOnIncomplete` carries an `incomplete` guard, a completed run
 * whose envelope matches the guard is re-dispatched once after a jittered
 * delay (see DispatchOptions). If the retry ALSO completes guard-matched, the
 * channel is marked `failed` here — at dispatch time — so the compensating
 * pass (which reads channel statuses right after dispatch) actually fires;
 * leaving it `completed` would defer the failure to results-time parsing,
 * after compensation has already been skipped.
 */
export async function dispatchChannel(
  store: JobStore,
  jobId: string,
  channelName: string,
  opts: DispatchOptions,
): Promise<void> {
  await dispatchChannelOnce(store, jobId, channelName, opts)
  if (opts.retryOnIncomplete === undefined
    || !completedRunMatchesIncompleteGuard(store, jobId, channelName, opts.retryOnIncomplete)) {
    return
  }

  await new Promise((resolve) => setTimeout(resolve, incompleteRetryDelayMs()))
  await dispatchChannelOnce(store, jobId, channelName, opts)

  if (completedRunMatchesIncompleteGuard(store, jobId, channelName, opts.retryOnIncomplete)) {
    try {
      store.updateChannel(jobId, channelName, {
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      store.saveChannelLog(
        jobId,
        channelName,
        'channel run remained incomplete after one retry (envelope matched the parser\'s '
        + '`incomplete` guard on both attempts) — failing the channel so the compensating pass covers it.',
      )
    } catch {
      // Best effort — a bookkeeping failure must not reject a settled dispatch.
    }
  }
}

async function dispatchChannelOnce(
  store: JobStore,
  jobId: string,
  channelName: string,
  opts: DispatchOptions,
): Promise<void> {
  ensureCleanupRegistered()
  ensureSweepOnce()

  if (!/^[a-zA-Z0-9._-]+$/.test(channelName)) {
    throw new Error(`Unsafe channel name: ${channelName}`)
  }

  const jobDir = store.getJobDir(jobId)
  const channelsDir = path.join(jobDir, 'channels')

  // Split multi-word commands (e.g. "claude -p" → ["claude", "-p"])
  const [cmd, ...cmdArgs] = opts.command.split(/\s+/)
  let args = [...cmdArgs, ...opts.flags]

  // In prompt-file mode, write the prompt to a file in the channel dir and
  // substitute its path for the {{prompt_file}} placeholder (or append it).
  // The prompt is NOT piped to stdin in this mode.
  const promptDelivery = opts.promptDelivery ?? 'stdin'
  if (promptDelivery === 'prompt-file') {
    const promptFile = path.join(channelsDir, `${channelName}.prompt.txt`)
    // Async write: prompts can carry large diffs and channels dispatch in
    // parallel, so avoid blocking the event loop.
    await fs.promises.writeFile(promptFile, opts.prompt)
    args = args.some((a) => a.includes(PROMPT_FILE_PLACEHOLDER))
      ? args.map((a) => a.split(PROMPT_FILE_PLACEHOLDER).join(promptFile))
      : [...args, promptFile]
  }

  // Update channel to running
  store.updateChannel(jobId, channelName, {
    status: 'running',
    started_at: new Date().toISOString(),
  })

  // Map stderr option to stdio descriptor
  const stderrStdio = opts.stderr === 'passthrough' ? 'inherit'
    : opts.stderr === 'capture' ? 'pipe'
      : 'ignore'  // suppress

  // Expand neutral posture placeholders ({{neutral_home}}, {{neutral_cwd}});
  // for channels without placeholders, withNeutralPosture is a passthrough.
  const posture = withNeutralPosture(opts.env, opts.cwd)
  // Register for SIGINT/SIGTERM cleanup, and remove + run once this dispatch
  // settles. cleanup is idempotent, so a signal firing alongside a terminal
  // handler is safe.
  activePostureCleanups.add(posture.cleanup)
  const runPostureCleanup = (): void => {
    activePostureCleanups.delete(posture.cleanup)
    posture.cleanup()
  }

  // Spawn + all synchronous setup (stdin, PID file) in one guarded block: any
  // throw between dir creation and the async close/error handlers being armed
  // would otherwise leak the per-run temp dir.
  let proc: ReturnType<typeof spawn>
  try {
    // Pipe prompt via stdin to avoid E2BIG on large diffs
    proc = spawn(cmd, args, {
      detached: true,
      stdio: ['pipe', 'pipe', stderrStdio],
      env: { ...process.env, ...posture.env },
      cwd: posture.cwd,   // undefined ⇒ inherit parent cwd (unchanged for non-isolated channels)
    })

    if (proc.pid) activeChildren.add(proc.pid)

    // Handle stdin pipe errors (child may close stdin early)
    // stdin is always 'pipe' so proc.stdin is guaranteed non-null
    proc.stdin!.on('error', () => {
      // Swallow EPIPE — the close handler will deal with the process exit
    })

    // Write prompt to stdin (stdin delivery only; prompt-file mode passes the
    // prompt as an arg). Always end stdin so processes that read it don't hang.
    if (promptDelivery === 'stdin') {
      proc.stdin!.write(opts.prompt)
    }
    proc.stdin!.end()

    // Write PID file
    const pidFile = path.join(channelsDir, `${channelName}.pid`)
    fs.writeFileSync(pidFile, String(proc.pid))
  } catch (err) {
    runPostureCleanup()
    throw err
  }

  // Collect stdout and stderr
  let stdout = ''
  let stderr = ''

  // stdout is always 'pipe' so proc.stdout is guaranteed non-null
  proc.stdout!.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })

  if (opts.stderr === 'capture' && proc.stderr) {
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
  }

  // In-memory settled flag to prevent timeout/close race
  let settled = false

  return new Promise<void>((resolve) => {
    // Set up timeout
    const timeoutMs = opts.timeout * 1000
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      if (proc.pid) activeChildren.delete(proc.pid)
      try {
        // Kill the process group (negative PID kills the group)
        if (proc.pid) {
          process.kill(-proc.pid, 'SIGKILL')
        }
      } catch {
        // Process may have already exited
      }
      // Explicitly destroy streams so open pipes do not hang the event loop
      proc.stdout?.destroy()
      proc.stderr?.destroy()
      proc.stdin?.destroy()
      const completedAt = new Date().toISOString()
      store.updateChannel(jobId, channelName, {
        status: 'timeout',
        completed_at: completedAt,
      })
      if (stderr) {
        store.saveChannelLog(jobId, channelName, stderr)
      }
      runPostureCleanup()
      resolve()
    }, timeoutMs)

    // Handle process close
    proc.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      if (proc.pid) activeChildren.delete(proc.pid)

      const completedAt = new Date().toISOString()

      if (code === 0 && stdout) {
        // Always save raw stdout — parser.ts handles format quirks
        store.saveChannelOutput(jobId, channelName, stdout)
        store.updateChannel(jobId, channelName, {
          status: 'completed',
          completed_at: completedAt,
        })
      } else {
        const errorMsg = stderr || `Process exited with code ${code}`
        store.saveChannelLog(jobId, channelName, errorMsg)
        store.updateChannel(jobId, channelName, {
          status: 'failed',
          completed_at: completedAt,
        })
      }
      runPostureCleanup()
      resolve()
    })

    // Handle spawn errors
    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      if (proc.pid) activeChildren.delete(proc.pid)
      store.updateChannel(jobId, channelName, {
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      store.saveChannelLog(jobId, channelName, err.message)
      runPostureCleanup()
      resolve()
    })
  })
}
