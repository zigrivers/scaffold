import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yaml from 'js-yaml'
import { MmrConfigSchema, type MmrConfigParsed } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'

export interface LoadConfigOptions {
  projectRoot: string
  userHome?: string
  cliOverrides?: {
    fix_threshold?: string
    timeout?: number
    format?: string
  }
}

/**
 * Deep-merge two plain objects. Arrays replace (not concat).
 * Primitives from `overlay` win over `base`.
 */
function deepMerge<T extends Record<string, unknown>>(base: T, overlay: Record<string, unknown>): T {
  const result = { ...base } as Record<string, unknown>
  for (const key of Object.keys(overlay)) {
    const baseVal = result[key]
    const overVal = overlay[key]

    if (
      overVal !== null &&
      typeof overVal === 'object' &&
      !Array.isArray(overVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      )
    } else {
      result[key] = overVal
    }
  }
  return result as T
}

/**
 * Try to read and parse a YAML file; returns undefined if missing.
 */
function loadYaml(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) return undefined
  const raw = fs.readFileSync(filePath, 'utf-8')
  const parsed = yaml.load(raw)
  if (parsed === null || parsed === undefined || typeof parsed !== 'object') return undefined
  return parsed as Record<string, unknown>
}

/**
 * Load and merge configuration from multiple sources.
 *
 * Merge order (later wins):
 *   1. Built-in defaults
 *   2. User config   (~/.mmr/config.yaml)
 *   3. Project config (.mmr.yaml in projectRoot)
 *   4. CLI overrides
 *
 * The merged result is validated through MmrConfigSchema.parse().
 */
export function loadConfig(opts: LoadConfigOptions): MmrConfigParsed {
  const { projectRoot, cliOverrides } = opts
  const userHome = opts.userHome ?? os.homedir()

  // Start with defaults
  let merged: Record<string, unknown> = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>

  // Layer 2: user config
  const userConfigPath = path.join(userHome, '.mmr', 'config.yaml')
  const userConfig = loadYaml(userConfigPath)
  if (userConfig) {
    merged = deepMerge(merged, userConfig)
  }

  // Layer 3: project config
  const projectConfigPath = path.join(projectRoot, '.mmr.yaml')
  const projectConfig = loadYaml(projectConfigPath)
  if (projectConfig) {
    merged = deepMerge(merged, projectConfig)
  }

  // Layer 4: CLI overrides (applied to defaults sub-object)
  if (cliOverrides) {
    const overrideDefaults: Record<string, unknown> = {}
    if (cliOverrides.fix_threshold !== undefined) overrideDefaults.fix_threshold = cliOverrides.fix_threshold
    if (cliOverrides.timeout !== undefined) overrideDefaults.timeout = cliOverrides.timeout
    if (cliOverrides.format !== undefined) overrideDefaults.format = cliOverrides.format

    if (Object.keys(overrideDefaults).length > 0) {
      merged = deepMerge(merged, { defaults: overrideDefaults })
    }
  }

  // Validate through Zod schema
  return MmrConfigSchema.parse(merged)
}
