import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getPackageRoot } from '../../utils/fs.js'
import { getPackageVersion, resolveSkillTemplate } from '../skills/sync.js'
import { loadAgentOpsConfig, type AgentOpsConfig } from './config.js'

export type AgentOpsComponent = 'git' | 'staging'

export interface AgentOpsFileSpec {
  dest: string
  component: AgentOpsComponent
  executable: boolean
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
}

const MANIFEST_PATH = '.scaffold/agent-ops-manifest.json'
const VERSION_MARKER_PATH = '.scaffold/agent-ops-version'
const MAKEFILE_INCLUDE = '-include agent-ops.mk'

export interface AgentOpsInstallOptions {
  components: AgentOpsComponent[]
  force?: boolean
  /** Test override for content/assets/agent-ops */
  templateRoot?: string
}

export interface AgentOpsInstallResult {
  installed: string[]
  skippedModified: string[]
  errors: string[]
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
}

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function readManifest(projectRoot: string): Manifest {
  const p = path.join(projectRoot, MANIFEST_PATH)
  if (!fs.existsSync(p)) return { version: '', files: {} }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Manifest
}

// Shell variable names cannot contain a dash, so a service like `redis-cache`
// becomes `BAND_redis_cache`. staging-env.sh.tmpl applies the SAME `-`→`_`
// transform when it reads these back by indirection. SERVICES keeps the raw
// names (the template re-derives the safe suffix per service).
function shellVarSuffix(name: string): string {
  return name.replace(/-/g, '_')
}

export function buildTemplateVars(config: AgentOpsConfig): Record<string, string> {
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

export function installAgentOps(projectRoot: string, opts: AgentOpsInstallOptions): AgentOpsInstallResult {
  const templateRoot = opts.templateRoot ?? path.join(getPackageRoot(), 'content', 'assets', 'agent-ops')
  const config = loadAgentOpsConfig(projectRoot)
  const vars = buildTemplateVars(config)
  const manifest = readManifest(projectRoot)
  const result: AgentOpsInstallResult = { installed: [], skippedModified: [], errors: [] }

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
    if (fs.existsSync(destPath) && !opts.force) {
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
      manifest.files[spec.dest] = sha256(resolved)
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
  return result
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
  // A component counts as previously installed if the version marker exists
  // (some install ran) or the manifest already holds one of its dests. For such
  // components, any known dest missing from the manifest is "unmanaged" — a
  // pre-existing file the installer refused to clobber. Reported, never gating.
  const installedComponents = new Set<AgentOpsComponent>()
  for (const spec of Object.values(AGENT_OPS_FILE_MAP)) {
    if (manifest.files[spec.dest]) installedComponents.add(spec.component)
  }
  const unmanaged: string[] = []
  for (const spec of Object.values(AGENT_OPS_FILE_MAP)) {
    const componentInstalled = markerPresent || installedComponents.has(spec.component)
    if (componentInstalled && !manifest.files[spec.dest]) unmanaged.push(spec.dest)
  }
  return {
    upToDate: !staleVersion && modified.length === 0 && missing.length === 0,
    staleVersion,
    modified,
    missing,
    unmanaged,
  }
}
