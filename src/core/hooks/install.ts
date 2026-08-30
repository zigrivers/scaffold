import fs from 'node:fs'
import path from 'node:path'
import { atomicWriteFile } from '../../utils/fs.js'

/** .claude/settings.json — only the slice we manage is typed; every unknown
 *  key is preserved verbatim (never overwrite: git-workflow.md contract —
 *  `bd setup claude` hooks and user hooks own entries here too). */
export interface HookCommand {
  type: 'command'
  command: string
  [k: string]: unknown
}

export interface HookEntry {
  matcher?: string
  hooks: HookCommand[]
  [k: string]: unknown
}

export interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>
  [k: string]: unknown
}

export const SETTINGS_PATH = '.claude/settings.json'

/** The exact reminder command git-workflow.md registers (kept in sync with the
 *  "Configure the PostToolUse review-reminder hook" section of that step). */
export const REVIEW_REMINDER_COMMAND = [
  'jq -r \'.tool_input.command // empty\'',
  '| grep -q \'gh pr create\'',
  '&& echo \'MANDATORY: run mmr review --pr <PR#> --sync --format json before moving on',
  '(maximum 3 rounds per bounded cycle; after a concrete repair,',
  'review the new exact head from round 1; see docs/git-workflow.md).\'',
  '|| true',
].join(' ')

export interface HookSpec {
  id: string
  event: 'SessionStart' | 'PreToolUse' | 'PostToolUse'
  /** Substring marking an EQUIVALENT hook as already registered (the old
   *  `grep -q '<marker>'` semantics, scoped to this event's commands). */
  marker: string
  entry: HookEntry
  /** Human description used in report lines. */
  describe: string
  /** Null when installable; otherwise the explicit report line (D8: a missing
   *  prerequisite is REPORTED, never a silent no-op). */
  prerequisite: (projectRoot: string) => string | null
}

function executable(p: string): boolean {
  try {
    return (fs.statSync(p).mode & 0o111) !== 0
  } catch {
    return false
  }
}

export const HOOK_SPECS: HookSpec[] = [
  {
    id: 'bd-prime',
    event: 'SessionStart',
    marker: 'bd prime',
    entry: { hooks: [{ type: 'command', command: 'bd prime --hook-json' }] },
    describe: 'SessionStart: bd prime --hook-json (Beads context injection)',
    prerequisite: root =>
      fs.existsSync(path.join(root, '.beads'))
        ? null
        : 'skipped SessionStart bd prime: .beads/ not found — run the beads step (bd init) first',
  },
  {
    id: 'bd-guard',
    event: 'PreToolUse',
    marker: 'bd-guard.sh',
    entry: { matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/bd-guard.sh' }] },
    describe: 'PreToolUse: scripts/bd-guard.sh (Beads destructive-command guard)',
    prerequisite: root => {
      if (!fs.existsSync(path.join(root, '.beads'))) {
        return 'skipped PreToolUse bd-guard: .beads/ not found — run the beads step (bd init) first'
      }
      if (!executable(path.join(root, 'scripts', 'bd-guard.sh'))) {
        return (
          'skipped PreToolUse bd-guard: scripts/bd-guard.sh missing or not executable — ' +
          'run: scaffold agent-ops install --component git'
        )
      }
      return null
    },
  },
  {
    id: 'mq-guard',
    event: 'PreToolUse',
    marker: 'mq-guard.sh',
    entry: { matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/mq-guard.sh' }] },
    describe: 'PreToolUse: scripts/mq-guard.sh (merge-queue routing guard)',
    prerequisite: root =>
      executable(path.join(root, 'scripts', 'mq-guard.sh'))
        ? null
        : 'skipped PreToolUse mq-guard: scripts/mq-guard.sh missing or not executable — ' +
          'run: scaffold agent-ops install --component merge-queue',
  },
  {
    id: 'pr-review-reminder',
    event: 'PostToolUse',
    marker: 'gh pr create',
    entry: { matcher: 'Bash', hooks: [{ type: 'command', command: REVIEW_REMINDER_COMMAND }] },
    describe: 'PostToolUse: gh pr create review reminder (mmr review)',
    // No prerequisite: the marker-equivalence check below dedupes against the
    // automated-pr-review step's own variant of this reminder.
    prerequisite: () => null,
  },
]

export interface HookPlanItem {
  spec: HookSpec
  action: 'add' | 'already-present' | 'skipped'
  reason?: string
}

export interface HookPlan {
  items: HookPlanItem[]
}

function eventHasMarker(settings: ClaudeSettings, event: string, marker: string): boolean {
  for (const entry of settings.hooks?.[event] ?? []) {
    for (const h of entry.hooks ?? []) {
      if (typeof h.command === 'string' && h.command.includes(marker)) return true
    }
  }
  return false
}

/** Pure planning half — reused read-only by the adopt plan's ops-actions
 *  preview (Task 18) so the plan can render exactly what install would do. */
export function planHooks(projectRoot: string, settings: ClaudeSettings): HookPlan {
  const items: HookPlanItem[] = []
  for (const spec of HOOK_SPECS) {
    const missing = spec.prerequisite(projectRoot)
    if (missing !== null) {
      items.push({ spec, action: 'skipped', reason: missing })
      continue
    }
    if (eventHasMarker(settings, spec.event, spec.marker)) {
      items.push({ spec, action: 'already-present' })
      continue
    }
    items.push({ spec, action: 'add' })
  }
  return { items }
}

/** Pure merge half: append-only into the per-event arrays, everything else
 *  untouched (the jq `(.hooks.X // []) + [entry]` semantics). */
export function applyHookPlan(settings: ClaudeSettings, plan: HookPlan): ClaudeSettings {
  const hooks: Record<string, HookEntry[]> = { ...(settings.hooks ?? {}) }
  let changed = false
  for (const item of plan.items) {
    if (item.action !== 'add') continue
    hooks[item.spec.event] = [...(hooks[item.spec.event] ?? []), item.spec.entry]
    changed = true
  }
  return changed ? { ...settings, hooks } : settings
}

export function readSettings(projectRoot: string): ClaudeSettings {
  const p = path.join(projectRoot, SETTINGS_PATH)
  if (!fs.existsSync(p)) return {}
  // Malformed JSON throws — NEVER clobber a file we cannot faithfully re-emit.
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${SETTINGS_PATH} is not a JSON object — refusing to modify it`)
  }
  return parsed as ClaudeSettings
}

/** Atomic write via the codebase-wide helper (temp file + rename, no torn
 *  settings). Reuses `atomicWriteFile` from src/utils/fs.ts — do NOT hand-roll
 *  temp-file-and-rename here. */
export function writeSettings(projectRoot: string, settings: ClaudeSettings): void {
  const p = path.join(projectRoot, SETTINGS_PATH)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  atomicWriteFile(p, JSON.stringify(settings, null, 2) + '\n')
}

export interface HooksInstallResult {
  /** describe lines of hooks registered by this run. */
  added: string[]
  /** describe lines of hooks whose marker was already present. */
  alreadyPresent: string[]
  /** One entry per hook whose prerequisite is missing (explicit, D8). */
  skipped: { hook: string; reason: string }[]
  settingsPath: string
  changed: boolean
}

/** The D8 primitive: idempotent deep-merge registration of the Claude Code
 *  hooks. Consumed by `scaffold hooks install` (Task 13), the bootstrap arm
 *  step (Task 15), and doctor's hook-reregistration fix (Task 16). */
export function installHooks(projectRoot: string): HooksInstallResult {
  const settings = readSettings(projectRoot)
  const plan = planHooks(projectRoot, settings)
  const next = applyHookPlan(settings, plan)
  const changed = plan.items.some(i => i.action === 'add')
  if (changed) writeSettings(projectRoot, next)
  return {
    added: plan.items.filter(i => i.action === 'add').map(i => i.spec.describe),
    alreadyPresent: plan.items.filter(i => i.action === 'already-present').map(i => i.spec.describe),
    skipped: plan.items
      .filter(i => i.action === 'skipped')
      .map(i => ({ hook: i.spec.describe, reason: i.reason ?? '' })),
    settingsPath: path.join(projectRoot, SETTINGS_PATH),
    changed,
  }
}
