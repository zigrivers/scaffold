import type { CommandModule } from 'yargs'
import { writeEvent } from '../../observability/engine/ledger-writer.js'
import type { EventType } from '../../observability/engine/types.js'
import { EVENT_PAYLOAD_KEYS } from '../../observability/engine/event-schemas.js'
import { runProgress } from '../../observability/engine/api.js'
import { redactRendered } from '../../observability/engine/redact.js'
import { harvestWorktree } from '../../observability/engine/harvester.js'
import { renderProgressTerminal } from '../../observability/renderers/terminal.js'
import { readIdentityAsync } from '../../observability/engine/identity.js'

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
    const msg = (err as Error).message
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
  ghBin?: string
  bdBin?: string
}

export async function handleProgress(input: HandleProgressInput): Promise<number> {
  try {
    const out = await runProgress({
      primaryRoot: input.cwd,
      sinceHours: input.sinceHours,
      ghBin: input.ghBin,
      bdBin: input.bdBin,
      args: { sinceHours: input.sinceHours },
    })
    if (input.json) {
      const blob = JSON.stringify(out, null, 2)
      process.stdout.write((input.maskPaths ? redactRendered(blob) : blob) + '\n')
      return 0
    }
    const rendered = renderProgressTerminal(out)
    process.stdout.write((input.maskPaths ? redactRendered(rendered) : rendered) + '\n')
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe progress: ${(err as Error).message}\n`)
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
    const id = await readIdentityAsync(input.worktreeRoot)
    if (!id) {
      process.stderr.write(`scaffold observe harvest: worktree at ${input.worktreeRoot} has no identity.json\n`)
      return 3
    }
    await harvestWorktree(input)
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe harvest: ${(err as Error).message}\n`)
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
          cwd: process.cwd(),
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
        .option('since-hours', { type: 'number', default: 24 }),
      async (argv) => {
        const code = await handleProgress({
          cwd: process.cwd(),
          json: !!(argv.json),
          maskPaths: !!(argv['mask-paths'] ?? argv.maskPaths),
          sinceHours: (argv['since-hours'] ?? argv.sinceHours ?? 24) as number,
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
          primaryRoot: process.cwd(),
          worktreeRoot: argv.worktree as string,
        })
        process.exitCode = code
      },
    )
    .demandCommand(1, 'observe requires a subcommand: event | progress | harvest'),
  handler: async () => { /* intentional: subcommands set process.exitCode */ },
}

export default observeCommand
