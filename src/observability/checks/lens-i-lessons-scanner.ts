import fs from 'node:fs'

/**
 * Synthetic gap-signal payload produced by the lessons scanner. Mirrors
 * the KnowledgeGapSignalPayload defined in
 * src/observability/engine/types.ts but is duplicated locally so this
 * file stays in the checks/ tree alongside the lens code. T4 will
 * unify the import once the lens consumes both.
 */
export interface LessonsGapSignalPayload {
  topic: string
  source: 'lessons'
  project_id: 'lessons'
  step_name?: string
  agent_excerpt?: string
}

const EXPLICIT_MARKER_RE = /<!--\s*gap-topic:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->/g

// Sentence-terminating . ! ? end the capture only when followed by
// whitespace or end-of-line. This preserves version-style dots inside
// topics (e.g. "react-19.0") while still terminating real sentence
// ends ("missing knowledge: foo." captures "foo"). Quotes/backticks
// terminate unconditionally.
const TERM = '(?:["`]|[.!?](?=\\s|$))'
const HEURISTIC_PATTERNS: RegExp[] = [
  new RegExp(
    '(?:would have helped to have|missing) (?:a )?' +
    '(?:guide|knowledge entry|entry) (?:on|for|about) ' +
    `["\`']?(.+?)${TERM}`, 'i',
  ),
  new RegExp(`no (?:knowledge|kb) entry for ["\`']?(.+?)${TERM}`, 'i'),
  new RegExp(`missing knowledge:\\s*["\`']?(.+?)${TERM}`, 'i'),
]

const FENCE_RE = /^\s*```/

/**
 * Normalize a captured topic phrase to a validator-compatible
 * kebab-case slug. Matches the spec §2.3 contract — must always
 * produce strings satisfying ^[a-z0-9]+(-[a-z0-9]+)*$ or empty string.
 */
export function normalizeTopic(raw: string): string {
  return raw.toLowerCase()
    .replace(/['\u2018\u2019]/g, '')        // strip ASCII + U+2018 + U+2019 smart-quote apostrophes
    .replace(/[^a-z0-9-]+/g, '-')           // any other non-slug char becomes a hyphen
    .replace(/-{2,}/g, '-')                 // collapse repeated hyphens
    .replace(/^-+|-+$/g, '')               // trim leading/trailing hyphens
}

/**
 * Reads an absolute path to a lessons.md file and returns synthetic
 * gap-signal payloads. Returns [] on missing/empty file (no throws).
 *
 * Lens I owns path resolution; this scanner reads exactly the path
 * it's given.
 */
export function scanLessonsForGaps(absPath: string): LessonsGapSignalPayload[] {
  let content: string
  try {
    content = fs.readFileSync(absPath, 'utf8')
  } catch {
    return [] // missing file is the default expected state
  }
  if (content.trim() === '') return []

  const out: LessonsGapSignalPayload[] = []

  // Normalize CRLF → LF before splitting so trailing \r doesn't leak into captures.
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let insideFence = false

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      insideFence = !insideFence
      continue
    }
    if (insideFence) continue

    // Pass 1 — explicit markers (multiple per line OK via /g)
    EXPLICIT_MARKER_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = EXPLICIT_MARKER_RE.exec(line)) !== null) {
      const slug = m[1]
      if (slug && isValidTopic(slug)) {
        out.push({
          topic: slug,
          source: 'lessons',
          project_id: 'lessons',
          agent_excerpt: line.slice(0, 200),
        })
      }
    }

    // Pass 2 — heuristic patterns (first match per line per regex is enough)
    for (const re of HEURISTIC_PATTERNS) {
      const match = re.exec(line)
      if (!match) continue
      const normalized = normalizeTopic(match[1] ?? '')
      if (!isValidTopic(normalized)) continue
      out.push({
        topic: normalized,
        source: 'lessons',
        project_id: 'lessons',
        agent_excerpt: line.slice(0, 200),
      })
    }
  }

  return out
}

/**
 * Synthetic payloads from this scanner never round-trip through the
 * runtime validator (they're consumed in-memory by Lens I), but the
 * scanner enforces the same kebab-case-slug ≤80-chars contract here
 * so the in-process payloads remain shape-compatible with
 * KnowledgeGapSignalPayload from the canonical types. Drops
 * (rather than truncates) overlong topics — an 80+ char topic is
 * almost always a runaway regex capture, not a real gap.
 */
const TOPIC_MAX = 80
const TOPIC_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function isValidTopic(topic: string): boolean {
  return topic.length > 0 && topic.length <= TOPIC_MAX && TOPIC_SLUG_RE.test(topic)
}
