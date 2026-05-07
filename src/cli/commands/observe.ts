import type { CommandModule } from 'yargs'
import { writeEvent } from '../../observability/engine/ledger-writer.js'
import type { EventType, EngineOutput } from '../../observability/engine/types.js'
import { EVENT_PAYLOAD_KEYS } from '../../observability/engine/event-schemas.js'
import { runProgress, runAudit } from '../../observability/engine/api.js'
import { redactRendered } from '../../observability/engine/redact.js'
import { harvestWorktree } from '../../observability/engine/harvester.js'
import { renderProgressTerminal, renderAuditTerminal } from '../../observability/renderers/terminal.js'
import { renderProgressMarkdown, renderAuditMarkdown } from '../../observability/renderers/markdown.js'
import { writeSidecar, deriveReportId, sidecarPath } from '../../observability/renderers/sidecar.js'
import { renderProgressFragment, renderAuditFragment } from '../../observability/renderers/dashboard.js'
import { renderMmrFindings } from '../../observability/renderers/mmr-findings.js'
import { readIdentityAsync } from '../../observability/engine/identity.js'
import { stat, readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { dirname, isAbsolute, join } from 'node:path'
import { findProjectRoot } from '../middleware/project-root.js'
import { runFixFlow } from '../../observability/engine/fix-flow.js'
import { captureSnapshot, restoreSnapshot } from '../../observability/engine/abort-snapshot.js'

async function writeMarkdownReport(
  cwd: string, out: EngineOutput, body: string, reportId: string, overridePath?: string,
): Promise<string> {
  const relPath = sidecarPath(reportId, out.invocation.command).replace(/\.json$/, '.md')
  const absPath = overridePath
    ? (isAbsolute(overridePath) ? overridePath : join(cwd, overridePath))
    : join(cwd, relPath)
  const existing = await stat(absPath).catch(() => null)
  if (existing?.isDirectory()) throw new Error(`output path is a directory: ${absPath}`)
  await mkdir(dirname(absPath), { recursive: true })
  await writeFile(absPath, body, { mode: 0o644 })
  return absPath
}

// ─── handleEvent ─────────────────────────────────────────────────────────────

export interface HandleEventInput {
  cwd: string
  type: EventType
  branch: string
  taskId: string | null
  keyValues: Record<string, string>
}

const NUMERIC_KEYS = new Set(['pr-number'])
const ARRAY_KEYS = new Set(['affects', 'links', 'references'])
const BOOLEAN_KEYS = new Set(['unplanned'])

function snakeKey(k: string): string { return k.replace(/-/g, '_') }

function coerce(rawKey: string, raw: string): unknown {
  if (NUMERIC_KEYS.has(rawKey)) { const n = Number(raw); return Number.isNaN(n) ? undefined : n }
  if (BOOLEAN_KEYS.has(rawKey)) return raw === 'true'
  if (ARRAY_KEYS.has(rawKey)) return raw.split(',').map((s) => s.trim()).filter(Boolean)
  return raw
}

function buildPayload(type: EventType, kv: Record<string, string>): Record<string, unknown> {
  const keys = EVENT_PAYLOAD_KEYS[type]
  if (!keys) return {}
  const allowed = new Set(keys)
  const out: Record<string, unknown> = {}
  for (const [rawKey, raw] of Object.entries(kv)) {
    const snake = snakeKey(rawKey)
    if (allowed.has(snake)) out[snake] = coerce(rawKey, raw)
  }
  return out
}

export async function handleEvent(input: HandleEventInput): Promise<number> {
  const payload = buildPayload(input.type, input.keyValues)
  try {
    await writeEvent(input.cwd, {
      type: input.type,
      branch: input.branch,
      task_id: input.taskId,
      payload,
    })
    return 0
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`scaffold observe event: ${msg}\n`)
    if (/validation failed|too large/i.test(msg)) return 2
    return 3
  }
}

// ─── handleProgress ───────────────────────────────────────────────────────────

export interface HandleProgressInput {
  cwd: string
  json: boolean
  sinceHours: number
  maskPaths?: boolean
  output?: string
  render?: 'dashboard-fragment'
  replay?: boolean
  noStallCheck?: boolean
  ghBin?: string
  bdBin?: string
}

export async function handleProgress(input: HandleProgressInput): Promise<number> {
  try {
    const out = await runProgress({
      primaryRoot: input.cwd,
      sinceHours: input.sinceHours,
      replay: input.replay,
      noStallCheck: input.noStallCheck,
      ghBin: input.ghBin,
      bdBin: input.bdBin,
      args: { sinceHours: input.sinceHours, replay: input.replay },
    })
    if (input.render === 'dashboard-fragment') {
      const fragment = renderProgressFragment(out)
      process.stdout.write((input.maskPaths ? redactRendered(fragment) : fragment) + '\n')
      return 0
    }
    const reportId = deriveReportId(out)
    let sidecarFinal: string | null = null
    try {
      sidecarFinal = await writeSidecar(input.cwd, out, undefined, reportId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`scaffold observe progress: sidecar write failed: ${msg}\n`)
    }
    if (input.json) {
      const blob = JSON.stringify(out, null, 2)
      process.stdout.write((input.maskPaths ? redactRendered(blob) : blob) + '\n')
    } else {
      const md = renderProgressMarkdown(out)
      let mdFinal: string | null = null
      try {
        mdFinal = await writeMarkdownReport(input.cwd, out, md, reportId, input.output)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`scaffold observe progress: markdown write failed: ${msg}\n`)
        if (input.output) return 3
      }
      const rendered = renderProgressTerminal(out)
      process.stdout.write((input.maskPaths ? redactRendered(rendered) : rendered) + '\n')
      const footer = `\n(written: ${mdFinal ?? '(failed)'}${sidecarFinal ? ` + ${sidecarFinal}` : ''})\n`
      process.stdout.write(input.maskPaths ? redactRendered(footer) : footer)
    }
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe progress: ${err instanceof Error ? err.message : String(err)}\n`)
    return 3
  }
}

// ─── handleHarvest ────────────────────────────────────────────────────────────

export interface HandleHarvestInput {
  primaryRoot: string
  worktreeRoot: string
}

export async function handleHarvest(input: HandleHarvestInput): Promise<number> {
  try {
    const gitEntry = await stat(join(input.primaryRoot, '.git')).catch(() => null)
    if (gitEntry && !gitEntry.isDirectory()) {
      process.stderr.write(
        `scaffold observe harvest: primaryRoot ${input.primaryRoot} is a git worktree, not the main repository.\n` +
        '  Run harvest from the primary repository root.\n',
      )
      return 3
    }
    const id = await readIdentityAsync(input.worktreeRoot)
    if (!id) {
      process.stderr.write(`scaffold observe harvest: worktree at ${input.worktreeRoot} has no identity.json\n`)
      return 3
    }
    await harvestWorktree(input)
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe harvest: ${err instanceof Error ? err.message : String(err)}\n`)
    return 3
  }
}

// ─── handleAudit ─────────────────────────────────────────────────────────────

export interface HandleAuditInput {
  cwd: string
  json: boolean
  profile: 'fast' | 'full'
  scope: 'docs' | 'code' | 'all'
  sinceHours: number
  lensIds?: string[]
  fixThresholdOverride?: string
  maskPaths?: boolean
  showAcknowledged?: boolean
  output?: string
  render?: 'dashboard-fragment-audit'
  outputMode?: 'mmr-findings'
  fix?: boolean
  ghBin?: string
  bdBin?: string
}

export async function handleAudit(input: HandleAuditInput): Promise<number> {
  try {
    const out = await runAudit({
      primaryRoot: input.cwd,
      profile: input.profile,
      scope: input.scope,
      sinceHours: input.sinceHours,
      lensIds: input.lensIds,
      fixThresholdOverride: input.fixThresholdOverride,
      ghBin: input.ghBin,
      bdBin: input.bdBin,
      args: { profile: input.profile, scope: input.scope, sinceHours: input.sinceHours, lensIds: input.lensIds },
    })
    if (input.outputMode === 'mmr-findings') {
      process.stdout.write(renderMmrFindings(out))
      return 0 // Always exit 0 so the MMR dispatcher captures stdout regardless of verdict
    }
    if (input.render === 'dashboard-fragment-audit') {
      const fragment = renderAuditFragment(out)
      process.stdout.write((input.maskPaths ? redactRendered(fragment) : fragment) + '\n')
      return out.verdict === 'blocked' ? 1 : 0
    }
    const reportId = deriveReportId(out)
    let sidecarFinal: string | null = null
    try {
      sidecarFinal = await writeSidecar(input.cwd, out, undefined, reportId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`scaffold observe audit: sidecar write failed: ${msg}\n`)
    }
    if (input.json) {
      const blob = JSON.stringify(out, null, 2)
      process.stdout.write((input.maskPaths ? redactRendered(blob) : blob) + '\n')
    } else {
      const md = renderAuditMarkdown(out)
      let mdFinal: string | null = null
      try {
        mdFinal = await writeMarkdownReport(input.cwd, out, md, reportId, input.output)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`scaffold observe audit: markdown write failed: ${msg}\n`)
        if (input.output) return 3
      }
      const rendered = renderAuditTerminal(out, { showAcknowledged: input.showAcknowledged })
      process.stdout.write((input.maskPaths ? redactRendered(rendered) : rendered) + '\n')
      const footer = `\n(written: ${mdFinal ?? '(failed)'}${sidecarFinal ? ` + ${sidecarFinal}` : ''})\n`
      process.stdout.write(input.maskPaths ? redactRendered(footer) : footer)
    }
    if (input.fix && out.summary.blocking > 0) {
      const snapshot = captureSnapshot(input.cwd)
      const onAbort = (): void => {
        process.stderr.write('\n[fix] interrupted — restoring index and worktree…\n')
        restoreSnapshot(snapshot)
        process.exit(130)
      }
      process.on('SIGINT', onAbort)
      try {
        process.stdout.write('\n[fix] starting fix flow…\n')
        const fixResult = await runFixFlow({
          primaryRoot: input.cwd, initial: out, abortSnapshot: snapshot,
          ghBin: input.ghBin, bdBin: input.bdBin,
        })
        process.stdout.write(`[fix] fixed ${fixResult.fixed.length}, failed ${fixResult.failed.length}\n`)
        process.stdout.write(`[fix] post-fix report: ${fixResult.postfix_markdown_path}\n`)
        if (fixResult.failed.length > 0) {
          const ids = fixResult.failed.map((id) => id.slice(0, 8)).join(', ')
          process.stdout.write(`[fix] failed finding ids: ${ids}\n`)
          return 1
        }
        return 0
      } finally {
        process.removeListener('SIGINT', onAbort)
      }
    }

    return out.verdict === 'blocked' ? 1 : 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe audit: ${err instanceof Error ? err.message : String(err)}\n`)
    return 3
  }
}

// ─── handleAck ───────────────────────────────────────────────────────────────

export interface HandleAckInput {
  cwd: string
  prefixOrId: string
  status: 'acknowledged' | 'open'
  note?: string
}

interface AuditSidecar {
  engine_output?: { findings?: { id: string }[] }
}

async function loadAllFindingIds(auditsDir: string): Promise<string[] | null> {
  let entries: string[]
  try {
    entries = await readdir(auditsDir)
  } catch {
    return null
  }
  const jsonPaths = entries.filter((e) => e.endsWith('.json')).map((e) => join(auditsDir, e))
  if (jsonPaths.length === 0) return null

  const allIds = new Set<string>()
  await Promise.all(jsonPaths.map(async (f) => {
    try {
      const raw = JSON.parse(await readFile(f, 'utf8')) as AuditSidecar
      for (const fi of raw?.engine_output?.findings ?? []) allIds.add(fi.id)
    } catch { /* skip malformed */ }
  }))
  return allIds.size > 0 ? [...allIds] : null
}

export async function handleAck(input: HandleAckInput): Promise<number> {
  const auditsDir = join(input.cwd, 'docs/audits')
  const ids = await loadAllFindingIds(auditsDir)
  if (ids === null) {
    process.stderr.write('scaffold observe ack: no audit sidecars found in docs/audits/\n')
    return 3
  }

  const matches = ids.filter((id) => id.startsWith(input.prefixOrId))
  if (matches.length === 0) {
    process.stderr.write(`scaffold observe ack: no finding matches prefix "${input.prefixOrId}"\n`)
    return 2
  }
  if (matches.length > 1) {
    process.stderr.write(
      `scaffold observe ack: ambiguous prefix "${input.prefixOrId}" matches ${matches.length} findings\n`,
    )
    return 2
  }

  const findingId = matches[0]
  let branch = 'main'
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: input.cwd, encoding: 'utf8' }).trim()
  } catch { /* fallback */ }
  try {
    await writeEvent(input.cwd, {
      type: 'finding_acknowledged',
      branch,
      task_id: null,
      payload: {
        finding_id: findingId,
        status: input.status,
        ...(input.note ? { note: input.note } : {}),
      },
    })
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe ack: ${err instanceof Error ? err.message : String(err)}\n`)
    return 3
  }
}

// ─── Yargs CommandModule ──────────────────────────────────────────────────────

type AnyArgv = Record<string, unknown>

const observeCommand: CommandModule<AnyArgv, AnyArgv> = {
  command: 'observe',
  describe: 'Build observability — record events, view progress, harvest ledgers',
  builder: (yargs) => yargs
    .command(
      'event <type>',
      'Write a ledger event',
      (y) => y
        .positional('type', { type: 'string', demandOption: true })
        .option('branch', { type: 'string', demandOption: true })
        .option('task-id', { type: 'string' })
        .strict(false),
      async (argv) => {
        const skip = new Set(['_', '$0', 'subcommand', 'branch', 'task-id', 'taskId', 'type'])
        const kv: Record<string, string> = {}
        for (const [k, v] of Object.entries(argv)) {
          if (skip.has(k)) continue
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            kv[k] = String(v)
          } else if (Array.isArray(v)) {
            kv[k] = v.join(',')
          }
        }
        const code = await handleEvent({
          cwd: findProjectRoot(process.cwd()) ?? process.cwd(),
          type: argv.type as EventType,
          branch: argv.branch as string,
          taskId: (argv.taskId ?? argv['task-id'] ?? null) as string | null,
          keyValues: kv,
        })
        process.exitCode = code
      },
    )
    .command(
      'progress',
      'Show build progress snapshot',
      (y) => y
        .option('json', { type: 'boolean', default: false })
        .option('mask-paths', { type: 'boolean', default: false })
        .option('since-hours', { type: 'number', default: 24 })
        .option('output', { type: 'string', describe: 'Override markdown report destination path' })
        .option('render', {
          type: 'string', choices: ['dashboard-fragment'] as const,
          describe: 'Emit HTML fragment to stdout',
        })
        .option('replay', { type: 'boolean', default: false, describe: 'Include the replay timeline in EngineOutput' })
        .option('stall-check', {
          type: 'boolean', default: true, describe: 'Run stall detection (use --no-stall-check to suppress)',
        }),
      async (argv) => {
        const code = await handleProgress({
          cwd: findProjectRoot(process.cwd()) ?? process.cwd(),
          json: !!(argv.json),
          maskPaths: !!(argv['mask-paths'] ?? argv.maskPaths),
          sinceHours: (argv['since-hours'] ?? argv.sinceHours ?? 24) as number,
          output: argv.output as string | undefined,
          render: argv.render as 'dashboard-fragment' | undefined,
          replay: !!(argv.replay),
          noStallCheck: (argv['stall-check'] ?? argv.stallCheck) === false,
        })
        process.exitCode = code
      },
    )
    .command(
      'harvest',
      'Flush a worktree ledger to the primary archive',
      (y) => y.option('worktree', { type: 'string', demandOption: true }),
      async (argv) => {
        const code = await handleHarvest({
          primaryRoot: findProjectRoot(process.cwd()) ?? process.cwd(),
          worktreeRoot: argv.worktree as string,
        })
        process.exitCode = code
      },
    )
    .command(
      'audit',
      'Run audit lenses and report findings',
      (y) => y
        .option('json', { type: 'boolean', default: false })
        .option('mask-paths', { type: 'boolean', default: false })
        .option('since-hours', { type: 'number', default: 24 })
        .option('profile', { type: 'string', choices: ['fast', 'full'] as const, default: 'fast' })
        .option('scope', { type: 'string', choices: ['docs', 'code', 'all'] as const, default: 'all' })
        .option('lens', { type: 'array', string: true })
        .option('fix-threshold', { type: 'string' })
        .option('show-acknowledged', { type: 'boolean', default: false })
        .option('output', { type: 'string', describe: 'Override markdown report destination path' })
        .option('render', {
          type: 'string', choices: ['dashboard-fragment-audit'] as const,
          describe: 'Emit HTML fragment to stdout',
        })
        .option('output-mode', {
          type: 'string', choices: ['mmr-findings'] as const,
          describe: 'Emit findings in MMR Finding shape (skips markdown/sidecar)',
        })
        .option('fix', {
          type: 'boolean', default: false,
          describe: 'Dispatch the fix flow for blocking findings after audit',
        }),
      async (argv) => {
        const code = await handleAudit({
          cwd: findProjectRoot(process.cwd()) ?? process.cwd(),
          json: !!(argv.json),
          maskPaths: !!(argv['mask-paths'] ?? argv.maskPaths),
          sinceHours: (argv['since-hours'] ?? argv.sinceHours ?? 24) as number,
          profile: (argv.profile ?? 'fast') as 'fast' | 'full',
          scope: (argv.scope ?? 'all') as 'docs' | 'code' | 'all',
          lensIds: argv.lens as string[] | undefined,
          fixThresholdOverride: argv['fix-threshold'] as string | undefined,
          showAcknowledged: !!(argv['show-acknowledged'] ?? argv.showAcknowledged),
          output: argv.output as string | undefined,
          render: argv.render as 'dashboard-fragment-audit' | undefined,
          outputMode: argv['output-mode'] as 'mmr-findings' | undefined,
          fix: !!(argv.fix),
        })
        process.exitCode = code
      },
    )
    .command(
      'ack <prefix-or-id>',
      'Acknowledge or reopen a finding by ID prefix',
      (y) => y
        .positional('prefix-or-id', { type: 'string', demandOption: true })
        .option('status', { type: 'string', choices: ['acknowledged', 'open'] as const, default: 'acknowledged' })
        .option('note', { type: 'string' }),
      async (argv) => {
        const code = await handleAck({
          cwd: findProjectRoot(process.cwd()) ?? process.cwd(),
          prefixOrId: argv['prefix-or-id'] as string,
          status: (argv.status ?? 'acknowledged') as 'acknowledged' | 'open',
          note: argv.note as string | undefined,
        })
        process.exitCode = code
      },
    )
    .demandCommand(1, 'observe requires a subcommand: event | progress | harvest | audit | ack'),
  handler: async () => { /* intentional: subcommands set process.exitCode */ },
}

export default observeCommand
