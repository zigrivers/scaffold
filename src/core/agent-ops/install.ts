import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { getPackageRoot } from '../../utils/fs.js'
import { getPackageVersion, resolveSkillTemplate } from '../skills/sync.js'
import {
  loadAgentOpsConfig, mergeQueueConfigWarnings, type AgentOpsConfig, type AgentOpsConfigWarning,
} from './config.js'
import { gateTemplateVars, type GateSeed } from './gate-ingest.js'

export type AgentOpsComponent = 'git' | 'staging' | 'merge-queue' | 'ci' | 'gate'

export interface AgentOpsFileSpec {
  dest: string
  component: AgentOpsComponent
  executable: boolean
  /** seed:true = generated ONCE, project-owned afterward: `agent-ops check`
   *  reports it only when missing (never drifted); re-install never overwrites
   *  without --force (spec D7). */
  seed?: boolean
}

export const AGENT_OPS_FILE_MAP: Record<string, AgentOpsFileSpec> = {
  'git/setup-agent-worktree.sh.tmpl': {
    dest: 'scripts/setup-agent-worktree.sh',
    component: 'git',
    executable: true,
  },
  'git/cleanup-merged-branches.sh.tmpl': {
    dest: 'scripts/cleanup-merged-branches.sh',
    component: 'git',
    executable: true,
  },
  'git/main-sync.sh.tmpl': { dest: 'scripts/main-sync.sh', component: 'git', executable: true },
  'git/doctor.sh.tmpl': { dest: 'scripts/doctor.sh', component: 'git', executable: true },
  'git/beads-snapshot.sh.tmpl': { dest: 'scripts/beads-snapshot.sh', component: 'git', executable: true },
  'git/bd-guard.sh.tmpl': {
    dest: 'scripts/bd-guard.sh',
    component: 'git',
    executable: true,
  },
  'git/primary-checkout-guard.sh.tmpl': {
    dest: 'scripts/primary-checkout-guard.sh',
    component: 'git',
    executable: true,
  },
  'git/check-regen-artifacts.sh.tmpl': {
    dest: 'scripts/check-regen-artifacts.sh',
    component: 'git',
    executable: true,
  },
  'git/reap-stale-claims.sh.tmpl': {
    dest: 'scripts/reap-stale-claims.sh',
    component: 'git',
    executable: true,
  },
  'git/reap-lapsed-defers.sh.tmpl': {
    dest: 'scripts/reap-lapsed-defers.sh',
    component: 'git',
    executable: true,
  },
  'git/bd-claim-smoke-test.sh.tmpl': {
    dest: 'scripts/bd-claim-smoke-test.sh',
    component: 'git',
    executable: true,
  },
  'git/agent-name.sh.tmpl': {
    dest: 'scripts/agent-name.sh',
    component: 'git',
    executable: true,
  },
  'make/agent-ops.mk.tmpl': { dest: 'agent-ops.mk', component: 'git', executable: false },
  'staging/staging-env.sh.tmpl': {
    dest: 'scripts/ops/staging-env.sh',
    component: 'staging',
    executable: true,
  },
  'staging/staging-teardown.sh.tmpl': {
    dest: 'scripts/ops/staging-teardown.sh',
    component: 'staging',
    executable: true,
  },
  'staging/docker-env.sh.tmpl': {
    dest: 'scripts/ops/docker-env.sh',
    component: 'staging',
    executable: true,
  },
  'staging/docker-doctor.sh.tmpl': {
    dest: 'scripts/ops/docker-doctor.sh',
    component: 'staging',
    executable: true,
  },
  'staging/tc-reap.sh.tmpl': { dest: 'scripts/ops/tc-reap.sh', component: 'staging', executable: true },
  'staging/staging.env.example.tmpl': {
    dest: 'ops/compose/staging.env.example',
    component: 'staging',
    executable: false,
  },
  'merge-queue/mq-guard.sh.tmpl': {
    dest: 'scripts/mq-guard.sh',
    component: 'merge-queue',
    executable: true,
  },
  'merge-queue/post-merge-poller.sh.tmpl': {
    dest: 'scripts/ops/post-merge-poller.sh',
    component: 'merge-queue',
    executable: true,
  },
  'gate/gate-check.sh.tmpl': {
    dest: 'scripts/gate-check.sh',
    component: 'gate',
    executable: true,
    seed: true,
  },
  'gate/gate-check-affected.sh.tmpl': {
    dest: 'scripts/gate-check-affected.sh',
    component: 'gate',
    executable: true,
    seed: true,
  },
  'ci/setup-gh-runner.sh.tmpl': {
    dest: 'scripts/ops/setup-gh-runner.sh',
    component: 'ci',
    executable: true,
  },
  'ci/post-merge.yml.tmpl': {
    dest: '.github/workflows/post-merge.yml',
    component: 'ci',
    executable: false,
  },
  'ci/nightly.yml.tmpl': {
    dest: '.github/workflows/nightly.yml',
    component: 'ci',
    executable: false,
  },
}

const MANIFEST_PATH = '.scaffold/agent-ops-manifest.json'
const VERSION_MARKER_PATH = '.scaffold/agent-ops-version'
const MAKEFILE_INCLUDE = '-include agent-ops.mk'

export interface AgentOpsInstallOptions {
  components: AgentOpsComponent[]
  force?: boolean
  /** Required when components includes 'gate' (Task 9 ingestion output). */
  gateSeed?: GateSeed
  /** Test override for content/assets/agent-ops */
  templateRoot?: string
}

export interface AgentOpsInstallResult {
  installed: string[]
  skippedModified: string[]
  /** Seed files that already existed — kept untouched (project-owned). */
  seedKept: string[]
  errors: string[]
  /** Non-fatal config issues (e.g. full_gate_command misconfigured). */
  warnings: AgentOpsConfigWarning[]
}

export interface AgentOpsCheckResult {
  upToDate: boolean
  staleVersion: boolean
  modified: string[]
  missing: string[]
  /**
   * Dests scaffold knows about (in AGENT_OPS_FILE_MAP) for a previously-installed
   * component that are NOT in the manifest — i.e. pre-existing user files the
   * installer refused to clobber. Informational only; never affects upToDate.
   */
  unmanaged: string[]
}

// The make fragment defines BOTH git and staging targets and each target
// self-guards, so it is component-agnostic — install it whenever any component
// is requested, not only for 'git'.
const MAKE_FRAGMENT_TMPL = 'make/agent-ops.mk.tmpl'

interface Manifest {
  version: string
  files: Record<string, string>
  /** Dests generated with seed:true — presence-checked only, never hashed. */
  seeds: string[]
}

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function readManifest(projectRoot: string): Manifest {
  const p = path.join(projectRoot, MANIFEST_PATH)
  if (!fs.existsSync(p)) return { version: '', files: {}, seeds: [] }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<Manifest>
  return { version: raw.version ?? '', files: raw.files ?? {}, seeds: raw.seeds ?? [] }
}

// Shell variable names cannot contain a dash, so a service like `redis-cache`
// becomes `BAND_redis_cache`. staging-env.sh.tmpl applies the SAME `-`→`_`
// transform when it reads these back by indirection. SERVICES keeps the raw
// names (the template re-derives the safe suffix per service).
function shellVarSuffix(name: string): string {
  return name.replace(/-/g, '_')
}

// origin/HEAD points at the remote's default branch (e.g. "origin/main"); strip
// the "origin/" prefix so DEFAULT_BRANCH is the bare branch name. When the local
// origin/HEAD symref is unset (a clone that never ran `git remote set-head`), ask
// the REMOTE for its default via `git ls-remote --symref` before falling back to
// "main" — so a repo whose default is "master"/"develop" gets the right value.
function gitBranchFrom(args: string[], projectRoot: string): string {
  return execFileSync('git', args, {
    cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function resolveDefaultBranch(projectRoot: string | undefined): string {
  if (!projectRoot) return 'main'
  try {
    const local = gitBranchFrom(['rev-parse', '--abbrev-ref', 'origin/HEAD'], projectRoot)
      .replace(/^origin\//, '')
    if (local) return local
  } catch { /* origin/HEAD unset — try the remote */ }
  try {
    // `ref: refs/heads/<branch>\tHEAD` → take the branch name.
    const symref = gitBranchFrom(['ls-remote', '--symref', 'origin', 'HEAD'], projectRoot)
    const match = symref.match(/refs\/heads\/(\S+)\s+HEAD/)
    if (match) return match[1]
  } catch { /* no remote / offline — fall back */ }
  return 'main'
}

export function buildTemplateVars(
  config: AgentOpsConfig,
  projectRoot?: string,
): Record<string, string> {
  const defaultContext = process.platform === 'darwin' ? 'orbstack' : 'default'
  const bandLines: string[] = []
  if (config.docker) {
    bandLines.push(`SERVICES="${config.docker.services.map(s => s.name).join(' ')}"`)
    for (const s of config.docker.services) bandLines.push(`BAND_${shellVarSuffix(s.name)}=${s.band}`)
    for (const [name, port] of Object.entries(config.docker.shared_stack)) {
      bandLines.push(`SHARED_${shellVarSuffix(name)}=${port}`)
    }
  }
  return {
    PROJECT_NAME: config.project_name,
    DOCKER_CONTEXT: config.docker?.context ?? defaultContext,
    WORKTREE_SETUP_COMMANDS: config.worktree_setup_commands.join('\n'),
    SERVICE_PORT_BANDS: bandLines.join('\n'),
    DEFAULT_BRANCH: resolveDefaultBranch(projectRoot),
    FULL_GATE_COMMAND: config.merge_queue.full_gate_command,
  }
}

function ensureMakefileInclude(projectRoot: string): void {
  const mkPath = path.join(projectRoot, 'Makefile')
  if (!fs.existsSync(mkPath)) {
    fs.writeFileSync(mkPath, `${MAKEFILE_INCLUDE}\n`)
    return
  }
  const body = fs.readFileSync(mkPath, 'utf8')
  if (!body.includes(MAKEFILE_INCLUDE)) {
    fs.writeFileSync(mkPath, `${body.replace(/\n*$/, '\n')}\n${MAKEFILE_INCLUDE}\n`)
  }
}

const GITIGNORE_MQ_ENTRY = '.mq/'

function ensureGitignoreEntry(projectRoot: string, entry: string): void {
  const p = path.join(projectRoot, '.gitignore')
  const body = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  // CRLF-safe: split on \r?\n and trim so a Windows-checkout .gitignore does not
  // fail the presence check and append a duplicate .mq/ on every install.
  if (body.split(/\r?\n/).map(l => l.trim()).includes(entry)) return
  const sep = body === '' || body.endsWith('\n') ? '' : '\n'
  fs.writeFileSync(p, `${body}${sep}${entry}\n`)
}

export function installAgentOps(projectRoot: string, opts: AgentOpsInstallOptions): AgentOpsInstallResult {
  const templateRoot = opts.templateRoot ?? path.join(getPackageRoot(), 'content', 'assets', 'agent-ops')
  const config = loadAgentOpsConfig(projectRoot)
  const manifest = readManifest(projectRoot)
  if (opts.components.includes('gate') && opts.gateSeed === undefined) {
    throw new Error('gate component requires a gateSeed — run ingestGateSeed(projectRoot) first')
  }
  const vars = {
    ...buildTemplateVars(config, projectRoot),
    ...(opts.gateSeed !== undefined ? gateTemplateVars(opts.gateSeed) : {}),
  }
  const result: AgentOpsInstallResult = {
    installed: [], skippedModified: [], seedKept: [], errors: [],
    warnings: opts.components.includes('merge-queue')
      ? mergeQueueConfigWarnings(config.merge_queue)
      : [],
  }

  for (const [tmpl, spec] of Object.entries(AGENT_OPS_FILE_MAP)) {
    const requested =
      tmpl === MAKE_FRAGMENT_TMPL ? opts.components.length > 0 : opts.components.includes(spec.component)
    if (!requested) continue
    const srcPath = path.join(templateRoot, tmpl)
    if (!fs.existsSync(srcPath)) {
      // A requested component whose template source isn't bundled is a real
      // install failure — surface it instead of silently shipping a partial kit.
      result.errors.push(`${spec.dest}: template source missing at ${tmpl}`)
      continue
    }

    const destPath = path.join(projectRoot, spec.dest)
    if (spec.seed === true && fs.existsSync(destPath) && !opts.force) {
      // Project-owned seed: NEVER overwrite without --force, regardless of hash.
      result.seedKept.push(spec.dest)
      if (!manifest.seeds.includes(spec.dest)) manifest.seeds.push(spec.dest)
      continue
    }
    if (spec.seed !== true && fs.existsSync(destPath) && !opts.force) {
      // Overwrite only files we own (manifest entry exists) and that are
      // unmodified (manifest hash matches disk). A file with no manifest
      // entry is a pre-existing user file — never clobber it without force.
      const onDisk = sha256(fs.readFileSync(destPath))
      const recorded = manifest.files[spec.dest]
      if (!recorded || recorded !== onDisk) {
        result.skippedModified.push(spec.dest)
        continue
      }
    }

    try {
      const resolved = resolveSkillTemplate(fs.readFileSync(srcPath, 'utf8'), vars)
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.writeFileSync(destPath, resolved)
      if (spec.executable) fs.chmodSync(destPath, 0o755)
      if (spec.seed === true) {
        if (!manifest.seeds.includes(spec.dest)) manifest.seeds.push(spec.dest)
      } else {
        manifest.files[spec.dest] = sha256(resolved)
      }
      result.installed.push(spec.dest)
    } catch (err) {
      result.errors.push(`${spec.dest}: ${err}`)
    }
  }

  // Always persist the hashes of files that DID install (so a re-run can detect
  // and re-resolve them). But only advance the recorded version + the version
  // marker on a fully clean install: if any file failed (missing template, write
  // error), leaving the version stale is what makes checkAgentOps report the kit
  // as not-up-to-date instead of masking the partial failure behind a current marker.
  fs.mkdirSync(path.join(projectRoot, '.scaffold'), { recursive: true })
  const clean = result.errors.length === 0
  if (clean) manifest.version = getPackageVersion()
  fs.writeFileSync(path.join(projectRoot, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`)
  if (clean) fs.writeFileSync(path.join(projectRoot, VERSION_MARKER_PATH), manifest.version)
  // The make fragment (and thus the include) is component-agnostic — ensure the
  // Makefile wires it in for any requested component, not just 'git'. Staging
  // targets self-guard; git targets fail loudly if their scripts are absent.
  if (opts.components.length > 0) ensureMakefileInclude(projectRoot)
  if (opts.components.includes('merge-queue')) ensureGitignoreEntry(projectRoot, GITIGNORE_MQ_ENTRY)
  if (opts.components.includes('gate') && opts.gateSeed !== undefined) {
    ensureGateMakeTargets(projectRoot, opts.gateSeed)
  }
  return result
}

/** Every project-root-relative path installAgentOps creates or edits for these
 *  components: the requested component seed/dest files, the shared make fragment
 *  (installed for ANY component), the ownership manifest, the version marker, the
 *  Makefile include, and — for merge-queue — the .gitignore entry. Sorted,
 *  de-duplicated, read-only. The ops-actions preview derives install-component
 *  file lists from THIS (never from AGENT_OPS_FILE_MAP directly), so the preview
 *  and its plan_key can never omit an apply-relevant write. Keep this in lockstep
 *  with installAgentOps — the two must agree on what a component install writes. */
export function plannedInstallPaths(components: AgentOpsComponent[]): string[] {
  const set = new Set<string>()
  for (const [tmpl, spec] of Object.entries(AGENT_OPS_FILE_MAP)) {
    const requested = tmpl === MAKE_FRAGMENT_TMPL
      ? components.length > 0
      : components.includes(spec.component)
    if (requested) set.add(spec.dest)
  }
  set.add(MANIFEST_PATH)
  set.add(VERSION_MARKER_PATH)
  if (components.length > 0) set.add('Makefile')
  if (components.includes('merge-queue')) set.add('.gitignore')
  return [...set].sort()
}

export function checkAgentOps(projectRoot: string): AgentOpsCheckResult {
  const manifest = readManifest(projectRoot)
  const markerPath = path.join(projectRoot, VERSION_MARKER_PATH)
  const markerPresent = fs.existsSync(markerPath)
  const marker = markerPresent ? fs.readFileSync(markerPath, 'utf8').trim() : ''
  const staleVersion = marker !== getPackageVersion()
  const modified: string[] = []
  const missing: string[] = []
  for (const [dest, hash] of Object.entries(manifest.files)) {
    const p = path.join(projectRoot, dest)
    if (!fs.existsSync(p)) missing.push(dest)
    else if (sha256(fs.readFileSync(p)) !== hash) modified.push(dest)
  }
  // Seeds are project-owned after generation: report a seed only when it has
  // gone missing entirely — never as "modified", since editing it is expected.
  for (const dest of manifest.seeds) {
    if (!fs.existsSync(path.join(projectRoot, dest))) missing.push(dest)
  }
  // A component counts as previously installed if the version marker exists
  // (some install ran) or the manifest already holds one of its dests. For such
  // components, any known dest missing from the manifest is "unmanaged" — a
  // pre-existing file the installer refused to clobber. Reported, never gating.
  const installedComponents = new Set<AgentOpsComponent>()
  for (const spec of Object.values(AGENT_OPS_FILE_MAP)) {
    if (manifest.files[spec.dest] || manifest.seeds.includes(spec.dest)) {
      installedComponents.add(spec.component)
    }
  }
  const unmanaged: string[] = []
  for (const spec of Object.values(AGENT_OPS_FILE_MAP)) {
    const componentInstalled = markerPresent || installedComponents.has(spec.component)
    if (componentInstalled && !manifest.files[spec.dest] && !manifest.seeds.includes(spec.dest)) {
      unmanaged.push(spec.dest)
    }
  }
  return {
    upToDate: !staleVersion && modified.length === 0 && missing.length === 0,
    staleVersion,
    modified,
    missing,
    unmanaged,
  }
}

/** Thin, project-owned Makefile targets wiring the seeds into the mq contract
 *  (`make check` / `make check-affected`). Appended ONLY when absent — an
 *  existing target of the same name is always respected (D7). */
export function ensureGateMakeTargets(projectRoot: string, seed: GateSeed): string[] {
  const mkPath = path.join(projectRoot, 'Makefile')
  const body = fs.existsSync(mkPath) ? fs.readFileSync(mkPath, 'utf8') : ''
  const hasTarget = (name: string): boolean => new RegExp(`^${name}:`, 'm').test(body)
  const additions: string[] = []
  let out = body
  const sep = (): string => (out === '' || out.endsWith('\n') ? '' : '\n')
  if (!hasTarget('check')) {
    out +=
      `${sep()}\ncheck: ## Full quality gate (seeded — scripts/gate-check.sh is project-owned)\n` +
      '\t./scripts/gate-check.sh\n'
    additions.push('check')
  }
  if (!hasTarget('check-affected')) {
    out +=
      `${sep()}\ncheck-affected: ## Affected-only merge gate (seeded — scripts/gate-check-affected.sh)\n` +
      '\t./scripts/gate-check-affected.sh\n'
    additions.push('check-affected')
  }
  if (seed.visualCommands.length > 0 && !hasTarget('check-visual')) {
    out +=
      `${sep()}\ncheck-visual: ## Environment-sensitive suites — EXCLUDED from the merge-queue gate\n` +
      `\t${seed.visualCommands.join('\n\t')}\n`
    additions.push('check-visual')
  }
  // Declare the seeded targets .PHONY so a stray file/dir named `check` (common
  // in some project layouts) can't make `make check` no-op and silently report
  // success — a phantom-satisfied target would bypass the quality gate entirely.
  if (additions.length > 0) {
    out += `${sep()}\n.PHONY: ${additions.join(' ')}\n`
  }
  if (out !== body) fs.writeFileSync(mkPath, out)
  return additions
}
