export interface ConfigChangeReport {
  /** Whether the diff touches `./.mmr.yaml` at all. */
  config_file_changed: boolean
  /** Paths under `./.mmr/acks/` touched by the diff (added/modified/removed). */
  ack_files_changed: string[]
}

const DIFF_FILE_LINE_RE = /^diff --git a\/(\S+) b\/(\S+)/

/**
 * Inspect a unified diff for changes to MMR trust-relevant files: the project
 * config (`.mmr.yaml`) and any project acks (`.mmr/acks/*`). Callers use this
 * to force `needs-user-decision` when a diff under review proposes new
 * config/acks, so an untrusted PR can't silently change channels or suppress
 * its own findings.
 */
export function detectConfigChanges(diff: string): ConfigChangeReport {
  const report: ConfigChangeReport = { config_file_changed: false, ack_files_changed: [] }
  if (!diff) return report
  for (const line of diff.split('\n')) {
    const m = DIFF_FILE_LINE_RE.exec(line)
    if (!m) continue
    // Use the post-image (b/) path; for deletions/renames it still names the
    // affected MMR file.
    const filePath = m[2]
    if (filePath === '.mmr.yaml') {
      report.config_file_changed = true
    } else if (filePath.startsWith('.mmr/acks/')) {
      if (!report.ack_files_changed.includes(filePath)) {
        report.ack_files_changed.push(filePath)
      }
    }
  }
  return report
}
