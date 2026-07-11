import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

export const AGENT_OPS_CONFIG_PATH = '.scaffold/agent-ops.yaml'

export interface AgentOpsService {
  name: string
  band: number
}

export interface AgentOpsDocker {
  /** Docker context name; when omitted, the installer picks a platform default. */
  context?: string
  services: AgentOpsService[]
  shared_stack: Record<string, number>
}

export interface AgentOpsConfig {
  project_name: string
  critical_labels: string[]
  worktree_setup_commands: string[]
  docker?: AgentOpsDocker
}

const NAME_RE = /^[a-z][a-z0-9_-]*$/

function sanitizeName(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'project'
}

export function defaultAgentOpsConfig(projectRoot: string): AgentOpsConfig {
  return {
    project_name: sanitizeName(path.basename(projectRoot)),
    critical_labels: [],
    worktree_setup_commands: [],
  }
}

function fail(msg: string): never {
  throw new Error(`agent-ops config: ${msg}`)
}

export function loadAgentOpsConfig(projectRoot: string): AgentOpsConfig {
  const file = path.join(projectRoot, AGENT_OPS_CONFIG_PATH)
  if (!fs.existsSync(file)) return defaultAgentOpsConfig(projectRoot)

  const raw = yaml.load(fs.readFileSync(file, 'utf8')) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') fail('file is empty or not a mapping')

  const cfg = defaultAgentOpsConfig(projectRoot)
  if (typeof raw.project_name === 'string' && raw.project_name) {
    if (!NAME_RE.test(raw.project_name)) fail(`invalid project_name "${raw.project_name}"`)
    cfg.project_name = raw.project_name
  }
  if (Array.isArray(raw.critical_labels)) cfg.critical_labels = raw.critical_labels.map(String)
  if (Array.isArray(raw.worktree_setup_commands)) {
    cfg.worktree_setup_commands = raw.worktree_setup_commands.map(String)
  }

  if (raw.docker !== undefined) {
    if (raw.docker === null) fail('docker section is empty — remove the key or add services')
    const d = raw.docker as Record<string, unknown>
    const services = (Array.isArray(d.services) ? d.services : []).map(s => {
      const svc = s as Record<string, unknown>
      if (typeof svc.name !== 'string' || !NAME_RE.test(svc.name)) {
        fail(`invalid service name "${String(svc.name)}"`)
      }
      if (typeof svc.band !== 'number' || !Number.isInteger(svc.band) || svc.band < 1024) {
        fail(`service "${svc.name}" needs an integer band >= 1024`)
      }
      return { name: svc.name, band: svc.band }
    })
    const bands = new Set<number>()
    for (const s of services) {
      if (bands.has(s.band)) fail(`duplicate band ${s.band}`)
      bands.add(s.band)
    }
    const sharedStack = d.shared_stack && typeof d.shared_stack === 'object' ? d.shared_stack : {}
    for (const [key, value] of Object.entries(sharedStack)) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
        fail(`shared_stack.${key} must be an integer port in 1..65535, got ${JSON.stringify(value)}`)
      }
    }
    const shared = sharedStack as Record<string, number>
    cfg.docker = { services, shared_stack: shared }
    if (typeof d.context === 'string' && d.context) cfg.docker.context = d.context
  }
  return cfg
}
