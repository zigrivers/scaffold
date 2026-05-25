import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import {
  loadConfig,
  loadConfigWithProvenance,
  type ChannelProvenance,
  type ProvenanceSource,
} from '../config/loader.js'
import { BUILTIN_CHANNELS } from '../config/defaults.js'
import { checkInstalled, checkAuth } from '../core/auth.js'
import { probeRuntime } from '../core/runtime-probe.js'
import { OSS_RUNTIMES, exampleBlockFor, type OssRuntimeId } from '../core/oss-examples.js'
import { isSecretKey, redactChannel } from '../core/redact.js'

interface ConfigArgs {
  action: string
  name?: string
  target?: string
  'with-examples'?: boolean
  'no-redact'?: boolean
  redact?: boolean
}

async function ossProbeResults(): Promise<Map<OssRuntimeId, boolean>> {
  const results = await Promise.all(
    OSS_RUNTIMES.map(async (runtime) => {
      try {
        return [
          runtime.id,
          (await probeRuntime(runtime.probe.command, runtime.probe.args, runtime.probe.timeoutMs)).detected,
        ] as const
      } catch {
        return [runtime.id, false] as const
      }
    }),
  )
  return new Map(results)
}

function exampleBlocksFor(
  probeResults: Map<OssRuntimeId, boolean>,
  includeAll: boolean,
): string[] {
  return OSS_RUNTIMES
    .filter((runtime) => includeAll || probeResults.get(runtime.id) === true)
    .map((runtime) => exampleBlockFor(runtime.id))
}

async function configInit(opts: { withExamples: boolean } = { withExamples: false }): Promise<void> {
  const configPath = path.join(process.cwd(), '.mmr.yaml')
  if (fs.existsSync(configPath)) {
    console.error('.mmr.yaml already exists. Remove it first to re-initialize.')
    process.exit(1)
  }

  // Auto-detect which CLIs are installed
  const channelLines: string[] = ['channels:']
  for (const [name, chConfig] of Object.entries(BUILTIN_CHANNELS)) {
    if (!chConfig.command) continue
    const cmd = chConfig.command.split(' ')[0]
    const installed = await checkInstalled(cmd)
    channelLines.push(`  ${name}:`)
    channelLines.push(`    enabled: ${installed}`)
    console.log(`  ${name}: ${installed ? 'detected' : 'not found'}`)
  }

  const ossResults = await ossProbeResults()
  const ossBlocks = exampleBlocksFor(ossResults, opts.withExamples)
  for (const runtime of OSS_RUNTIMES) {
    console.log(`  ${runtime.id}: ${ossResults.get(runtime.id) ? 'detected' : 'not found'}`)
  }

  const template = [
    'version: 1',
    '',
    'defaults:',
    '  # fix_threshold: minimum severity that blocks the review verdict.',
    '  # Findings below this severity are kept in the result as advisory',
    '  # but don\'t cause `blocked`. Choose based on project risk profile:',
    '  #   P0 — block only on critical (security, data loss, broken functionality)',
    '  #   P1 — block on critical + significant bugs                 [low friction]',
    '  #   P2 — block on critical + significant + suggestions        [DEFAULT]',
    '  #   P3 — block on everything down to nits                     [strict]',
    '  fix_threshold: P2',
    '  timeout: 300',
    '  format: json',
    '',
    ...channelLines,
    '',
    ...(ossBlocks.length > 0 ? [
      '# --- OSS runtime examples (uncomment to enable) ---',
      ...ossBlocks,
      '',
    ] : []),
  ].join('\n')

  fs.writeFileSync(configPath, template)
  console.log(`\nCreated ${configPath}`)
}

async function configTest(): Promise<void> {
  const config = loadConfig({ projectRoot: process.cwd() })
  const results: Record<string, { installed: boolean; auth: string; recovery?: string }> = {}
  let allOk = true

  for (const [name, chConfig] of Object.entries(config.channels)) {
    if (chConfig.abstract) {
      results[name] = { installed: false, auth: 'abstract' }
      continue
    }
    if (!chConfig.enabled) {
      results[name] = { installed: false, auth: 'disabled' }
      continue
    }
    if (!chConfig.command) {
      results[name] = { installed: false, auth: 'missing_command' }
      allOk = false
      continue
    }

    const cmd = chConfig.command.split(' ')[0]
    const installed = await checkInstalled(cmd)
    if (!installed) {
      results[name] = { installed: false, auth: 'skipped' }
      allOk = false
      continue
    }

    const authResult = await checkAuth(chConfig)
    results[name] = {
      installed: true,
      auth: authResult.status,
      recovery: authResult.recovery,
    }
    if (authResult.status !== 'ok') {
      allOk = false
    }
  }

  console.log(JSON.stringify(results, null, 2))
  process.exit(allOk ? 0 : 1)
}

function configChannels(opts: { name?: string, target?: string, noRedact?: boolean } = {}): boolean {
  const rawName = opts.name
  if (rawName === 'show' && opts.target) {
    return showChannel(opts.target, { noRedact: opts.noRedact === true })
  }
  if (rawName === 'show') {
    console.error('Usage: mmr config channels show:<channel> or mmr config channels show <channel>')
    return false
  }
  if (rawName && rawName.startsWith('show:')) {
    const channelName = rawName.slice('show:'.length).trim()
    return showChannel(channelName, { noRedact: opts.noRedact === true })
  }
  if (rawName || opts.target) {
    console.error('Usage: mmr config channels show:<channel> or mmr config channels show <channel>')
    return false
  }

  const config = loadConfig({ projectRoot: process.cwd() })
  const channels = Object.entries(config.channels).map(([name, ch]) => {
    const display = redactChannel(ch as unknown as Record<string, unknown>)
    const command = redactDisplayCommand(display.command)
    return {
      name,
      enabled: display.enabled,
      command,
      parser: display.output_parser,
    }
  })
  console.log(JSON.stringify(channels, null, 2))
  return true
}

function isNoRedact(args: Pick<ConfigArgs, 'redact' | 'no-redact'>): boolean {
  return args.redact === false || args['no-redact'] === true
}

function showChannel(name: string, opts: { noRedact: boolean }): boolean {
  const { config, provenance } = loadConfigWithProvenance({ projectRoot: process.cwd() })
  const ch = config.channels[name]
  if (!ch) {
    const known = Object.keys(config.channels).join(', ')
    console.error(`Channel "${name}" not found. Known channels: ${known}`)
    return false
  }

  const display = opts.noRedact
    ? { ...ch } as Record<string, unknown>
    : redactShowChannel(ch as unknown as Record<string, unknown>)
  if (!opts.noRedact && Object.prototype.hasOwnProperty.call(display, 'command')) {
    display.command = redactDisplayCommand(display.command)
  }
  if (opts.noRedact) {
    console.error('WARNING: --no-redact is enabled; secrets in env/headers are printed verbatim.')
  }

  const prov = provenance.channels[name] ?? {}
  console.log(`# Channel: ${name}`)
  printWithProvenance(display as Record<string, unknown>, prov, 0)
  return true
}

function printWithProvenance(
  obj: Record<string, unknown>,
  prov: ChannelProvenance,
  indent: number,
): void {
  const pad = '  '.repeat(indent)
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      console.log(`${pad}${k}:`)
      const nestedProv = (prov[k] as ChannelProvenance | undefined) ?? {}
      printWithProvenance(v as Record<string, unknown>, nestedProv, indent + 1)
    } else {
      const source = typeof prov[k] === 'string' ? (prov[k] as ProvenanceSource) : 'default'
      const rendered = renderScalar(v)
      console.log(`${pad}${k}: ${rendered}  # from ${source}`)
    }
  }
}

function renderScalar(value: unknown): string {
  if (value === '<redacted>') return '<redacted>'
  return JSON.stringify(value)
}

function redactDisplayCommand(command: unknown): unknown {
  return typeof command === 'string' && commandContainsInlineSecret(command) ? '<redacted>' : command
}

function redactShowChannel(channel: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(channel)) {
    out[key] = redactShowValue(key, value)
  }
  return out
}

function redactShowValue(key: string, value: unknown): unknown {
  if (Array.isArray(value)) return redactShowArray(value)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      out[nestedKey] = redactShowValue(nestedKey, nestedValue)
    }
    return out
  }
  if (typeof value === 'string' && isCommandLikeKey(key) && commandContainsInlineSecret(value)) {
    return '<redacted>'
  }
  return isSecretKey(key, { exemptEnvNameKeys: false }) ? '<redacted>' : value
}

function redactShowArray(values: unknown[]): unknown[] {
  const out: unknown[] = []
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (
      typeof value === 'string' &&
      typeof values[i + 1] === 'string' &&
      isStandaloneSecretKeyToken(value)
    ) {
      out.push(value, '<redacted>')
      i += 1
      continue
    }
    if (typeof value === 'string' && commandContainsInlineSecret(value)) {
      out.push('<redacted>')
      continue
    }
    out.push(redactShowValue('', value))
  }
  return out
}

function isStandaloneSecretKeyToken(value: string): boolean {
  return !/[\s:=]/.test(value) && isCommandSecretKey(value)
}

function isCommandLikeKey(key: string): boolean {
  return ['command', 'check', 'recovery'].includes(key)
}

function commandContainsInlineSecret(command: string): boolean {
  const keyValueRe = /(?:^|[\s'"?&{,=])"?(-{0,2}[A-Za-z0-9_.-]+)"?\s*[:=]/g
  for (const match of command.matchAll(keyValueRe)) {
    if (isCommandSecretKey(match[1])) return true
  }
  const nestedKeyValueRe = /[=:]"?([A-Za-z0-9_.-]+)"?\s*[:=]/g
  for (const match of command.matchAll(nestedKeyValueRe)) {
    if (isCommandSecretKey(match[1])) return true
  }

  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = stripQuotes(tokens[i])
    const next = stripQuotes(tokens[i + 1])
    if (['--header', '-H', '--env', '-e'].includes(token) && commandContainsInlineSecret(next)) return true
    if (!token.startsWith('-') || token.includes('=') || token.includes(':') || next.startsWith('-')) continue
    if (isCommandSecretKey(token)) return true
  }

  return false
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

function isCommandSecretKey(name: string): boolean {
  const normalized = name.replace(/^-+/, '').toLowerCase()
  if (normalized.endsWith('-env') || normalized.endsWith('_env')) return false
  if (['auth-type', 'max-tokens', 'session-dir', 'token-limit', 'token-usage'].includes(normalized)) return false
  return isSecretKey(normalized, { exemptEnvNameKeys: false })
}

export const configCommand: CommandModule<object, ConfigArgs> = {
  command: 'config <action> [name] [target]',
  describe: 'Manage mmr configuration',
  builder: (yargs) =>
    yargs
      .positional('action', {
        type: 'string',
        demandOption: true,
        describe: 'Config action',
        choices: ['init', 'test', 'channels'],
      })
      .positional('name', {
        type: 'string',
        describe: 'Optional config target, such as show:<channel> for channels',
      })
      .positional('target', {
        type: 'string',
        describe: 'Optional target name for config channels show <channel>',
      })
      .option('with-examples', {
        type: 'boolean',
        default: false,
        describe: 'Emit all OSS runtime example blocks (init)',
      })
      .option('redact', {
        type: 'boolean',
        default: true,
        describe: 'Redact secrets for config channels show',
      })
      .middleware((args) => {
        if (args.redact === false) args['no-redact'] = true
      }),
  handler: async (args: ArgumentsCamelCase<ConfigArgs>) => {
    if (args.action !== 'channels' && (args.name || args.target)) {
      console.error(`Unexpected argument for config ${args.action}: ${args.target ?? args.name}`)
      process.exit(1)
      return
    }
    switch (args.action) {
    case 'init':
      await configInit({ withExamples: args['with-examples'] === true })
      break
    case 'test':
      await configTest()
      break
    case 'channels': {
      const ok = configChannels({
        name: args.name,
        target: args.target,
        noRedact: isNoRedact(args),
      })
      if (!ok) process.exit(1)
      break
    }
    default:
      console.error(`Unknown config action: ${args.action}`)
      process.exit(1)
    }
  },
}
