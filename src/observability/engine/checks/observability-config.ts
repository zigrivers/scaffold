import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

export interface ELensConfig {
  ad_hoc_token_threshold?: number
  ui_glob?: string
}
export interface CLensConfig {
  enforce_via_linter?: boolean
  rule_overrides?: Record<string, 'P0' | 'P1' | 'P2' | 'P3'>
}
export interface FLensConfig {
  untouched_story_grace_hours?: number
}
export interface GLensConfig {
  keywords_file?: string
}

export interface StallConfig {
  task_stale?: string | 'off'
  pr_stale?: string | 'off'
  pr_review_stale?: string | 'off'
  blocker_unaddressed?: string | 'off'
  audit_findings_unresolved?: string | 'off'
}

export interface ObservabilityConfig {
  lenses: {
    'A-tdd'?: Record<string, never>
    'B-ac-coverage'?: Record<string, never>
    'C-standards'?: CLensConfig
    'D-stack'?: Record<string, never>
    'E-design'?: ELensConfig
    'F-scope'?: FLensConfig
    'G-decisions'?: GLensConfig
    'H-cross-doc'?: { skip_phase_subsets?: string[] }
  }
  disabled_lenses: string[]
  stall: StallConfig
  phase_audit: { enabled: boolean; timeout_s: number; detached: boolean }
}

export const DEFAULT_CONFIG: ObservabilityConfig = {
  lenses: {
    'C-standards': { enforce_via_linter: true, rule_overrides: {} },
    'E-design':    { ad_hoc_token_threshold: 3, ui_glob: 'src/components/**/*.{tsx,jsx,vue,svelte},src/styles/**/*.{css,scss}' },
    'F-scope':     { untouched_story_grace_hours: 168 },
    'G-decisions': {},
    'H-cross-doc': {},
  },
  disabled_lenses: [],
  stall: {
    task_stale: '4h', pr_stale: '48h', pr_review_stale: '24h',
    blocker_unaddressed: '2h', audit_findings_unresolved: '24h',
  },
  phase_audit: { enabled: true, timeout_s: 60, detached: false },
}

const CONFIG_PATH = '.scaffold/observability.yaml'

function deepMerge<T extends Record<string, unknown>>(base: T, over: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    const baseV = base[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && baseV && typeof baseV === 'object' && !Array.isArray(baseV)) {
      out[k] = deepMerge(baseV as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out as T
}

export function loadObservabilityConfig(cwd: string): ObservabilityConfig {
  const path = join(cwd, CONFIG_PATH)
  if (!existsSync(path)) return DEFAULT_CONFIG
  try {
    const raw = yaml.load(readFileSync(path, 'utf8')) as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG
    return deepMerge(DEFAULT_CONFIG, raw)
  } catch {
    return DEFAULT_CONFIG
  }
}

export function ensureConfigDir(cwd: string): string {
  const dir = join(cwd, '.scaffold')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'observability.yaml')
}
