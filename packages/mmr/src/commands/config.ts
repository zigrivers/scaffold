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
import {
  isSecretKey,
  redactChannel,
  redactConfigView,
  redactCommandString,
  commandContainsInlineSecret,
  isCommandSecretKey,
} from '../core/redact.js'
import { resolveConfigPaths } from '../config/paths.js'
import { setChannelEnabled } from '../config/writer.js'
import { normalizeChannelName } from '../config/channel-aliases.js'
import { parse as parseYaml } from 'yaml'
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
      // A user-defined auth.recovery can be an arbitrary command that embeds a
      // token; scan it for inline secrets before printing to stdout.
      recovery: redactCommandString(authResult.recovery) as string | undefined,
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
  const listSource = channelsDisabledSource()
  const rows = Object.entries(config.channels).map(([name, ch]) => {
    const chRec = ch as unknown as Record<string, unknown>
    const display = noRedact ? chRec : redactChannel(chRec)
    const command = noRedact ? display.command : redactCommandString(display.command)
    // Attribute the source to channels_disabled's layer when the channel is
    // disabled by that list rather than by its own enabled flag.
    const source = (disabledByList(config, name) && listSource)
      ? listSource
      : ((provenance.channels[name]?.enabled as string | undefined) ?? 'default')
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
    display.command = redactCommandString(display.command)
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

function redactShowChannel(channel: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(channel)) {
    out[key] = redactShowValue(key, value, true)
  }
  return out
}

function redactShowValue(key: string, value: unknown, topLevel = false): unknown {
  if (Array.isArray(value)) return redactShowArray(value)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      // Nested env/headers entries carry VALUES, so api_key_env is not exempt there.
      out[nestedKey] = redactShowValue(nestedKey, nestedValue, false)
    }
    return out
  }
  if (typeof value === 'string' && isCommandLikeKey(key) && commandContainsInlineSecret(value)) {
    return '<redacted>'
  }
  // Keep the TOP-LEVEL channel `api_key_env` (the env-var NAME) visible, matching
  // `config channels`; a nested env/headers `api_key_env` holds a value → redact.
  return isSecretKey(key, { exemptEnvNameKeys: topLevel }) ? '<redacted>' : value
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
      // Route a not-installed disable to global only when BOTH hold:
      //  (a) the channel itself resolves from global-only config (a built-in or
      //      a user-defined channel) — so a global `enabled: false` won't be an
      //      orphan stub for a channel that doesn't exist in other repos; and
      //  (b) the missing command's VALUE is not a project override — otherwise
      //      the not-installed-ness is project-specific and belongs in-project.
      // (a) alone misses a built-in whose command the project overrides to a
      // missing CLI; (b) alone misses a project-only channel that `extends` a
      // built-in (whose inherited command provenance is default/user). Both
      // together cover every case.
      const globalOnly = loadConfig({ projectRoot: process.cwd(), skipProjectConfig: true })
      const { provenance } = loadConfigWithProvenance({ projectRoot: process.cwd() })
      const cmdSource = provenance.channels[channel]?.command as ProvenanceSource | undefined
      const channelResolvesGlobally = globalOnly.channels[channel] !== undefined
      const commandIsMachineLevel = cmdSource === 'default' || cmdSource === 'user'
      if (channelResolvesGlobally && commandIsMachineLevel) {
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
  // Normalize both sides so an alias in the list (e.g. `agy`) disables its
  // canonical channel (`antigravity`), matching how review dispatch resolves it.
  const target = normalizeChannelName(channel)
  const disabledList = new Set((config.channels_disabled ?? []).map(normalizeChannelName))
  return config.channels[channel]?.enabled !== false && !disabledList.has(target)
}

/**
 * True when `channel` (by canonical name) is a member of the merged
 * `channels_disabled` list — i.e. disabled by the list mechanism rather than by
 * its own `enabled` flag.
 */
function disabledByList(config: MmrConfigParsed, channel: string): boolean {
  const target = normalizeChannelName(channel)
  return (config.channels_disabled ?? []).map(normalizeChannelName).includes(target)
}

/**
 * Which config layer's `channels_disabled` list is in effect. Arrays replace
 * (not merge) across layers, so the highest layer that defines the list wins;
 * we report that layer as the provenance source for list-disabled channels.
 */
function channelsDisabledSource(): ProvenanceSource | undefined {
  const paths = resolveConfigPaths({ projectRoot: process.cwd() })
  for (const [file, src] of [[paths.project, 'project'], [paths.user, 'user']] as const) {
    if (!fs.existsSync(file)) continue
    try {
      const parsed = parseYaml(fs.readFileSync(file, 'utf-8')) as { channels_disabled?: unknown }
      if (parsed && Array.isArray(parsed.channels_disabled)) return src
    } catch {
      // ignore unreadable/invalid file; fall through to the next layer
    }
  }
  return undefined
}

async function configToggle(channelArg: string | undefined, enabled: boolean, args: ConfigArgs): Promise<boolean> {
  if (!channelArg) {
    console.error(`Usage: mmr config ${enabled ? 'enable' : 'disable'} <channel>`)
    return false
  }
  if (args.global && args.project) {
    console.error('Pass only one of --global or --project, not both.')
    return false
  }
  // Accept channel aliases (e.g. `agy` → `antigravity`) at the front door, the
  // same way effectiveEnabled, pruning, and review dispatch resolve them. Use
  // the canonical name for every step below.
  const channel = normalizeChannelName(channelArg)
  // Validate the channel exists before writing, so a typo cannot create a
  // command-less channel that then fails config validation on the next load.
  const before = loadConfig({ projectRoot: process.cwd() })
  const def = before.channels?.[channel]
  if (!def) {
    const known = Object.keys(before.channels ?? {}).join(', ')
    console.error(`Unknown channel '${channelArg}'. Known channels: ${known}`)
    return false
  }
  const target = await resolveWriteTarget(channel, enabled, args, before)
  const userPath = resolveConfigPaths({ projectRoot: process.cwd() }).user
  const isGlobalTarget = target.file === userPath
  // Only the user-owned global config may be a (dotfiles-managed) symlink; the
  // repo-controlled project file must not be written through a symlink.
  const allowSymlink = isGlobalTarget

  // Scope guard, kept symmetric between enable and disable:
  //  - ANY global write requires the channel to be runnable in global-only
  //    config. Disabling a project-only channel globally would write a stub that
  //    its own revert (`enable … --global`) then can't undo; and enabling a
  //    command-less channel globally is invalid. Reject both, point at --project.
  //  - A project ENABLE additionally must not turn a bare merged stub (command-
  //    less) into an invalid `enabled: true`.
  if (isGlobalTarget) {
    const g = loadConfig({ projectRoot: process.cwd(), skipProjectConfig: true }).channels[channel]
    if (!g || (g.kind !== 'http' && !g.command)) {
      console.error(
        `Cannot ${enabled ? 'enable' : 'disable'} '${channel}' with --global: it has no command in `
        + 'the global config (the change would be an unrunnable/un-revertable stub). Use --project.',
      )
      return false
    }
  } else if (enabled) {
    const m = before.channels[channel]
    if (m.kind !== 'http' && !m.command) {
      console.error(
        `Cannot enable '${channel}': it has no command in the merged config `
        + '(it is a disabled stub). Add a command to its channel config first.',
      )
      return false
    }
  }
  try {
    fs.mkdirSync(path.dirname(target.file), { recursive: true })
    // setChannelEnabled writes enabled and (on enable) prunes channels_disabled
    // in THIS file only. We never silently mutate another scope's file — if a
    // different layer still disables the channel, we surface it below so the
    // user can decide, rather than reaching into their global config.
    setChannelEnabled(target.file, channel, enabled, { allowSymlink })
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
  // Attribute the source to channels_disabled's layer when that list (not the
  // enabled flag) is what determines dispatch — same logic as the list view.
  const listSource = channelsDisabledSource()
  const src = (disabledByList(config, channel) && listSource)
    ? listSource
    : ((provenance.channels?.[channel]?.enabled as string | undefined) ?? 'default')
  const effective = effectiveEnabled(config, channel)
  console.log(`  now    ${channel}  ${effective ? 'enabled' : 'disabled'}  (${src})`)
  if (effective !== enabled) {
    // The requested change didn't take effect because another scope wins. Tell
    // the user exactly how to clear it rather than silently editing that file.
    const otherScope = isGlobalTarget ? '--project' : '--global'
    const verb2 = effective ? 'enables' : 'disables'
    console.log(`  ⚠ another config layer still ${verb2} this channel`)
    console.log('    run `mmr config channels --format text` to see which source wins,')
    console.log(`    or re-run with ${otherScope} to change the other layer`)
  }
  // The revert must target the SAME file we wrote — always explicit, because the
  // inverse op could otherwise auto-route elsewhere (e.g. a disable of a
  // not-installed channel routes to global). --project keeps it in this repo.
  const scopeFlag = isGlobalTarget ? ' --global' : ' --project'
  console.log(`  revert mmr config ${enabled ? 'disable' : 'enable'} ${channel}${scopeFlag}`)
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
        choices: ['init', 'test', 'channels', 'path', 'enable', 'disable', 'show'],
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
    // `channels` takes [name] and [target]; `enable`/`disable`/`show` take [name].
    const nameOk = ['channels', 'enable', 'disable', 'show'].includes(args.action)
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
    case 'show': {
      // Top-level alias for `config channels show <channel>`.
      if (!args.name) {
        console.error('Usage: mmr config show <channel>')
        process.exit(1)
        return
      }
      if (!showChannel(args.name, { noRedact: isNoRedact(args) })) process.exit(1)
      break
    }
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
