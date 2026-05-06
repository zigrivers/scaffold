import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { Severity } from '../types.js'

const VALID: Severity[] = ['P0', 'P1', 'P2', 'P3']
function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (VALID as string[]).includes(v)
}

export function resolveFixThreshold(cwd: string, cliOverride?: string): Severity {
  if (cliOverride && isSeverity(cliOverride)) return cliOverride
  const mmrPath = join(cwd, '.mmr.yaml')
  if (existsSync(mmrPath)) {
    try {
      type MmrCfg = { audit_fix_threshold?: unknown; fix_threshold?: unknown }
      const cfg = yaml.load(readFileSync(mmrPath, 'utf8')) as MmrCfg | null
      if (cfg && isSeverity(cfg.audit_fix_threshold)) return cfg.audit_fix_threshold
      if (cfg && isSeverity(cfg.fix_threshold)) return cfg.fix_threshold
    } catch { /* fall through to default */ }
  }
  return 'P2'
}
