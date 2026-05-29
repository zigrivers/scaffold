import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yaml from 'js-yaml'
import { MmrConfigSchema, type MmrConfigParsed } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'
import { isSecretKey } from '../core/redact.js'
import { readFileAtRef } from '../core/git-show.js'

export interface LoadConfigOptions {
  projectRoot: string
  userHome?: string
  onWarning?: (message: string) => void
  trustProjectConfig?: boolean
  configBaseRef?: string
  /**
   * When true, project `.mmr.yaml` is not loaded at all (built-in + user config
   * only). Used by the review pipeline in untrusted-HEAD / non-git mode without
   * an explicit trust opt-in, so an untrusted working-tree config is never read.
   */
  skipProjectConfig?: boolean
  cliOverrides?: {
    fix_threshold?: string
    timeout?: number
    format?: string
  }
}

type WarningSink = (message: string) => void

interface ConfigLayers {
  merged: Record<string, unknown>
  userConfig: Record<string, unknown>
  projectConfig: Record<string, unknown>
  cliConfig: Record<string, unknown>
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
    if (overVal === undefined) continue

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

function resetExtendingChannelBases(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): void {
  if (!isPlainRecord(base.channels) || !isPlainRecord(overlay.channels)) return
  for (const [name, channel] of Object.entries(overlay.channels)) {
    if (isPlainRecord(channel) && typeof channel.extends === 'string') {
      base.channels[name] = {}
    }
  }
}

function resetExtendingChannelProvenance(
  baseChannels: Record<string, ChannelProvenance>,
  overlay: Record<string, unknown>,
): void {
  if (!isPlainRecord(overlay.channels)) return
  for (const [name, channel] of Object.entries(overlay.channels)) {
    if (isPlainRecord(channel) && typeof channel.extends === 'string') {
      baseChannels[name] = {}
    }
  }
}

/**
 * Try to read and parse a YAML file; returns undefined if missing.
 */
function parseYamlConfig(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse ${label}: ${msg}`)
  }
  if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config in ${label}: expected an object, got ${typeof parsed}`)
  }
  return parsed as Record<string, unknown>
}

/**
 * Try to read and parse a YAML file; returns undefined if missing.
 */
function loadYaml(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) return undefined
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return undefined
  }
  return parseYamlConfig(raw, filePath)
}

function loadProjectYaml(opts: LoadConfigOptions): Record<string, unknown> | undefined {
  if (opts.skipProjectConfig === true) {
    // Default-deny: untrusted tree with no opt-in → no project config.
    return undefined
  }
  // Precedence note: trustProjectConfig:true intentionally overrides
  // configBaseRef (it means "trust the working tree"). The review handler never
  // passes both — it sends exactly one of { configBaseRef } / { trustProjectConfig }
  // / { skipProjectConfig } per trust mode — so this combination only arises for
  // other direct callers, who get the documented working-tree behavior.
  if (opts.configBaseRef !== undefined && opts.trustProjectConfig !== true) {
    // Trust boundary (§5 decision 1): read .mmr.yaml from the trusted base ref
    // via the shared git-show helper, never from the (possibly untrusted)
    // working tree. Missing file/ref → no project config (built-in defaults).
    const raw = readFileAtRef({ cwd: opts.projectRoot, ref: opts.configBaseRef, filePath: './.mmr.yaml' })
    if (raw === undefined) return undefined
    return parseYamlConfig(raw, `${opts.configBaseRef}:.mmr.yaml`)
  }

  return loadYaml(path.join(opts.projectRoot, '.mmr.yaml'))
}

const MAX_EXTENDS_DEPTH = 4

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
  )
}

function resolveChannelExtends(
  name: string,
  channels: Record<string, Record<string, unknown>>,
  stack: string[] = [],
): Record<string, unknown> {
  if (stack.includes(name)) {
    throw new Error(`Channel extends cycle detected: ${[...stack, name].join(' -> ')}`)
  }
  if (stack.length > MAX_EXTENDS_DEPTH) {
    throw new Error(
      `Channel extends depth exceeds max (${MAX_EXTENDS_DEPTH}) at ${[...stack, name].join(' -> ')}`,
    )
  }

  const channel = channels[name]
  if (!channel) {
    throw new Error(`Channel "${name}" referenced by extends not found`)
  }

  const parentName = channel.extends
  if (typeof parentName !== 'string') return channel

  const parentResolved = resolveChannelExtends(parentName, channels, [...stack, name])
  const childWithoutExtends: Record<string, unknown> = { ...channel }
  delete childWithoutExtends.extends

  const childDefinesAbstract = Object.prototype.hasOwnProperty.call(channel, 'abstract')
  const parentBase = structuredClone(parentResolved) as Record<string, unknown>
  const merged = deepMerge(parentBase, childWithoutExtends)
  if (!childDefinesAbstract) {
    delete merged.abstract
  }
  return merged
}

function resolveExtendsAcrossChannels(
  channels: Record<string, Record<string, unknown>> | undefined,
): Record<string, Record<string, unknown>> {
  if (!channels) return {}
  const resolved: Record<string, Record<string, unknown>> = {}
  for (const name of Object.keys(channels)) {
    resolved[name] = resolveChannelExtends(name, channels)
  }
  return resolved
}

function validateRunnableChannels(config: MmrConfigParsed): void {
  for (const [name, channel] of Object.entries(config.channels)) {
    if (channel.abstract) continue
    if (!channel.command) {
      throw new Error(`Channel "${name}" must define command after inheritance unless abstract is set`)
    }
  }
}

function validateCompensatorReference(config: MmrConfigParsed): void {
  const compensator = config.defaults.compensator
  if (!compensator) return
  const ref = compensator.channel
  if (ref === undefined) return
  if (ref.trim().length === 0) {
    throw new Error(
      'defaults.compensator.channel cannot be empty. '
      + 'Configure a concrete channel name in the channels: section, or remove the compensator block.',
    )
  }
  const hasTarget = Object.prototype.hasOwnProperty.call(config.channels, ref)
  const target = config.channels[ref]
  if (!hasTarget || !target) {
    throw new Error(
      `defaults.compensator.channel references unknown channel "${ref}". `
      + 'Configure a channel with this name in the channels: section, or remove the compensator block.',
    )
  }
  // Abstract channels (v3.28 T1-A) are templates only: they cannot be
  // dispatched directly and therefore cannot serve as a compensator target.
  if (target.abstract === true) {
    throw new Error(
      `defaults.compensator.channel "${ref}" is marked abstract: true (T1-A). `
      + 'Abstract channels are non-dispatchable templates; reference a concrete channel that extends it instead.',
    )
  }
  if (!target.command) {
    throw new Error(
      `defaults.compensator.channel "${ref}" is missing command. `
      + 'Compensator channels must be concrete dispatch targets.',
    )
  }
}

function warnOnInlineSecretHeaders(config: MmrConfigParsed, warn: WarningSink): void {
  for (const [name, channel] of Object.entries(config.channels)) {
    const headers = channel.headers
    if (!headers) continue
    for (const headerKey of Object.keys(headers)) {
      if (isSecretKey(headerKey, { exemptEnvNameKeys: false })) {
        warn(
          `[mmr] warning: channel "${name}" has a literal "${headerKey}" header. ` +
          'For HTTP channels in v3.30, move the secret to an env var and reference it via api_key_env.',
        )
      }
    }
  }
}

function loadConfigLayers(opts: LoadConfigOptions): ConfigLayers {
  const { cliOverrides } = opts
  const userHome = opts.userHome ?? os.homedir()

  let merged: Record<string, unknown> = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>

  const userConfigPath = path.join(userHome, '.mmr', 'config.yaml')
  const userConfig = loadYaml(userConfigPath) ?? {}
  if (Object.keys(userConfig).length > 0) {
    resetExtendingChannelBases(merged, userConfig)
    merged = deepMerge(merged, userConfig)
  }

  const projectConfig = loadProjectYaml(opts) ?? {}
  if (Object.keys(projectConfig).length > 0) {
    resetExtendingChannelBases(merged, projectConfig)
    merged = deepMerge(merged, projectConfig)
  }

  const cliConfig = cliOverridesToConfig(cliOverrides)
  if (Object.keys(cliConfig).length > 0) {
    merged = deepMerge(merged, cliConfig)
  }

  return { merged, userConfig, projectConfig, cliConfig }
}

function cliOverridesToConfig(cliOverrides: LoadConfigOptions['cliOverrides']): Record<string, unknown> {
  if (!cliOverrides) return {}
  const overrideDefaults: Record<string, unknown> = {}
  if (cliOverrides.fix_threshold !== undefined) overrideDefaults.fix_threshold = cliOverrides.fix_threshold
  if (cliOverrides.timeout !== undefined) overrideDefaults.timeout = cliOverrides.timeout
  if (cliOverrides.format !== undefined) overrideDefaults.format = cliOverrides.format

  return Object.keys(overrideDefaults).length > 0 ? { defaults: overrideDefaults } : {}
}

function parseMergedConfig(mergedRaw: Record<string, unknown>, warn: WarningSink = console.warn): MmrConfigParsed {
  const merged = structuredClone(mergedRaw) as Record<string, unknown>
  if (isPlainRecord(merged.channels)) {
    merged.channels = resolveExtendsAcrossChannels(
      merged.channels as Record<string, Record<string, unknown>>,
    )
  }

  const config = MmrConfigSchema.parse(merged)
  warnOnInlineSecretHeaders(config, warn)
  validateCompensatorReference(config)
  validateRunnableChannels(config)
  return config
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
  const { merged } = loadConfigLayers(opts)
  return parseMergedConfig(merged, opts.onWarning)
}

export type ProvenanceSource = 'default' | 'user' | 'project' | 'cli'

export interface ChannelProvenance {
  [field: string]: ProvenanceSource | ChannelProvenance
}

export interface ConfigProvenance {
  defaults: ChannelProvenance
  channels: Record<string, ChannelProvenance>
}

export interface LoadConfigWithProvenanceResult {
  config: MmrConfigParsed
  provenance: ConfigProvenance
}

function provenanceForRecord(overlay: Record<string, unknown>, source: ProvenanceSource): ChannelProvenance {
  const result: ChannelProvenance = {}
  for (const [k, v] of Object.entries(overlay)) {
    if (isPlainRecord(v)) {
      result[k] = provenanceForRecord(v, source)
    } else {
      result[k] = source
    }
  }
  return result
}

function applyProvenanceLayer(
  base: ConfigProvenance,
  overlay: Record<string, unknown>,
  source: ProvenanceSource,
): void {
  if (isPlainRecord(overlay.defaults)) {
    base.defaults = deepMerge(base.defaults, provenanceForRecord(overlay.defaults, source))
  }
  resetExtendingChannelProvenance(base.channels, overlay)
  if (!isPlainRecord(overlay.channels)) return
  for (const [name, channel] of Object.entries(overlay.channels)) {
    if (!isPlainRecord(channel)) continue
    base.channels[name] = deepMerge(base.channels[name] ?? {}, provenanceForRecord(channel, source))
  }
}

function resolveChannelProvenanceExtends(
  name: string,
  channels: Record<string, Record<string, unknown>>,
  provenance: Record<string, ChannelProvenance>,
  stack: string[] = [],
): ChannelProvenance {
  if (stack.includes(name)) {
    throw new Error(`Channel extends cycle detected: ${[...stack, name].join(' -> ')}`)
  }
  if (stack.length > MAX_EXTENDS_DEPTH) {
    throw new Error(
      `Channel extends depth exceeds max (${MAX_EXTENDS_DEPTH}) at ${[...stack, name].join(' -> ')}`,
    )
  }

  const channel = channels[name]
  if (!channel) {
    throw new Error(`Channel "${name}" referenced by extends not found`)
  }

  const ownProvenance = structuredClone(provenance[name] ?? {}) as ChannelProvenance
  const parentName = channel.extends
  if (typeof parentName !== 'string') return ownProvenance

  const parentResolved = resolveChannelProvenanceExtends(parentName, channels, provenance, [...stack, name])
  delete ownProvenance.extends
  const childDefinesAbstract = Object.prototype.hasOwnProperty.call(channel, 'abstract')
  const merged = deepMerge(structuredClone(parentResolved) as ChannelProvenance, ownProvenance)
  if (!childDefinesAbstract) {
    delete merged.abstract
  }
  return merged
}

function fillDefaultProvenance(finalValue: unknown, provenance: ChannelProvenance): void {
  if (!isPlainRecord(finalValue)) return
  for (const [field, value] of Object.entries(finalValue)) {
    if (isPlainRecord(value)) {
      const existing = provenance[field]
      const nested = isPlainRecord(existing) ? existing as ChannelProvenance : {}
      provenance[field] = nested
      fillDefaultProvenance(value, nested)
    } else if (provenance[field] === undefined) {
      provenance[field] = 'default'
    }
  }
}

export function loadConfigWithProvenance(opts: LoadConfigOptions): LoadConfigWithProvenanceResult {
  const { merged: mergedRaw, userConfig, projectConfig, cliConfig } = loadConfigLayers(opts)

  const rawProvenance: ConfigProvenance = { defaults: {}, channels: {} }
  applyProvenanceLayer(rawProvenance, DEFAULT_CONFIG as unknown as Record<string, unknown>, 'default')
  if (Object.keys(userConfig).length > 0) applyProvenanceLayer(rawProvenance, userConfig, 'user')
  if (Object.keys(projectConfig).length > 0) applyProvenanceLayer(rawProvenance, projectConfig, 'project')
  if (Object.keys(cliConfig).length > 0) applyProvenanceLayer(rawProvenance, cliConfig, 'cli')

  const config = parseMergedConfig(mergedRaw, opts.onWarning)
  const provenance: ConfigProvenance = { defaults: rawProvenance.defaults, channels: {} }
  fillDefaultProvenance(config.defaults, provenance.defaults)
  const mergedChannels = isPlainRecord(mergedRaw.channels)
    ? mergedRaw.channels as Record<string, Record<string, unknown>>
    : {}
  for (const name of Object.keys(config.channels)) {
    provenance.channels[name] = resolveChannelProvenanceExtends(name, mergedChannels, rawProvenance.channels)
    fillDefaultProvenance(config.channels[name], provenance.channels[name])
  }
  return { config, provenance }
}
