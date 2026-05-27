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
  knowledge_gap_signal: ['topic', 'source', 'project_id', 'step_name', 'agent_excerpt'],
}

export type ValidationResult =
  | { ok: true; event: Event; dropped_fields: string[] }
  | { ok: false; errors: string[] }

const REQUIRED_BASE = ['event_id', 'worktree_id', 'actor_label', 'branch', 'type', 'ts'] as const
// Anchored ISO 8601: requires timezone (Z or ±HH:MM); rejects trailing junk
const ISO_PARTS_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/

function isValidIso(ts: string): boolean {
  const m = ISO_PARTS_RE.exec(ts)
  if (!m) return false
  const [yr, mo, dy, hr, mn, sc] = [+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]]
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31 || hr > 23 || mn > 59 || sc > 59) return false
  const d = new Date(ts)
  if (isNaN(d.getTime())) return false
  // Round-trip: shift UTC back to local time to detect calendar overflow (e.g. Feb 30)
  // that JS Date normalizes silently instead of returning NaN.
  const offSign = m[8] === '-' ? -1 : 1
  const offMs = m[8] ? offSign * (+m[9] * 60 + +m[10]) * 60000 : 0
  const local = new Date(d.getTime() + offMs)
  return (
    local.getUTCFullYear() === yr && local.getUTCMonth() + 1 === mo &&
    local.getUTCDate() === dy && local.getUTCHours() === hr && local.getUTCMinutes() === mn
  )
}

const VALID_OUTCOMES = ['pr_submitted', 'dropped', 'superseded'] as const
const VALID_BLOCKER_KINDS = ['dependency', 'ambiguity', 'external', 'environment'] as const
const VALID_ACK_STATUSES = ['acknowledged', 'open'] as const
const VALID_GAP_SOURCES = ['agent_search', 'lessons', 'manual'] as const

/**
 * Type guard for "is `value` one of the strings in `values`?" against a
 * readonly tuple. Replaces the `VALID_X.includes(value as never)` pattern
 * — the `as never` cast bypassed `.includes`'s strict tuple typing
 * (Phase 3 deferred-finding F-001 / workstream C). A single `as
 * readonly string[]` widening on the array side is type-safe; the
 * caller gets narrowing back to the tuple's union via the type predicate.
 */
function isOneOf<T extends readonly string[]>(
  values: T, value: unknown,
): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

function optStr(label: string, v: unknown, errors: string[], maxLen?: number): void {
  if (v !== undefined && typeof v !== 'string') {
    errors.push(`${label} must be a string when present`)
  } else if (v !== undefined && maxLen !== undefined && (v as string).length > maxLen) {
    errors.push(`${label} must be ≤${maxLen} chars`)
  }
}

function reqStr(label: string, v: unknown, errors: string[], maxLen?: number): void {
  if (typeof v !== 'string') {
    errors.push(`${label} required`)
  } else if (maxLen !== undefined && v.length > maxLen) {
    errors.push(`${label} must be ≤${maxLen} chars`)
  }
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
  if (!Object.hasOwn(EVENT_PAYLOAD_KEYS, type)) {
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
    if (!isOneOf(VALID_OUTCOMES, filteredPayload.outcome)) {
      errors.push('task_completed.payload.outcome must be pr_submitted | dropped | superseded')
    }
    if (filteredPayload.outcome === 'pr_submitted' && filteredPayload.pr_number === undefined) {
      errors.push('task_completed.payload.pr_number required when outcome=pr_submitted')
    }
    if (filteredPayload.pr_number !== undefined &&
        !(Number.isSafeInteger(filteredPayload.pr_number) && (filteredPayload.pr_number as number) > 0)) {
      errors.push('task_completed.payload.pr_number must be a positive integer when present')
    }
    optStr('task_completed.payload.commit_sha', filteredPayload.commit_sha, errors)
    break
  case 'decision_recorded':
    reqStr('decision_recorded.payload.key', filteredPayload.key, errors)
    reqStr('decision_recorded.payload.summary', filteredPayload.summary, errors, 500)
    if (!isStringArray(filteredPayload.affects)) errors.push('decision_recorded.payload.affects must be string[]')
    optStrArr('decision_recorded.payload.links', filteredPayload.links, errors)
    break
  case 'blocker_hit':
    if (!isOneOf(VALID_BLOCKER_KINDS, filteredPayload.kind)) {
      errors.push('blocker_hit.payload.kind must be dependency | ambiguity | external | environment')
    }
    reqStr('blocker_hit.payload.summary', filteredPayload.summary, errors, 500)
    break
  case 'blocker_resolved':
    reqStr('blocker_resolved.payload.summary', filteredPayload.summary, errors, 500)
    if (!isStringArray(filteredPayload.references)) {
      errors.push('blocker_resolved.payload.references must be string[]')
    }
    break
  case 'pr_opened':
    if (!(Number.isSafeInteger(filteredPayload.pr_number) && (filteredPayload.pr_number as number) > 0)) {
      errors.push('pr_opened.payload.pr_number must be a positive integer')
    }
    break
  case 'progress_heartbeat':
    reqStr('progress_heartbeat.payload.note', filteredPayload.note, errors, 200)
    break
  case 'finding_acknowledged':
    if (e.task_id !== null) errors.push('finding_acknowledged requires task_id=null')
    if (typeof filteredPayload.finding_id !== 'string') {
      errors.push('finding_acknowledged.payload.finding_id required')
    }
    if (!isOneOf(VALID_ACK_STATUSES, filteredPayload.status)) {
      errors.push('finding_acknowledged.payload.status must be acknowledged | open')
    }
    optStr('finding_acknowledged.payload.note', filteredPayload.note, errors, 200)
    break
  case 'knowledge_gap_signal':
    reqStr('knowledge_gap_signal.payload.topic', filteredPayload.topic, errors, 80)
    if (typeof filteredPayload.topic === 'string' &&
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(filteredPayload.topic)) {
      errors.push(
        'knowledge_gap_signal.payload.topic must be kebab-case slug ' +
        '(lowercase, hyphen-separated)',
      )
    }
    if (!isOneOf(VALID_GAP_SOURCES, filteredPayload.source)) {
      errors.push(
        'knowledge_gap_signal.payload.source must be agent_search | lessons | manual',
      )
    }
    if (typeof filteredPayload.project_id !== 'string') {
      errors.push('knowledge_gap_signal.payload.project_id required')
    } else if (filteredPayload.project_id === 'lessons') {
      if (filteredPayload.source !== 'lessons') {
        errors.push(
          'knowledge_gap_signal.payload.project_id="lessons" is reserved for synthetic ' +
          'lessons.md scanner signals; source must also be "lessons"',
        )
      }
    } else if (!/^[a-f0-9]{64}$/.test(filteredPayload.project_id)) {
      errors.push(
        'knowledge_gap_signal.payload.project_id must be a 64-char sha256 hex string',
      )
    }
    optStr('knowledge_gap_signal.payload.step_name', filteredPayload.step_name, errors)
    optStr('knowledge_gap_signal.payload.agent_excerpt', filteredPayload.agent_excerpt, errors, 200)
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
