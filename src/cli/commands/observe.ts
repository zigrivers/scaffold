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
  if (NUMERIC_KEYS.has(rawKey)) return Number(raw)
  if (BOOLEAN_KEYS.has(rawKey)) return raw === 'true'
  if (ARRAY_KEYS.has(rawKey)) return raw.split(',').map((s) => s.trim()).filter(Boolean)
  return raw
}

function buildPayload(type: EventType, kv: Record<string, string>): Record<string, unknown> {
  const allowed = new Set(EVENT_PAYLOAD_KEYS[type])
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
    process.stdout.write(renderProgressTerminal(out) + '\n')
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

interface ObserveArgs {
  subcommand?: string
  type?: string
  branch?: string
  taskId?: string
  json?: boolean
  sinceHours?: number
  root?: string
  worktree?: string
  set?: string[]
}

const observeCommand: CommandModule<Record<string, unknown>, ObserveArgs> = {
  command: 'observe <subcommand>',
  describe: 'Build observability — record events, view progress, harvest ledgers',
  builder: (yargs) => {
    return yargs
      .positional('subcommand', { choices: ['event', 'progress', 'harvest'] as const, type: 'string' })
      .option('type', { type: 'string', describe: 'Event type (for observe event)' })
      .option('branch', { type: 'string', describe: 'Current branch name' })
      .option('task-id', { type: 'string', describe: 'Task ID' })
      .option('json', { type: 'boolean', default: false, describe: 'Output raw EngineOutput JSON' })
      .option('since-hours', { type: 'number', default: 24, describe: 'Look-back window (hours)' })
      .option('root', { type: 'string', describe: 'Primary worktree root (defaults to cwd)' })
      .option('worktree', { type: 'string', describe: 'Worktree root to harvest (for observe harvest)' })
      .option('set', { type: 'array', string: true, describe: 'key=value payload fields' })
  },
  handler: async () => { /* dispatch handled by CLI wrapper */ },
}

export default observeCommand
