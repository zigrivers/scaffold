import type { ReconciledResults } from '../types.js'

/**
 * Headline label for a verdict.
 *
 * `degraded-pass` used to render as the bare string "PASSED" — indistinguishable
 * from a clean run, with the participation buried on the following line as
 * "Channels: 3/6". Reviews get read by their first line (and, in markdown, by
 * their heading in a PR comment), which is exactly where overstating the
 * evidence does the most damage. The suffix is appended rather than replacing
 * "PASSED" so anything already grepping for that string keeps matching.
 *
 * Shared by the text and markdown formatters so the two cannot drift.
 */
export function verdictLabel(results: ReconciledResults): string {
  switch (results.verdict) {
  case 'pass': return 'PASSED'
  case 'degraded-pass': {
    const { channels_completed: done, channels_dispatched: sent } = results.metadata
    return `PASSED (DEGRADED — ${done}/${sent} channels)`
  }
  case 'blocked': return 'BLOCKED'
  case 'needs-user-decision': return 'NEEDS DECISION'
  default: return 'UNKNOWN'
  }
}
