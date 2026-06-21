import { stripMarkdownFences, extractJson, fixTrailingCommas } from './parser.js'

/**
 * CLI envelope keys whose string value carries the model's actual reply. The
 * subprocess channels wrap their output differently — claude → `result`,
 * grok → `text`, gemini → `response` — so when the parsed JSON is a wrapper, we
 * recurse into the inner string. Codex returns the reply directly.
 */
const WRAPPER_KEYS = ['result', 'text', 'response', 'output', 'content', 'message']

/**
 * Extract the model's JSON value from raw channel stdout: strip markdown fences,
 * pull out the first balanced JSON object, and transparently unwrap the per-CLI
 * envelope. Returns the parsed value, or null when there is no parseable JSON.
 */
export function extractModelJson(raw: string, depth = 2): unknown | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(fixTrailingCommas(extractJson(stripMarkdownFences(raw))))
  } catch {
    return null
  }
  if (depth > 0 && parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    for (const key of WRAPPER_KEYS) {
      if (typeof record[key] === 'string') {
        const inner = extractModelJson(record[key] as string, depth - 1)
        if (inner !== null) return inner
      }
    }
  }
  return parsed
}
