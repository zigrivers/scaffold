import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../config/loader.js'
import { BUILTIN_CHANNELS } from '../config/defaults.js'
import { checkInstalled, checkAuth } from '../core/auth.js'
import { probeRuntime } from '../core/runtime-probe.js'
import { OSS_RUNTIMES, exampleBlockFor, type OssRuntimeId } from '../core/oss-examples.js'
import { redactChannel } from '../core/redact.js'

interface ConfigArgs {
  action: string
  'with-examples'?: boolean
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

function configChannels(): void {
  const config = loadConfig({ projectRoot: process.cwd() })
  const channels = Object.entries(config.channels).map(([name, ch]) => {
    const display = redactChannel(ch as unknown as Record<string, unknown>)
    const command = typeof display.command === 'string' && commandContainsInlineSecret(display.command)
      ? '<redacted>'
      : display.command
    return {
      name,
      enabled: display.enabled,
      command,
      parser: display.output_parser,
    }
  })
  console.log(JSON.stringify(channels, null, 2))
}

function commandContainsInlineSecret(command: string): boolean {
  const keyValueRe = /(?:^|[\s'"?&{,])"?([A-Za-z0-9_.-]+)"?\s*[:=]/g
  for (const match of command.matchAll(keyValueRe)) {
    if (isCommandSecretKey(match[1])) return true
  }

  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = stripQuotes(tokens[i])
    const next = stripQuotes(tokens[i + 1])
    if (!token.startsWith('--') || token.includes('=') || token.includes(':') || next.startsWith('-')) continue
    if (isCommandSecretKey(token)) return true
  }

  return false
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

function isCommandSecretKey(name: string): boolean {
  const parts = name
    .replace(/^-+/, '')
    .split(/[_.-]+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
    .filter(Boolean)
    .map((part) => part.toLowerCase())
  const compact = parts.join('')
  if (
    [
      'apikey',
      'auth',
      'authorization',
      'clientsecret',
      'cookie',
      'credential',
      'credentials',
      'creds',
      'password',
      'passphrase',
      'passwd',
      'secret',
      'token',
    ].includes(compact)
  ) {
    return true
  }
  if (parts.includes('key') && parts.some((part) => ['access', 'api', 'private'].includes(part))) return true
  if (
    parts.includes('token') &&
    parts.some((part) => ['access', 'api', 'auth', 'bearer', 'refresh', 'session'].includes(part))
  ) {
    return true
  }
  if (parts.includes('secret') && parts.some((part) => ['api', 'client', 'private'].includes(part))) return true
  return false
}

export const configCommand: CommandModule<object, ConfigArgs> = {
  command: 'config <action>',
  describe: 'Manage mmr configuration',
  builder: (yargs) =>
    yargs
      .positional('action', {
        type: 'string',
        demandOption: true,
        describe: 'Config action',
        choices: ['init', 'test', 'channels'],
      })
      .option('with-examples', {
        type: 'boolean',
        default: false,
        describe: 'Emit all OSS runtime example blocks (init)',
      }),
  handler: async (args: ArgumentsCamelCase<ConfigArgs>) => {
    switch (args.action) {
    case 'init':
      await configInit({ withExamples: args['with-examples'] === true })
      break
    case 'test':
      await configTest()
      break
    case 'channels':
      configChannels()
      break
    default:
      console.error(`Unknown config action: ${args.action}`)
      process.exit(1)
    }
  },
}
