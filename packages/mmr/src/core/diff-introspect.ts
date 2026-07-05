export interface ConfigChangeReport {
  /** Whether the diff touches `./.mmr.yaml` at all. */
  config_file_changed: boolean
  /** Paths under `./.mmr/acks/` touched by the diff (added/modified/removed). */
  ack_files_changed: string[]
}

// Lines that name files in a unified/combined diff, across producers:
// `git diff` (a/ b/), `git diff --no-prefix`, raw `diff -u` (---/+++ only),
// merge diffs (`diff --cc`), and rename/copy metadata. We inspect only these
// header-ish lines (not hunk bodies) for the sentinel paths.
const HEADER_RE =
  /^(?:diff --git |diff --cc |diff --combined |--- |\+\+\+ |rename (?:from|to) |copy (?:from|to) )/
// `.mmr.yaml` as a path component (start, separator, or quote on each side),
// case-insensitive so a casing variant on case-insensitive filesystems still
// trips the gate (over-detection is the safe failure mode here).
const CONFIG_RE = /(?:^|[\s/"'])\.mmr\.yaml(?:["'\s]|$)/i
// Any `.mmr/acks/<file>` occurrence; the match starts at `.mmr` so a leading
// a//b/ prefix is naturally excluded.
const ACK_RE = /\.mmr\/acks\/[^\s"']+/gi

/**
 * Inspect a unified diff for changes to MMR trust-relevant files: the project
 * config (`.mmr.yaml`) and any project acks (`.mmr/acks/*`). Callers use this
 * to force `needs-user-decision` when a diff under review proposes new
 * config/acks, so an untrusted PR can't silently change channels or suppress
 * its own findings.
 *
 * The diff is attacker-controllable (`--diff`/stdin), so detection is
 * deliberately liberal: it matches across diff producers (git a/b, --no-prefix,
 * raw diff -u, merge `--cc`, rename/copy) and is case-insensitive. Spurious
 * over-detection only forces a (overridable) user decision — the safe
 * direction — while a miss would silently trust attacker config/acks.
 */
export function detectConfigChanges(diff: string): ConfigChangeReport {
  const report: ConfigChangeReport = { config_file_changed: false, ack_files_changed: [] }
  if (!diff) return report
  const acks = new Set<string>()
  for (const line of diff.split('\n')) {
    if (!HEADER_RE.test(line)) continue
    if (CONFIG_RE.test(line)) report.config_file_changed = true
    for (const m of line.matchAll(ACK_RE)) acks.add(m[0])
  }
  report.ack_files_changed = [...acks]
  return report
}


/**
 * Extract the set of all modified/added/renamed file paths from a unified diff.
 * Returns normalized paths (leading "./" and duplicate slashes removed).
 */
export function getModifiedFilesFromDiff(diff: string): Set<string> {
  const files = new Set<string>()
  if (!diff) return files
  const lines = diff.split('\n')
  for (const line of lines) {
    if (line.startsWith('--- ')) {
      const pathPart = line.slice(4).trim()
      if (pathPart && pathPart !== '/dev/null') {
        const clean = pathPart.replace(/^(?:a|b)\//, '').replace(/^\.\//, '').replace(/\/+/g, '/')
        files.add(clean)
      }
    } else if (line.startsWith('+++ ')) {
      const pathPart = line.slice(4).trim()
      if (pathPart && pathPart !== '/dev/null') {
        const clean = pathPart.replace(/^(?:a|b)\//, '').replace(/^\.\//, '').replace(/\/+/g, '/')
        files.add(clean)
      }
    } else if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git\s+(?:"?a\/(.+?)"?)\s+(?:"?b\/(.+?)"?)$/)
      if (match) {
        if (match[1]) files.add(match[1].replace(/^\.\//, '').replace(/\/+/g, '/'))
        if (match[2]) files.add(match[2].replace(/^\.\//, '').replace(/\/+/g, '/'))
      } else {
        const parts = line.slice(11).split(' ')
        if (parts.length >= 2) {
          const p1 = parts[0].replace(/^(?:a|b)\//, '').replace(/^"|"$/g, '').replace(/^\.\//, '').replace(/\/+/g, '/')
          const p2 = parts[1].replace(/^(?:a|b)\//, '').replace(/^"|"$/g, '').replace(/^\.\//, '').replace(/\/+/g, '/')
          files.add(p1)
          files.add(p2)
        }
      }
    }
  }
  return files
}
