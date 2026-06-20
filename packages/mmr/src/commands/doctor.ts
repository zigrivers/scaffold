import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../config/loader.js'
import { resolveDisableScope } from '../config/scope.js'
import { setChannelEnabled } from '../config/writer.js'
import { probeChannels, type ChannelHealth } from '../core/channel-health.js'

interface DoctorArgs {
  fix?: boolean
  format?: string
}

const ICON: Record<ChannelHealth['status'], string> = {
  ok: '✓',
  auth_failed: '⚠',
  timeout: '⚠',
  not_installed: '✗',
  missing_command: '✗',
  disabled: '·',
  abstract: '·',
}

function needsAttention(h: ChannelHealth, fixed: boolean): boolean {
  if (h.status === 'auth_failed' || h.status === 'timeout' || h.status === 'missing_command') return true
  if (h.status === 'not_installed') return !fixed
  return false
}

async function runDoctor(args: DoctorArgs): Promise<void> {
  const config = loadConfig({ projectRoot: process.cwd() })
  const health = await probeChannels(config)
  const structural = health.filter((h) => h.status === 'not_installed')
  const willFix = args.fix === true && structural.length > 0

  if (args.format === 'json') {
    console.log(JSON.stringify(health, null, 2))
  } else {
    const ready = health.filter((h) => h.status === 'ok').length
    const attention = health.filter((h) => needsAttention(h, false)).length
    const off = health.filter((h) => h.status === 'disabled' || h.status === 'abstract').length
    console.log(`Channels: ${ready} ready · ${attention} need attention · ${off} off`)
    console.log('')
    for (const h of health) {
      console.log(`  ${ICON[h.status]} ${h.name.padEnd(16)} ${h.status}`)
      if (h.recovery) console.log(`      → ${h.recovery}`)
    }
  }

  const fixedNames = new Set<string>()
  let fixFailures = 0
  if (willFix) {
    // Route each disable to the SAME scope `mmr config disable` would choose,
    // so a project-only / project-overridden channel isn't stubbed globally.
    const scope = resolveDisableScope({ projectRoot: process.cwd() })
    if (args.format !== 'json') console.log('')
    for (const h of structural) {
      const target = scope.forChannel(h.name)
      try {
        fs.mkdirSync(path.dirname(target.file), { recursive: true })
        setChannelEnabled(target.file, h.name, false, { allowSymlink: target.allowSymlink })
        fixedNames.add(h.name)
        if (args.format !== 'json') console.log(`  ✓ disabled ${h.name} in ${target.file}`)
      } catch (err) {
        fixFailures += 1
        console.error(`  ✗ could not disable ${h.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } else if (structural.length > 0 && args.format !== 'json') {
    console.log('')
    console.log('Run `mmr doctor --fix` to disable the not-installed channel(s) above.')
  }

  // Only count a not_installed channel as resolved if its disable actually wrote.
  const remaining = health.filter((h) => {
    if (h.status === 'not_installed') return !fixedNames.has(h.name)
    return needsAttention(h, false)
  }).length
  process.exit(remaining > 0 || fixFailures > 0 ? 1 : 0)
}

export const doctorCommand: CommandModule<object, DoctorArgs> = {
  command: 'doctor',
  describe: 'Diagnose channel health (install + auth) and optionally fix not-installed channels',
  builder: (yargs) =>
    yargs
      .option('fix', {
        type: 'boolean',
        default: false,
        describe: 'Disable not-installed channels (writes ~/.mmr/config.yaml)',
      })
      .option('format', {
        choices: ['text', 'json'],
        default: 'text',
        describe: 'Output format',
      })
      .example('mmr doctor', 'Show channel health and remediation')
      .example('mmr doctor --fix', 'Disable channels whose CLI is not installed'),
  handler: async (args: ArgumentsCamelCase<DoctorArgs>) => {
    await runDoctor(args)
  },
}
