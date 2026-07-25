import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkSync } from 'proper-lockfile'
import { loadPipelineContext } from '../core/pipeline/context.js'
import { resolvePipeline } from '../core/pipeline/resolver.js'
import { StateManager } from '../state/state-manager.js'
import { StatePathResolver } from '../state/state-path-resolver.js'
import { verifyStep } from '../state/completion.js'
import { fixHookRegistration, fixSchedulerReload } from './fixes/ops-fixes.js'
import type { DoctorCheck, DoctorCheckResult, DoctorStatus } from './types.js'

const BD_VERSION_FLOOR = '1.1.0'

function res(
  check: Pick<DoctorCheck, 'id' | 'section' | 'title'>,
  status: DoctorStatus,
  detail: string,
  remediation?: string,
): DoctorCheckResult {
  return {
    id: check.id, section: check.section, title: check.title, status, detail,
    ...(remediation !== undefined ? { remediation } : {}),
  }
}

function versionAtLeast(version: string, floor: string): boolean {
  const a = version.split('.').map(Number)
  const b = floor.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return true
}

// --- pipeline -------------------------------------------------------------

export const pipelineVerificationCheck: DoctorCheck = {
  id: 'pipeline/verification',
  section: 'pipeline',
  title: 'completed steps verified (all outputs + detect)',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.scaffold', 'state.json'))) {
      return res(pipelineVerificationCheck, 'skip', 'not configured (no .scaffold/state.json)')
    }
    const context = loadPipelineContext(ctx.projectRoot)
    const pipeline = resolvePipeline(context, {})
    const state = StateManager.loadStateReadOnly(
      ctx.projectRoot, new StatePathResolver(ctx.projectRoot), () => context.config ?? undefined,
    )
    const conflicts: string[] = []
    let verified = 0
    for (const [slug, entry] of Object.entries(state.steps)) {
      if (entry.status !== 'completed') continue
      const meta = pipeline.stepMeta.get(slug)
      const verification = verifyStep(
        slug, entry, meta?.outputs ?? entry.produces ?? [], meta?.detect ?? null, ctx.projectRoot,
      )
      if (verification.status === 'conflict') conflicts.push(slug)
      else if (verification.verification === 'verified') verified++
    }
    if (conflicts.length > 0) {
      return res(pipelineVerificationCheck, 'error',
        `${conflicts.length} completed step(s) fail live verification: ${conflicts.sort().join(', ')}`,
        'scaffold adopt (review the rendered plan), then scaffold adopt --apply --plan <path>')
    }
    return res(pipelineVerificationCheck, 'ok',
      `${verified} completed step(s) verified against disk + detect contracts`)
  },
}

// --- beads ----------------------------------------------------------------

export const beadsBinaryCheck: DoctorCheck = {
  id: 'beads/binary',
  section: 'beads',
  title: 'bd installed and at least the supported floor',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.beads'))) {
      return res(beadsBinaryCheck, 'skip', 'not configured (no .beads/)')
    }
    const version = ctx.runCmd('bd --version')
    if (version.status !== 0) {
      return res(beadsBinaryCheck, 'error', '.beads/ exists but bd is not on PATH',
        'install beads (see docs/beads-workflow.md), then re-run scaffold doctor')
    }
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(version.stdout)
    if (match === null) {
      return res(beadsBinaryCheck, 'warn', `could not parse bd version from: ${version.stdout.trim()}`)
    }
    if (!versionAtLeast(match[0], BD_VERSION_FLOOR)) {
      return res(beadsBinaryCheck, 'warn',
        `bd ${match[0]} is below the supported floor ${BD_VERSION_FLOOR}`, 'upgrade bd')
    }
    return res(beadsBinaryCheck, 'ok', `bd ${match[0]} on PATH (floor ${BD_VERSION_FLOOR})`)
  },
}

export const beadsLiveCheck: DoctorCheck = {
  id: 'beads/live',
  section: 'beads',
  title: 'bd info answers from the project database',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.beads'))) {
      return res(beadsLiveCheck, 'skip', 'not configured (no .beads/)')
    }
    if (ctx.runCmd('command -v bd').status !== 0) {
      return res(beadsLiveCheck, 'skip', 'bd not on PATH (reported by beads/binary)')
    }
    const info = ctx.runCmd('bd info', 15)
    if (info.status !== 0) {
      return res(beadsLiveCheck, 'error',
        'bd info failed — .beads/ exists but the database does not answer',
        'bd doctor --fix (or scaffold doctor --fix to delegate)')
    }
    return res(beadsLiveCheck, 'ok', 'bd info answers')
  },
  fix: (ctx) => {
    // Capability-probe first — never assume the installed bd supports the subcommand.
    if (ctx.runCmd('bd doctor --help').status !== 0) {
      return { applied: false, detail: 'bd doctor unsupported by installed bd — upgrade bd' }
    }
    const fixRun = ctx.runCmd('bd doctor --fix', 120)
    return {
      applied: fixRun.status === 0,
      detail: fixRun.status === 0 ? 'bd doctor --fix completed' : 'bd doctor --fix failed',
    }
  },
}

export const beadsBackupCheck: DoctorCheck = {
  id: 'beads/backup',
  section: 'beads',
  title: 'bd backup configured',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.beads'))) {
      return res(beadsBackupCheck, 'skip', 'not configured (no .beads/)')
    }
    if (ctx.runCmd('command -v bd').status !== 0) {
      return res(beadsBackupCheck, 'skip', 'bd not on PATH (reported by beads/binary)')
    }
    if (ctx.runCmd('bd backup --help').status !== 0) {
      const version = /(\d+\.\d+\.\d+)/.exec(ctx.runCmd('bd --version').stdout)?.[1] ?? 'unknown'
      return res(beadsBackupCheck, 'warn', `bd backup unsupported by installed bd ${version}`,
        'upgrade bd to enable backup verification')
    }
    const status = ctx.runCmd('bd backup status --json', 15)
    if (status.status !== 0) {
      return res(beadsBackupCheck, 'warn', 'bd backup status --json failed — backup may not be configured',
        'bd backup enable (see docs/beads-workflow.md)')
    }
    return res(beadsBackupCheck, 'ok', 'bd backup status answers')
  },
}

export const beadsGuardCheck: DoctorCheck = {
  id: 'beads/guard',
  section: 'beads',
  title: 'bd-guard installed, registered, and armed',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.beads'))) {
      return res(beadsGuardCheck, 'skip', 'not configured (no .beads/)')
    }
    const guardPath = path.join(ctx.projectRoot, 'scripts', 'bd-guard.sh')
    if (!fs.existsSync(guardPath)) {
      return res(beadsGuardCheck, 'warn', 'scripts/bd-guard.sh not installed',
        'scaffold agent-ops install --component git')
    }
    try {
      fs.accessSync(guardPath, fs.constants.X_OK)
    } catch {
      return res(beadsGuardCheck, 'warn', 'scripts/bd-guard.sh is not executable', `chmod +x ${guardPath}`)
    }
    const settingsPath = path.join(ctx.projectRoot, '.claude', 'settings.json')
    const registered = fs.existsSync(settingsPath)
      && fs.readFileSync(settingsPath, 'utf8').includes('bd-guard.sh')
    if (!registered) {
      return res(beadsGuardCheck, 'warn',
        'bd-guard.sh installed but not registered in .claude/settings.json',
        'register the PreToolUse hook per content/pipeline/environment/git-workflow.md '
        + '(automated by `scaffold hooks install` in R2)')
    }
    if (ctx.runCmd('command -v jq').status !== 0) {
      // The guard parses its hook envelope with jq and fails OPEN without it.
      return res(beadsGuardCheck, 'warn', 'jq not found — bd-guard fails open (allows every command)',
        'brew install jq')
    }
    return res(beadsGuardCheck, 'ok', 'guard installed, registered, and armed (jq present)')
  },
}

// --- hooks ----------------------------------------------------------------

export const hooksRegisteredCheck: DoctorCheck = {
  id: 'hooks/registered',
  section: 'hooks',
  title: 'registered hook scripts exist and are executable',
  run: (ctx) => {
    const settingsPath = path.join(ctx.projectRoot, '.claude', 'settings.json')
    if (!fs.existsSync(settingsPath)) {
      return res(hooksRegisteredCheck, 'skip', 'not configured (no .claude/settings.json)')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    } catch (err) {
      return res(hooksRegisteredCheck, 'error',
        `.claude/settings.json is not valid JSON: ${(err as Error).message}`,
        'fix the JSON by hand — no hooks are loading at all')
    }
    // Valid JSON but not an object (e.g. literal `null`, an array, or a scalar):
    // no hooks can be registered, and indexing it below would throw.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return res(hooksRegisteredCheck, 'skip', 'not configured (no hooks in .claude/settings.json)')
    }
    const scriptRefs = new Set<string>()
    const visit = (value: unknown): void => {
      if (typeof value === 'string') {
        const match = /(?:^|[\s"'])((?:\.\/)?scripts\/[\w./-]+\.sh)/.exec(value)
        if (match !== null) scriptRefs.add(match[1].replace(/^\.\//, ''))
        return
      }
      if (Array.isArray(value)) {
        for (const v of value) visit(v)
        return
      }
      if (typeof value === 'object' && value !== null) {
        for (const v of Object.values(value)) visit(v)
      }
    }
    visit((parsed as Record<string, unknown>)['hooks'])
    if (scriptRefs.size === 0) {
      return res(hooksRegisteredCheck, 'skip', 'not configured (no script hooks registered)')
    }
    const missing: string[] = []
    const notExecutable: string[] = []
    for (const ref of [...scriptRefs].sort()) {
      const full = path.join(ctx.projectRoot, ref)
      if (!fs.existsSync(full)) {
        missing.push(ref)
        continue
      }
      try {
        fs.accessSync(full, fs.constants.X_OK)
      } catch {
        notExecutable.push(ref)
      }
    }
    if (missing.length > 0) {
      return res(hooksRegisteredCheck, 'error', `registered hook script(s) missing: ${missing.join(', ')}`,
        'scaffold agent-ops install (reinstall the component) or remove the stale registration')
    }
    if (notExecutable.length > 0) {
      return res(hooksRegisteredCheck, 'warn', `hook script(s) not executable: ${notExecutable.join(', ')}`,
        `chmod +x ${notExecutable.join(' ')}`)
    }
    return res(hooksRegisteredCheck, 'ok', `${scriptRefs.size} registered hook script(s) present and executable`)
  },
  fix: (ctx) => {
    const res = fixHookRegistration(ctx.projectRoot)
    return { applied: res.ok, detail: res.messages.join('; ') }
  },
}

// --- gate -----------------------------------------------------------------

export const gateTargetsCheck: DoctorCheck = {
  id: 'gate/targets',
  section: 'gate',
  title: 'check / check-affected make targets resolve',
  run: (ctx) => {
    if (!fs.existsSync(path.join(ctx.projectRoot, 'Makefile'))) {
      return res(gateTargetsCheck, 'skip', 'not configured (no Makefile)')
    }
    const missing = ['check', 'check-affected']
      .filter((target) => ctx.runCmd(`make -n ${target}`, 30).status !== 0)
    if (missing.length > 0) {
      return res(gateTargetsCheck, 'warn',
        `gate target(s) do not resolve: ${missing.join(', ')} — the mq daemon default gate commands assume them`,
        'add the targets to the Makefile (generated by `scaffold agent-ops install --component gate` in R2)')
    }
    // G2: `make -n` proves only that the targets RESOLVE. Report exactly that —
    // never "healthy". The bounded GATE_PROBE execution ships in R2 (D7).
    return res(gateTargetsCheck, 'ok',
      'check and check-affected resolve — NOT executed (bounded GATE_PROBE execution ships in R2)')
  },
}

// --- queue ----------------------------------------------------------------

export const queueDaemonCheck: DoctorCheck = {
  id: 'queue/daemon',
  section: 'queue',
  title: 'merge-queue daemon lock',
  run: (ctx) => {
    const mqDir = path.join(ctx.projectRoot, '.mq')
    if (!fs.existsSync(mqDir)) {
      return res(queueDaemonCheck, 'skip', 'not configured (no .mq/)')
    }
    let alive = false
    try {
      // `stale` MUST track LOCK_STALE_MS in src/cli/commands/mq.ts (180_000). The
      // daemon holds the lock through blocking git/gh calls (execFileSync, 120s
      // cap); a shorter staleness here would judge a busy-but-alive daemon dead
      // and falsely report it idle. Keep this value in lockstep with mq.ts.
      alive = checkSync(mqDir, { lockfilePath: path.join(mqDir, 'daemon.lock'), stale: 180_000 })
    } catch {
      alive = false
    }
    return res(queueDaemonCheck, 'ok',
      alive ? 'daemon running (lock held)' : 'daemon idle (no live lock — auto-starts on next enqueue)')
  },
}

export const queuePausedCheck: DoctorCheck = {
  id: 'queue/paused',
  section: 'queue',
  title: 'queue not paused',
  run: (ctx) => {
    const mqDir = path.join(ctx.projectRoot, '.mq')
    if (!fs.existsSync(mqDir)) {
      return res(queuePausedCheck, 'skip', 'not configured (no .mq/)')
    }
    const pausedPath = path.join(mqDir, 'PAUSED')
    if (fs.existsSync(pausedPath)) {
      const reason = fs.readFileSync(pausedPath, 'utf8').split('\n')[0].trim()
      return res(queuePausedCheck, 'warn', `queue is paused: ${reason || '(no reason recorded)'}`,
        'investigate the pause reason, then rm .mq/PAUSED')
    }
    return res(queuePausedCheck, 'ok', 'not paused')
  },
}

// --- scheduler ------------------------------------------------------------

export const schedulerCheck: DoctorCheck = {
  id: 'scheduler/loaded',
  section: 'scheduler',
  title: 'post-merge poller schedule loaded',
  run: (ctx) => {
    if (process.platform === 'darwin') {
      const agentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents')
      // R2's buildPostMergePollerJob labels the job `com.<project>.merge-poller`
      // (→ file `com.<project>.merge-poller.plist`), NOT the script basename
      // `post-merge-poller`. Match the label R2 actually installs (forward
      // reference to R2's job builder, per the R2-interfaces-are-the-contract
      // rule the other doctor checks follow).
      const plists = fs.existsSync(agentsDir)
        ? fs.readdirSync(agentsDir).filter((f) => /^com\..+\.merge-poller\.plist$/.test(f))
        : []
      if (plists.length === 0) {
        return res(schedulerCheck, 'skip',
          'not configured (no com.<project>.merge-poller LaunchAgent; `scaffold sched` ships in R2)')
      }
      const label = plists[0].replace(/\.plist$/, '')
      // File presence proves nothing — verify the job is actually LOADED.
      // Argv, not a shell string: `label` comes from a directory listing
      // matched by a regex whose `.+` admits shell metacharacters, so it
      // must never be interpolated into a shell command.
      const uid = process.getuid?.() ?? 0
      const printed = ctx.runArgv('launchctl', ['print', `gui/${uid}/${label}`], 15)
      if (printed.status !== 0) {
        return res(schedulerCheck, 'error',
          `${plists[0]} exists but the job is not loaded (file presence proves nothing)`,
          `launchctl bootstrap gui/$(id -u) ${path.join(agentsDir, plists[0])}`)
      }
      return res(schedulerCheck, 'ok', `launchd job ${label} loaded`)
    }
    if (process.platform === 'linux') {
      // R2's systemd backend installs `scaffold-<project>-merge-poller.timer`
      // (job.unitBase), NOT `post-merge-poller.timer`. Discover the installed
      // unit by pattern, then verify it is active (mirrors R2's own
      // `systemctl --user is-active <unitBase>.timer` status check).
      const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user')
      const timers = fs.existsSync(unitDir)
        ? fs.readdirSync(unitDir).filter((f) => /^scaffold-.+-merge-poller\.timer$/.test(f))
        : []
      if (timers.length === 0) {
        return res(schedulerCheck, 'skip',
          'not configured (no scaffold-*-merge-poller.timer; `scaffold sched` ships in R2)')
      }
      const timer = timers[0]
      // Argv, not a shell string — same reasoning as the launchctl call above:
      // `timer` is a filename matched by a permissive regex.
      const active = ctx.runArgv('systemctl', ['--user', 'is-active', timer], 15)
      if (active.status === 0) return res(schedulerCheck, 'ok', `systemd user timer ${timer} active`)
      return res(schedulerCheck, 'warn', `${timer} present but not active`,
        `systemctl --user start ${timer}`)
    }
    return res(schedulerCheck, 'skip', `not configured (unsupported platform ${process.platform})`)
  },
  fix: (ctx) => {
    const res = fixSchedulerReload(ctx.projectRoot)
    return { applied: res.ok, detail: res.messages.join('; ') }
  },
}

export const DOCTOR_CHECKS: DoctorCheck[] = [
  pipelineVerificationCheck,
  beadsBinaryCheck,
  beadsLiveCheck,
  beadsBackupCheck,
  beadsGuardCheck,
  hooksRegisteredCheck,
  gateTargetsCheck,
  queueDaemonCheck,
  queuePausedCheck,
  schedulerCheck,
]
