import type { CommandModule, Argv } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { runWizard } from '../../wizard/wizard.js'
import { runBuild } from './build.js'
import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
import { ProjectTypeSchema } from '../../config/schema.js'

interface InitArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  idea?: string
  methodology?: string
  'project-type'?: string
  depth?: number
  adapters?: string[]
  traits?: string[]
  engine?: string
  multiplayer?: string
  'target-platforms'?: string[]
  'online-services'?: string[]
  'content-structure'?: string
  economy?: string
  narrative?: string
  locales?: string[]
  'npc-ai'?: string
  modding?: boolean
  persistence?: string
  // Web-app flags
  'web-rendering'?: string
  'web-deploy-target'?: string
  'web-realtime'?: string
  'web-auth-flow'?: string
  // Backend flags
  'backend-api-style'?: string
  'backend-data-store'?: string[]
  'backend-auth'?: string
  'backend-messaging'?: string
  'backend-deploy-target'?: string
  // CLI flags
  'cli-interactivity'?: string
  'cli-distribution'?: string[]
  'cli-structured-output'?: boolean
}

const initCommand: CommandModule<Record<string, unknown>, InitArgs> = {
  command: 'init',
  describe: 'Initialize scaffold for this project',
  builder: (yargs: Argv<Record<string, unknown>>) => {
    const coerceCSV = (val: string | string[]) => {
      const items = (Array.isArray(val) ? val : [val])
        .flatMap((v: string) => v.split(',').map((s: string) => s.trim()).filter(Boolean))
      return [...new Set(items)]
    }

    return yargs
      // General options
      .option('root', { type: 'string', describe: 'Project root directory' })
      .option('force', { type: 'boolean', default: false, describe: 'Back up and reinitialize if .scaffold/ exists' })
      .option('auto', { type: 'boolean', default: false, describe: 'Non-interactive mode' })
      .option('idea', { type: 'string', describe: 'One-line project idea for methodology suggestion' })
      .option('format', { type: 'string', describe: 'Output format (json/auto/interactive)' })
      .option('verbose', { type: 'boolean', default: false, describe: 'Verbose output' })
      // Configuration options
      .option('methodology', {
        type: 'string',
        describe: 'Preset methodology (deep/mvp/custom)',
        choices: ['deep', 'mvp', 'custom'] as const,
      })
      .option('depth', {
        type: 'number',
        describe: 'Custom depth level (1-5, requires --methodology custom)',
        choices: [1, 2, 3, 4, 5] as const,
      })
      .option('adapters', {
        type: 'string',
        array: true,
        describe: 'AI adapters (claude-code,codex,gemini)',
        coerce: coerceCSV,
      })
      .option('traits', {
        type: 'string',
        array: true,
        describe: 'Project traits (web,mobile,desktop)',
        coerce: coerceCSV,
      })
      .option('project-type', {
        type: 'string',
        describe: `Project type (${ProjectTypeSchema.options.join('/')})`,
        choices: ProjectTypeSchema.options as unknown as string[],
      })
      // Web-App Configuration
      .option('web-rendering', {
        type: 'string',
        describe: 'Rendering strategy',
        choices: ['spa', 'ssr', 'ssg', 'hybrid'] as const,
      })
      .option('web-deploy-target', {
        type: 'string',
        describe: 'Deploy target',
        choices: ['static', 'serverless', 'container', 'edge', 'long-running'] as const,
      })
      .option('web-realtime', {
        type: 'string',
        describe: 'Real-time strategy',
        choices: ['none', 'websocket', 'sse'] as const,
      })
      .option('web-auth-flow', {
        type: 'string',
        describe: 'Authentication flow',
        choices: ['none', 'session', 'oauth', 'passkey'] as const,
      })
      // Backend Configuration
      .option('backend-api-style', {
        type: 'string',
        describe: 'API style',
        choices: ['rest', 'graphql', 'grpc', 'trpc', 'none'] as const,
      })
      .option('backend-data-store', {
        type: 'string',
        array: true,
        describe: 'Data store(s) (relational,document,key-value)',
        coerce: coerceCSV,
      })
      .option('backend-auth', {
        type: 'string',
        describe: 'API auth mechanism',
        choices: ['none', 'jwt', 'session', 'oauth', 'apikey'] as const,
      })
      .option('backend-messaging', {
        type: 'string',
        describe: 'Async messaging',
        choices: ['none', 'queue', 'event-driven'] as const,
      })
      .option('backend-deploy-target', {
        type: 'string',
        describe: 'Deploy target',
        choices: ['serverless', 'container', 'long-running'] as const,
      })
      // CLI Configuration
      .option('cli-interactivity', {
        type: 'string',
        describe: 'Interactivity model',
        choices: ['args-only', 'interactive', 'hybrid'] as const,
      })
      .option('cli-distribution', {
        type: 'string',
        array: true,
        describe: 'Distribution channels (package-manager,system-package-manager,standalone-binary,container)',
        coerce: coerceCSV,
      })
      .option('cli-structured-output', {
        type: 'boolean',
        describe: 'Support structured output (--json)',
      })
      // Game configuration options
      .option('engine', {
        type: 'string',
        describe: 'Game engine',
        choices: ['unity', 'unreal', 'godot', 'custom'] as const,
      })
      .option('multiplayer', {
        type: 'string',
        describe: 'Multiplayer mode',
        choices: ['none', 'local', 'online', 'hybrid'] as const,
      })
      .option('target-platforms', {
        type: 'string',
        array: true,
        describe: 'Target platforms (pc,web,ios,android,ps5,xbox,switch,vr,ar)',
        coerce: coerceCSV,
      })
      .option('online-services', {
        type: 'string',
        array: true,
        describe: 'Online services (leaderboards,accounts,matchmaking,live-ops)',
        coerce: coerceCSV,
      })
      .option('content-structure', {
        type: 'string',
        describe: 'Content structure',
        choices: ['discrete', 'open-world', 'procedural', 'endless', 'mission-based'] as const,
      })
      .option('economy', {
        type: 'string',
        describe: 'Economy model',
        choices: ['none', 'progression', 'monetized', 'both'] as const,
      })
      .option('narrative', {
        type: 'string',
        describe: 'Narrative depth',
        choices: ['none', 'light', 'heavy'] as const,
      })
      .option('locales', {
        type: 'string',
        array: true,
        describe: 'Supported locales (e.g. en,ja,fr-FR)',
        coerce: coerceCSV,
      })
      .option('npc-ai', {
        type: 'string',
        describe: 'NPC AI complexity',
        choices: ['none', 'simple', 'complex'] as const,
      })
      .option('modding', {
        type: 'boolean',
        describe: 'Enable mod support',
      })
      .option('persistence', {
        type: 'string',
        describe: 'Persistence level',
        choices: ['none', 'settings-only', 'profile', 'progression', 'cloud'] as const,
      })
      // Validation
      .check((argv) => {
        // --depth requires --methodology custom
        if (argv.depth !== undefined && argv.methodology !== 'custom') {
          throw new Error('--depth requires --methodology custom')
        }

        // Game flags auto-set --project-type game; error if explicitly non-game
        const gameFlags = ['engine', 'multiplayer', 'target-platforms', 'online-services',
          'content-structure', 'economy', 'narrative', 'locales', 'npc-ai', 'modding', 'persistence'] as const
        const hasGameFlag = gameFlags.some((f) => argv[f] !== undefined)
        if (hasGameFlag) {
          if (argv['project-type'] !== undefined && argv['project-type'] !== 'game') {
            throw new Error('Game flags (--engine, --multiplayer, etc.) require --project-type game')
          }
        }

        // --online-services requires --multiplayer online|hybrid
        if (argv['online-services'] !== undefined) {
          if (argv.multiplayer !== 'online' && argv.multiplayer !== 'hybrid') {
            throw new Error('--online-services requires --multiplayer online or --multiplayer hybrid')
          }
        }

        // Validate array enum values
        const validAdapters = ['claude-code', 'codex', 'gemini']
        if (argv.adapters) {
          for (const a of argv.adapters as string[]) {
            if (!validAdapters.includes(a)) {
              throw new Error(`Invalid adapter "${a}". Valid: ${validAdapters.join(', ')}`)
            }
          }
        }

        const validTraits = ['web', 'mobile', 'desktop']
        if (argv.traits) {
          for (const t of argv.traits as string[]) {
            if (!validTraits.includes(t)) {
              throw new Error(`Invalid trait "${t}". Valid: ${validTraits.join(', ')}`)
            }
          }
        }

        const validPlatforms = ['pc', 'web', 'ios', 'android', 'ps5', 'xbox', 'switch', 'vr', 'ar']
        if (argv['target-platforms']) {
          for (const p of argv['target-platforms'] as string[]) {
            if (!validPlatforms.includes(p)) {
              throw new Error(`Invalid target platform "${p}". Valid: ${validPlatforms.join(', ')}`)
            }
          }
        }

        const validServices = ['leaderboards', 'accounts', 'matchmaking', 'live-ops']
        if (argv['online-services']) {
          for (const s of argv['online-services'] as string[]) {
            if (!validServices.includes(s)) {
              throw new Error(`Invalid online service "${s}". Valid: ${validServices.join(', ')}`)
            }
          }
        }

        // Validate locale format
        const localeRegex = /^[a-z]{2}(-[A-Z]{2})?$/
        if (argv.locales) {
          for (const l of argv.locales as string[]) {
            if (!localeRegex.test(l)) {
              throw new Error(`Invalid locale "${l}". Must match pattern: en, en-US, ja, fr-FR`)
            }
          }
        }

        return true
      })
      // Help grouping
      .group(['methodology', 'depth', 'adapters', 'traits', 'project-type'], 'Configuration:')
      .group([
        'engine', 'multiplayer', 'target-platforms', 'online-services',
        'content-structure', 'economy', 'narrative', 'locales',
        'npc-ai', 'modding', 'persistence',
      ], 'Game Configuration:')
      .group(['root', 'force', 'auto', 'idea', 'format', 'verbose'], 'General:') as Argv<InitArgs>
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? process.cwd()
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // Game flags auto-set --project-type game
    const gameFlags = ['engine', 'multiplayer', 'target-platforms', 'online-services',
      'content-structure', 'economy', 'narrative', 'locales', 'npc-ai', 'modding', 'persistence'] as const
    const hasGameFlag = gameFlags.some((f) => argv[f] !== undefined)
    const projectType = argv['project-type'] ?? (hasGameFlag ? 'game' : undefined)

    const result = await runWizard({
      projectRoot,
      auto: argv.auto ?? false,
      force: argv.force ?? false,
      methodology: argv.methodology,
      projectType,
      idea: argv.idea,
      output,
      depth: argv.depth,
      adapters: argv.adapters as string[] | undefined,
      traits: argv.traits as string[] | undefined,
      engine: argv.engine,
      multiplayer: argv.multiplayer,
      targetPlatforms: argv['target-platforms'] as string[] | undefined,
      onlineServices: argv['online-services'] as string[] | undefined,
      contentStructure: argv['content-structure'],
      economy: argv.economy,
      narrative: argv.narrative,
      locales: argv.locales as string[] | undefined,
      npcAi: argv['npc-ai'],
      modding: argv.modding,
      persistence: argv.persistence,
    })

    if (!result.success) {
      for (const err of result.errors) {
        output.error(err)
      }
      process.exit(1)
      return
    }

    const buildResult = await runBuild({
      'validate-only': false,
      force: false,
      format: argv.format,
      auto: argv.auto,
      verbose: argv.verbose,
      root: projectRoot,
    }, {
      output,
      suppressFinalResult: outputMode === 'json',
    })

    if (buildResult.exitCode !== 0) {
      process.exit(buildResult.exitCode)
      return
    }

    // Install project-local skills — middleware can't handle this because
    // init is ROOT_OPTIONAL and .scaffold/ doesn't exist when middleware runs
    try {
      syncSkillsIfNeeded(projectRoot)
    } catch {
      // best-effort — don't fail init if skill sync fails
    }

    if (outputMode === 'json') {
      output.result({
        ...result,
        buildResult: buildResult.data ?? null,
      })
    } else {
      output.success(`Scaffold initialized at ${result.configPath}`)
    }

    process.exit(0)
  },
}

export default initCommand
