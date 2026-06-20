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
import { isSecretKey, redactChannel, redactConfigView } from '../core/redact.js'
import { resolveConfigPaths } from '../config/paths.js'
import { setChannelEnabled } from '../config/writer.js'
import type { OutputParserConfig, MmrConfigParsed } from '../config/schema.js'

interface ConfigArgs {
  action: string
  name?: string
  target?: string
  'with-examples'?: boolean
  'no-redact'?: boolean
  redact?: boolean
  global?: boolean
  project?: boolean
  format?: string
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
    const enabled = chConfig.enabled === false ? false : installed
    channelLines.push(`  ${name}:`)
    channelLines.push(`    enabled: ${enabled}`)
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

function configPath(): void {
  const paths = resolveConfigPaths({ projectRoot: process.cwd() })
  console.log('Search order (later wins):')
  console.log('  1 built-in defaults      (always)')
  console.log(`  2 ${paths.user}      ${paths.userExists ? '✓ exists' : '✗ not found'}`)
  console.log(`  3 ${paths.project}            ${paths.projectExists ? '✓ exists' : '✗ not found'}`)
  console.log('  4 CLI flags              (per-invocation)')
  console.log(`write target (default): ${paths.project}`)
  console.log(`                  --global → ${paths.user}`)
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

function configChannels(
  opts: { name?: string, target?: string, noRedact?: boolean, format?: string } = {},
): boolean {
  const rawName = opts.name
  if (rawName === 'show' && opts.target) {
    return showChannel(opts.target, { noRedact: opts.noRedact === true })
  }
  if (rawName === 'show') {
    console.error('Usage: mmr config channels show <channel> (or show:<channel>)')
    return false
  }
  if (rawName && rawName.startsWith('show:')) {
    const channelName = rawName.slice('show:'.length).trim()
    return showChannel(channelName, { noRedact: opts.noRedact === true })
  }
  if (rawName || opts.target) {
    console.error('Usage: mmr config channels show <channel> (or show:<channel>)')
    return false
  }

  const noRedact = opts.noRedact === true
  if (noRedact) {
    console.error('WARNING: --no-redact is enabled; secrets in commands/env/headers may be printed verbatim.')
  }
  const { config, provenance } = loadConfigWithProvenance({ projectRoot: process.cwd() })
  const rows = Object.entries(config.channels).map(([name, ch]) => {
    const chRec = ch as unknown as Record<string, unknown>
    const display = noRedact ? chRec : redactChannel(chRec)
    const command = noRedact ? display.command : redactDisplayCommand(display.command)
    const source = (provenance.channels[name]?.enabled as string | undefined) ?? 'default'
    return {
      name,
      // `enabled` is the raw per-channel flag; `effective` folds in the legacy
      // channels_disabled list so the displayed status matches what review
      // actually dispatches.
      enabled: display.enabled,
      effective: effectiveEnabled(config, name),
      command,
      parser: formatOutputParser(display.output_parser as OutputParserConfig | undefined),
      source,
    }
  })

  // Route every output mode through the single redaction boundary (D4). The
  // command string is also scanned for inline secrets at row-build time above
  // (redactDisplayCommand), which key-based redaction cannot see. `noRedact`
  // is threaded through so --no-redact bypasses (after the stderr warning above).
  const safeRows = redactConfigView(rows, { noRedact }) as typeof rows

  if (opts.format === 'text') {
    const pad = (s: string, n: number) => s.padEnd(n)
    console.log(`${pad('CHANNEL', 18)}${pad('STATUS', 11)}SOURCE`)
    for (const r of safeRows) {
      const status = r.effective ? 'enabled' : 'disabled'
      console.log(`${pad(r.name, 18)}${pad(status, 11)}${r.source}`)
    }
    return true
  }

  console.log(JSON.stringify(safeRows, null, 2))
  return true
}

function formatOutputParser(op: OutputParserConfig | undefined): string | undefined {
  if (op === undefined) return undefined
  return typeof op === 'string' ? op : `<${op.kind}>`
}

function isNoRedact(args: Pick<ConfigArgs, 'redact' | 'no-redact'>): boolean {
  return args['no-redact'] === true
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

/**
 * Resolve which config file a mutator should write to (D1).
 * `--global`/`--project` force the target. Otherwise the default is the
 * project `.mmr.yaml` — except a `disable` of a channel whose CLI is not
 * installed, which is a machine-level fact and routes to the global file.
 */
async function resolveWriteTarget(
  channel: string,
  enabling: boolean,
  args: ConfigArgs,
  config: MmrConfigParsed,
): Promise<{ file: string; notInstalled: boolean }> {
  const paths = resolveConfigPaths({ projectRoot: process.cwd() })
  if (args.global) return { file: paths.user, notInstalled: false }
  if (args.project) return { file: paths.project, notInstalled: false }
  if (!enabling) {
    const cmd = config.channels[channel]?.command?.split(' ')[0]
    if (cmd && !(await checkInstalled(cmd))) {
      // Only route to global if the channel is known WITHOUT the project config
      // (a built-in, or one defined in the global file). A project-only custom
      // channel must NOT be stubbed globally: its command lives only in the
      // project, so a global `enabled: false` stub (command-less) would fail
      // config validation in every other repo.
      const globalOnly = loadConfig({ projectRoot: process.cwd(), skipProjectConfig: true })
      if (globalOnly.channels[channel]) {
        return { file: paths.user, notInstalled: true }
      }
    }
  }
  return { file: paths.project, notInstalled: false }
}

/**
 * Compute whether a channel will actually be dispatched given the fully merged
 * config: its effective `enabled` flag AND any legacy `channels_disabled` list
 * membership. Used to report the real post-write state rather than the value we
 * just requested, which a higher-precedence layer could still override.
 */
function effectiveEnabled(config: MmrConfigParsed, channel: string): boolean {
  const disabledList = new Set(config.channels_disabled ?? [])
  return config.channels[channel]?.enabled !== false && !disabledList.has(channel)
}

async function configToggle(channel: string | undefined, enabled: boolean, args: ConfigArgs): Promise<boolean> {
  if (!channel) {
    console.error(`Usage: mmr config ${enabled ? 'enable' : 'disable'} <channel>`)
    return false
  }
  if (args.global && args.project) {
    console.error('Pass only one of --global or --project, not both.')
    return false
  }
  // Validate the channel exists before writing, so a typo cannot create a
  // command-less channel that then fails config validation on the next load.
  const before = loadConfig({ projectRoot: process.cwd() })
  if (!before.channels[channel]) {
    const known = Object.keys(before.channels).join(', ')
    console.error(`Unknown channel '${channel}'. Known channels: ${known}`)
    return false
  }

  const target = await resolveWriteTarget(channel, enabled, args, before)
  try {
    fs.mkdirSync(path.dirname(target.file), { recursive: true })
    setChannelEnabled(target.file, channel, enabled)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Failed to write ${target.file}: ${msg}`)
    return false
  }

  const verb = enabled ? 'Enabled' : 'Disabled'
  console.log(`✓ ${verb} channel '${channel}'`)
  if (target.notInstalled) {
    console.log(`  ${channel} CLI not installed — recorded as a machine-level preference in ${target.file}`)
    console.log('  pass --project to scope it to this repo instead')
  } else {
    console.log(`  wrote ${target.file}`)
  }

  // Report the EFFECTIVE merged state, not just the value we wrote — a
  // higher-precedence layer (e.g. a project override after a global write)
  // could still win, and the user must know if the intent didn't take effect.
  const { config, provenance } = loadConfigWithProvenance({ projectRoot: process.cwd() })
  const src = (provenance.channels[channel]?.enabled as string | undefined) ?? 'default'
  const effective = effectiveEnabled(config, channel)
  console.log(`  now    ${channel}  ${effective ? 'enabled' : 'disabled'}  (${src})`)
  if (effective !== enabled) {
    console.log(`  ⚠ a higher-precedence config layer still ${effective ? 'enables' : 'disables'} this channel`)
    console.log('    run `mmr config channels --format text` to see which source wins')
  }
  console.log(`  revert mmr config ${enabled ? 'disable' : 'enable'} ${channel}`)
  return true
}

/**
 * Canonical, runnable examples surfaced in `mmr config --help`. Lead with the
 * conventional positional forms (P7/P8) so an agent reading help picks the
 * canonical command, not the bespoke `show:<channel>` colon alias.
 */
export const CONFIG_EXAMPLES: ReadonlyArray<readonly [string, string]> = [
  ['mmr config path', 'Show where config is read from and written to'],
  ['mmr config channels', 'List channels as JSON (add --format text for a table)'],
  ['mmr config channels show codex', 'Inspect one channel with provenance'],
  ['mmr config disable grok', 'Turn a channel off (writes channels.grok.enabled: false)'],
  ['mmr config enable grok', 'Turn a channel back on'],
]

export const configCommand: CommandModule<object, ConfigArgs> = {
  command: 'config <action> [name] [target]',
  describe: 'Manage mmr configuration',
  builder: (yargs) =>
    yargs
      .example(CONFIG_EXAMPLES as Array<[string, string]>)
      .positional('action', {
        type: 'string',
        demandOption: true,
        describe: 'Config action',
        choices: ['init', 'test', 'channels', 'path', 'enable', 'disable'],
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
      .option('global', {
        type: 'boolean',
        describe: 'Write to the global ~/.mmr/config.yaml (enable/disable)',
      })
      .option('project', {
        type: 'boolean',
        describe: 'Write to the project ./.mmr.yaml (enable/disable)',
      })
      .option('format', {
        choices: ['json', 'text'],
        default: 'json',
        describe: 'Output format for config channels (json | text table)',
      })
      .middleware((args) => {
        if (args.redact === false) args['no-redact'] = true
      }),
  handler: async (args: ArgumentsCamelCase<ConfigArgs>) => {
    // `channels` takes [name] and [target]; `enable`/`disable` take [name] only.
    const nameOk = args.action === 'channels' || args.action === 'enable' || args.action === 'disable'
    const targetOk = args.action === 'channels'
    if ((!nameOk && args.name) || (!targetOk && args.target)) {
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
    case 'path':
      configPath()
      break
    case 'enable':
    case 'disable': {
      const ok = await configToggle(args.name, args.action === 'enable', args)
      if (!ok) process.exit(1)
      break
    }
    case 'channels': {
      const ok = configChannels({
        name: args.name,
        target: args.target,
        noRedact: isNoRedact(args),
        format: args.format,
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
