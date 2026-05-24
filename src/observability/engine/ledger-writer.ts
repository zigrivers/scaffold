import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { ulid } from 'ulid'
import { lock } from 'proper-lockfile'
import type { EventType } from './types.js'
import { validateEvent } from './event-schemas.js'
import { redactEvent } from './redact.js'
import { ensureIdentity } from './identity.js'

const MAX_EVENT_BYTES = 4096

export interface WriteEventInput {
  type: EventType
  branch: string
  task_id: string | null
  payload: Record<string, unknown>
}

export interface WrittenEvent {
  event_id: string
  worktree_id: string
  actor_label: string
  branch: string
  task_id: string | null
  type: EventType
  ts: string
  payload: Record<string, unknown>
}

export function ledgerPath(worktreeRoot: string): string {
  return join(worktreeRoot, '.scaffold', 'activity.jsonl')
}

export async function writeEvent(worktreeRoot: string, input: WriteEventInput): Promise<WrittenEvent> {
  const id = ensureIdentity(worktreeRoot, deriveLabel(worktreeRoot))

  const candidate: WrittenEvent = {
    event_id: ulid(),
    worktree_id: id.worktree_id,
    actor_label: id.worktree_label,
    branch: input.branch,
    task_id: input.task_id,
    type: input.type,
    ts: new Date().toISOString(),
    payload: input.payload,
  }

  const validated = validateEvent(candidate)
  if (!validated.ok) {
    throw new Error(`event validation failed: ${validated.errors.join('; ')}`)
  }

  // redactEvent's return is the discriminated-union Event type whose per-type payload
  // shapes are stricter than WrittenEvent.payload's Record<string, unknown>. The
  // runtime shape is the same — cast through unknown is the standard TS escape.
  const redacted = redactEvent(validated.event) as unknown as WrittenEvent
  const line = JSON.stringify(redacted) + '\n'
  if (Buffer.byteLength(line, 'utf8') > MAX_EVENT_BYTES) {
    throw new Error(`event too large (>${MAX_EVENT_BYTES} bytes / 4 KiB): split or summarize the payload`)
  }

  const path = ledgerPath(worktreeRoot)
  await mkdir(join(worktreeRoot, '.scaffold'), { recursive: true })
  await writeFile(path, '', { flag: 'a', mode: 0o644 })

  const release = await lock(path, {
    retries: { retries: 10, factor: 1.5, minTimeout: 50, maxTimeout: 500 },
    stale: 30_000,
  })
  try {
    await appendFile(path, line, { mode: 0o644 })
  } finally {
    await release()
  }
  // Return the same redacted event that was actually persisted, so callers see
  // exactly what's on disk (no unredacted secrets, no dropped fields).
  return redacted
}

function deriveLabel(worktreeRoot: string): string {
  return basename(worktreeRoot) || 'primary'
}
