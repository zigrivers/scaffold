import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../config/loader.js'
import { BUILTIN_CHANNELS } from '../config/defaults.js'
import { checkInstalled, checkAuth } from '../core/auth.js'

interface ConfigArgs {
  action: string
}

async function configInit(): Promise<void> {
  const configPath = path.join(process.cwd(), '.mmr.yaml')
  if (fs.existsSync(configPath)) {
    console.error('.mmr.yaml already exists. Remove it first to re-initialize.')
    process.exit(1)
  }

  // Auto-detect which CLIs are installed
  const channelLines: string[] = ['channels:']
  for (const [name, chConfig] of Object.entries(BUILTIN_CHANNELS)) {
    const cmd = chConfig.command.split(' ')[0]
    const installed = await checkInstalled(cmd)
    channelLines.push(`  ${name}:`)
    channelLines.push(`    enabled: ${installed}`)
    console.log(`  ${name}: ${installed ? 'detected' : 'not found'}`)
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
  ].join('\n')

  fs.writeFileSync(configPath, template)
  console.log(`\nCreated ${configPath}`)
}

async function configTest(): Promise<void> {
  const config = loadConfig({ projectRoot: process.cwd() })
  const results: Record<string, { installed: boolean; auth: string; recovery?: string }> = {}
  let allOk = true

  for (const [name, chConfig] of Object.entries(config.channels)) {
    if (!chConfig.enabled) {
      results[name] = { installed: false, auth: 'disabled' }
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
  const channels = Object.entries(config.channels).map(([name, ch]) => ({
    name,
    enabled: ch.enabled,
    command: ch.command,
    parser: ch.output_parser,
  }))
  console.log(JSON.stringify(channels, null, 2))
}

export const configCommand: CommandModule<object, ConfigArgs> = {
  command: 'config <action>',
  describe: 'Manage mmr configuration',
  builder: (yargs) =>
    yargs.positional('action', {
      type: 'string',
      demandOption: true,
      describe: 'Config action',
      choices: ['init', 'test', 'channels'],
    }),
  handler: async (args: ArgumentsCamelCase<ConfigArgs>) => {
    switch (args.action) {
    case 'init':
      await configInit()
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
