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
}

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

export function buildTemplateVars(config: AgentOpsConfig): Record<string, string> {
  const defaultContext = process.platform === 'darwin' ? 'orbstack' : 'default'
  const bandLines: string[] = []
  if (config.docker) {
    bandLines.push(`SERVICES="${config.docker.services.map(s => s.name).join(' ')}"`)
    for (const s of config.docker.services) bandLines.push(`BAND_${s.name}=${s.band}`)
    for (const [name, port] of Object.entries(config.docker.shared_stack)) {
      bandLines.push(`SHARED_${name}=${port}`)
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
    if (!opts.components.includes(spec.component)) continue
    const srcPath = path.join(templateRoot, tmpl)
    if (!fs.existsSync(srcPath)) continue // template not bundled (pre-Task-4 state)

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

  manifest.version = getPackageVersion()
  fs.mkdirSync(path.join(projectRoot, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`)
  fs.writeFileSync(path.join(projectRoot, VERSION_MARKER_PATH), manifest.version)
  if (opts.components.includes('git')) ensureMakefileInclude(projectRoot)
  return result
}

export function checkAgentOps(projectRoot: string): AgentOpsCheckResult {
  const manifest = readManifest(projectRoot)
  const markerPath = path.join(projectRoot, VERSION_MARKER_PATH)
  const marker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8').trim() : ''
  const staleVersion = marker !== getPackageVersion()
  const modified: string[] = []
  const missing: string[] = []
  for (const [dest, hash] of Object.entries(manifest.files)) {
    const p = path.join(projectRoot, dest)
    if (!fs.existsSync(p)) missing.push(dest)
    else if (sha256(fs.readFileSync(p)) !== hash) modified.push(dest)
  }
  return { upToDate: !staleVersion && modified.length === 0 && missing.length === 0, staleVersion, modified, missing }
}
