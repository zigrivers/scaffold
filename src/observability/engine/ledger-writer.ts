import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ulid } from 'ulid'
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

export function ledgerPath(worktreeRoot: string): string {
  return join(worktreeRoot, '.scaffold', 'activity.jsonl')
}

export async function writeEvent(worktreeRoot: string, input: WriteEventInput): Promise<void> {
  const id = ensureIdentity(worktreeRoot, deriveLabel(worktreeRoot))

  const candidate = {
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

  const redacted = redactEvent(validated.event)
  const line = JSON.stringify(redacted) + '\n'
  if (Buffer.byteLength(line, 'utf8') > MAX_EVENT_BYTES) {
    throw new Error(`event too large (>${MAX_EVENT_BYTES} bytes / 4 KiB): split or summarize the payload`)
  }

  mkdirSync(join(worktreeRoot, '.scaffold'), { recursive: true })
  appendFileSync(ledgerPath(worktreeRoot), line, { mode: 0o644 })
}

function deriveLabel(worktreeRoot: string): string {
  const segments = worktreeRoot.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? 'primary'
}
