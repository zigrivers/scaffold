import type { Event, EventType } from './types.js'

export const EVENT_PAYLOAD_KEYS: Record<EventType, string[]> = {
  task_claimed:         ['task_title', 'story_id', 'wave', 'unplanned'],
  task_completed:       ['outcome', 'pr_number', 'commit_sha'],
  decision_recorded:    ['key', 'summary', 'affects', 'links'],
  blocker_hit:          ['kind', 'summary'],
  blocker_resolved:     ['summary', 'references'],
  pr_opened:            ['pr_number'],
  progress_heartbeat:   ['note'],
  finding_acknowledged: ['finding_id', 'status', 'note'],
}

export type ValidationResult =
  | { ok: true; event: Event; dropped_fields: string[] }
  | { ok: false; errors: string[] }

const REQUIRED_BASE = ['event_id', 'worktree_id', 'actor_label', 'branch', 'type', 'ts'] as const
// Anchored: requires timezone (Z or ±HH:MM); rejects trailing junk and invalid calendar values
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

function isValidIso(ts: string): boolean {
  if (!ISO_8601_RE.test(ts)) return false
  const d = new Date(ts)
  return !isNaN(d.getTime())
}

const VALID_OUTCOMES = ['pr_submitted', 'dropped', 'superseded'] as const
const VALID_BLOCKER_KINDS = ['dependency', 'ambiguity', 'external', 'environment'] as const
const VALID_ACK_STATUSES = ['acknowledged', 'open'] as const

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

function optStr(label: string, v: unknown, errors: string[]): void {
  if (v !== undefined && typeof v !== 'string') errors.push(`${label} must be a string when present`)
}

function optBool(label: string, v: unknown, errors: string[]): void {
  if (v !== undefined && typeof v !== 'boolean') errors.push(`${label} must be a boolean when present`)
}

function optStrArr(label: string, v: unknown, errors: string[]): void {
  if (v !== undefined && !isStringArray(v)) {
    errors.push(`${label} must be a string[] when present`)
  }
}

export function validateEvent(input: unknown): ValidationResult {
  const errors: string[] = []
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: ['event must be an object'] }
  }
  const e = input as Record<string, unknown>

  for (const k of REQUIRED_BASE) {
    if (typeof e[k] !== 'string') errors.push(`${k} must be a string`)
  }
  if (typeof e.ts === 'string' && !isValidIso(e.ts)) {
    errors.push('ts must be a valid ISO 8601 UTC/offset timestamp')
  }
  // task_id is a required field that may be null (not optional/absent)
  if (e.task_id !== null && typeof e.task_id !== 'string') {
    errors.push('task_id must be a string or null')
  }
  if (!('task_id' in e)) {
    errors.push('task_id is required (string or null)')
  }
  if (typeof e.payload !== 'object' || e.payload === null) {
    errors.push('payload must be an object')
  }
  if (errors.length > 0) return { ok: false, errors }

  const type = e.type as EventType
  if (!(type in EVENT_PAYLOAD_KEYS)) {
    return { ok: false, errors: [`unknown event type: ${String(type)}`] }
  }

  const allowedKeys = EVENT_PAYLOAD_KEYS[type]
  const inputPayload = e.payload as Record<string, unknown>
  const filteredPayload: Record<string, unknown> = {}
  const droppedFields: string[] = []
  for (const [k, v] of Object.entries(inputPayload)) {
    if (allowedKeys.includes(k)) filteredPayload[k] = v
    else droppedFields.push(k)
  }

  switch (type) {
  case 'task_claimed':
    if (typeof filteredPayload.task_title !== 'string') {
      errors.push('task_claimed.payload.task_title required')
    }
    optStr('task_claimed.payload.story_id', filteredPayload.story_id, errors)
    optStr('task_claimed.payload.wave', filteredPayload.wave, errors)
    optBool('task_claimed.payload.unplanned', filteredPayload.unplanned, errors)
    if (e.task_id === null && filteredPayload.unplanned !== true) {
      errors.push('task_claimed with task_id=null requires payload.unplanned=true')
    }
    break
  case 'task_completed':
    if (!VALID_OUTCOMES.includes(filteredPayload.outcome as never)) {
      errors.push('task_completed.payload.outcome must be pr_submitted | dropped | superseded')
    }
    if (filteredPayload.outcome === 'pr_submitted' && typeof filteredPayload.pr_number !== 'number') {
      errors.push('task_completed.payload.pr_number required when outcome=pr_submitted')
    }
    optStr('task_completed.payload.commit_sha', filteredPayload.commit_sha, errors)
    break
  case 'decision_recorded':
    if (typeof filteredPayload.key !== 'string') errors.push('decision_recorded.payload.key required')
    if (typeof filteredPayload.summary !== 'string') errors.push('decision_recorded.payload.summary required')
    if (!isStringArray(filteredPayload.affects)) errors.push('decision_recorded.payload.affects must be string[]')
    optStrArr('decision_recorded.payload.links', filteredPayload.links, errors)
    break
  case 'blocker_hit':
    if (!VALID_BLOCKER_KINDS.includes(filteredPayload.kind as never)) {
      errors.push('blocker_hit.payload.kind must be dependency | ambiguity | external | environment')
    }
    if (typeof filteredPayload.summary !== 'string') errors.push('blocker_hit.payload.summary required')
    break
  case 'blocker_resolved':
    if (typeof filteredPayload.summary !== 'string') errors.push('blocker_resolved.payload.summary required')
    if (!isStringArray(filteredPayload.references)) {
      errors.push('blocker_resolved.payload.references must be string[]')
    }
    break
  case 'pr_opened':
    if (typeof filteredPayload.pr_number !== 'number') errors.push('pr_opened.payload.pr_number required')
    break
  case 'progress_heartbeat':
    if (typeof filteredPayload.note !== 'string') errors.push('progress_heartbeat.payload.note required')
    break
  case 'finding_acknowledged':
    if (e.task_id !== null) errors.push('finding_acknowledged requires task_id=null')
    if (typeof filteredPayload.finding_id !== 'string') {
      errors.push('finding_acknowledged.payload.finding_id required')
    }
    if (!VALID_ACK_STATUSES.includes(filteredPayload.status as never)) {
      errors.push('finding_acknowledged.payload.status must be acknowledged | open')
    }
    optStr('finding_acknowledged.payload.note', filteredPayload.note, errors)
    break
  }

  if (errors.length > 0) return { ok: false, errors }

  // Double-cast is deliberate: the Event union is too narrow for generic construction;
  // runtime validation above ensures shape correctness before this cast.
  const event: Event = {
    event_id:    e.event_id as string,
    worktree_id: e.worktree_id as string,
    actor_label: e.actor_label as string,
    branch:      e.branch as string,
    task_id:     e.task_id as string | null,
    type,
    ts:          e.ts as string,
    payload:     filteredPayload,
  } as unknown as Event

  return { ok: true, event, dropped_fields: droppedFields }
}
