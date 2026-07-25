import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { AGENT_OPS_FILE_MAP, plannedInstallPaths, type AgentOpsComponent } from '../core/agent-ops/install.js'
import { loadAgentOpsConfig } from '../core/agent-ops/config.js'
import { planHooks, readSettings } from '../core/hooks/install.js'
import { buildPostMergePollerJob } from '../sched/jobs.js'
import { readJournal } from '../merge-queue/journal.js'

/** One ops action the adopt plan previews (§6.1 R2). The canonical JSON of
 *  these records joins the plan_key input (D1), so any change to what apply
 *  would install — component, file list, command — forces re-approval. */
export interface OpsActionRecord {
  action: 'install-component' | 'hooks-install' | 'sched-install' | 'bootstrap-merge-required'
  command: string
  /** Exact files the action creates or edits (spec: "with the exact file list"). */
  files: string[]
  detail: string
}

export interface OpsProbes {
  /** Test seam: the sched-install record's file descriptors. Yields a STABLE,
   *  machine/OS-independent form (the job unitBase) — never resolved absolute
   *  unit paths, which would make plan_key machine-dependent. */
  schedUnitPaths?: (projectRoot: string) => string[]
}

function componentDests(component: AgentOpsComponent): string[] {
  return Object.values(AGENT_OPS_FILE_MAP)
    .filter(s => s.component === component)
    .map(s => s.dest)
    .sort()
}

/** Queue intent = the config declares merge_queue, or the guard is installed. */
function queueIntent(projectRoot: string): boolean {
  if (fs.existsSync(path.join(projectRoot, 'scripts', 'mq-guard.sh'))) return true
  const cfg = path.join(projectRoot, '.scaffold', 'agent-ops.yaml')
  if (!fs.existsSync(cfg)) return false
  try {
    const raw = yaml.load(fs.readFileSync(cfg, 'utf8'))
    return typeof raw === 'object' && raw !== null && 'merge_queue' in (raw as Record<string, unknown>)
  } catch {
    return false
  }
}

function defaultSchedUnitPaths(projectRoot: string): string[] {
  try {
    // STABLE, machine/OS-independent descriptor. The resolved absolute unit
    // paths (`pickSchedBackend().unitPaths(...)`) are home- and OS-specific
    // (macOS `~/Library/LaunchAgents/com.<p>.merge-poller.plist` vs Linux
    // `~/.config/systemd/user/scaffold-<p>-merge-poller.{service,timer}`), so
    // they MUST NOT enter this record: buildOpsActions feeds `plan_key`, and the
    // same repo state must hash identically on every machine. Key on the job's
    // project-derived `unitBase` instead — the concrete install paths resolve at
    // install time and are surfaced by `scaffold sched install` itself.
    return [`${buildPostMergePollerJob(projectRoot).unitBase} (scheduler unit)`]
  } catch {
    // Project name unresolvable / unsupported platform — the record still
    // previews the action itself.
    return []
  }
}

/** Read-only, deterministic preview of the R2 ops actions. NEVER writes. */
export function buildOpsActions(projectRoot: string, probes: OpsProbes = {}): OpsActionRecord[] {
  const records: OpsActionRecord[] = []
  const queue = queueIntent(projectRoot)

  const components: AgentOpsComponent[] = queue
    ? ['git', 'staging', 'merge-queue', 'gate']
    : ['git', 'staging']
  for (const component of components) {
    // Decision: the component needs installing when any of its own seed/dest
    // files are missing.
    const missing = componentDests(component)
      .filter(dest => !fs.existsSync(path.join(projectRoot, dest)))
    if (missing.length === 0) continue
    records.push({
      action: 'install-component',
      command: `scaffold agent-ops install --component ${component}`,
      // Report the COMPLETE write set the install command touches — component
      // files PLUS the manifest, version marker, Makefile include, and (for
      // merge-queue) .gitignore — so the preview and plan_key never omit an
      // apply-relevant write. Derived from the installer, never hand-rolled.
      files: plannedInstallPaths([component]),
      detail: component === 'gate'
        ? 'generates the gate seeds (project-owned after generation; ingestion-lite classification '
          + 'shown at install); also refreshes the ownership manifest, version marker, and Makefile include'
        : `${component} component install (component files currently missing; also refreshes the manifest, `
          + 'version marker, and Makefile include)',
    })
  }

  let hookAdds: string[] = []
  try {
    hookAdds = planHooks(projectRoot, readSettings(projectRoot))
      .items.filter(i => i.action === 'add')
      .map(i => i.spec.describe)
  } catch {
    hookAdds = [] // malformed settings.json — hooks install refuses; doctor reports it
  }
  if (hookAdds.length > 0) {
    records.push({
      action: 'hooks-install',
      command: 'scaffold hooks install',
      files: ['.claude/settings.json'],
      detail: `registers: ${hookAdds.join('; ')}`,
    })
  }

  let schedRecommended = false
  if (queue) {
    try {
      schedRecommended = loadAgentOpsConfig(projectRoot).merge_queue.gate_executor === 'local-poller'
    } catch {
      // Malformed/invalid .scaffold/agent-ops.yaml — loadAgentOpsConfig throws.
      // buildOpsActions is a read-only preview (feeds plan_key), so degrade
      // gracefully: skip the sched recommendation rather than crash `scaffold
      // adopt` with a raw stack trace. `scaffold doctor` reports the bad config.
      schedRecommended = false
    }
  }
  if (schedRecommended) {
    records.push({
      action: 'sched-install',
      command: 'scaffold sched install post-merge-poller',
      files: (probes.schedUnitPaths ?? defaultSchedUnitPaths)(projectRoot),
      detail: 'post-merge full-suite poller (600s default; launchd/systemd; the installer verifies '
        + 'the job actually loaded)',
    })
  }

  if (queue) {
    const armed = readJournal(path.join(projectRoot, '.mq'))
      .some(e => e.type === 'bootstrap_armed' || (e.type === 'pr_state' && e.state === 'LANDED'))
    if (!armed) {
      records.push({
        action: 'bootstrap-merge-required',
        command: 'scaffold mq bootstrap --pr <first-queue-PR>',
        files: ['.mq/journal.jsonl'],
        detail: 'the PR that installs the queue cannot ride it — bootstrap runs the arm-first guided first '
          + 'merge (full gate on the PR head, hooks/sched armed, journaled squash-merge with head '
          + 'revalidation, daemon smoke + doctor)',
      })
    }
  }

  records.sort((a, b) => `${a.action}:${a.command}`.localeCompare(`${b.action}:${b.command}`))
  return records
}

/** Markdown/human rendering of the preview section (appended to the plan). */
export function renderOpsActionsSection(records: OpsActionRecord[]): string[] {
  // These are a PREVIEW/checklist of follow-up commands the user runs after
  // adopt — `scaffold adopt --apply` writes only config/state (see
  // applyAdoptionPlan), it does NOT install components, hooks, schedulers, or
  // run the bootstrap merge. The header must not claim otherwise.
  const lines: string[] = [
    '## Ops actions (recommended follow-up commands — run these after adopt; NOT executed by --apply)',
  ]
  if (records.length === 0) {
    lines.push('', 'None — the ops surface is already installed.')
    return lines
  }
  for (const r of records) {
    lines.push('', `- **${r.action}** — \`${r.command}\``, `  ${r.detail}`)
    for (const f of r.files) lines.push(`  - ${f}`)
  }
  return lines
}
