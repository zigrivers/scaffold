import type { CommandModule, Argv } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { runWizard } from '../../wizard/wizard.js'
import { runBuild } from './build.js'
import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
import { ProjectTypeSchema } from '../../config/schema.js'
import { coerceCSV } from '../utils/coerce.js'

const GAME_FLAGS = [
  'engine', 'multiplayer', 'target-platforms', 'online-services',
  'content-structure', 'economy', 'narrative', 'locales',
  'npc-ai', 'modding', 'persistence',
] as const

const WEB_FLAGS = [
  'web-rendering', 'web-deploy-target',
  'web-realtime', 'web-auth-flow',
] as const

const BACKEND_FLAGS = [
  'backend-api-style', 'backend-data-store', 'backend-auth',
  'backend-messaging', 'backend-deploy-target',
] as const

const CLI_TYPE_FLAGS = [
  'cli-interactivity', 'cli-distribution',
  'cli-structured-output',
] as const

const LIB_FLAGS = [
  'lib-visibility', 'lib-runtime-target', 'lib-bundle-format',
  'lib-type-definitions', 'lib-doc-level',
] as const

const MOBILE_FLAGS = ['mobile-platform', 'mobile-distribution', 'mobile-offline', 'mobile-push-notifications'] as const

const PIPELINE_FLAGS = [
  'pipeline-processing', 'pipeline-orchestration',
  'pipeline-quality', 'pipeline-schema', 'pipeline-catalog',
] as const
const ML_FLAGS = ['ml-phase', 'ml-model-type', 'ml-serving', 'ml-experiment-tracking'] as const
const EXT_FLAGS = ['ext-manifest', 'ext-ui-surfaces', 'ext-content-script', 'ext-background-worker'] as const

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
  // Library flags
  'lib-visibility'?: string
  'lib-runtime-target'?: string
  'lib-bundle-format'?: string
  'lib-type-definitions'?: boolean
  'lib-doc-level'?: string
  // Mobile-app flags
  'mobile-platform'?: string
  'mobile-distribution'?: string
  'mobile-offline'?: string
  'mobile-push-notifications'?: boolean
  // Data-pipeline flags
  'pipeline-processing'?: string
  'pipeline-orchestration'?: string
  'pipeline-quality'?: string
  'pipeline-schema'?: string
  'pipeline-catalog'?: boolean
  // ML flags
  'ml-phase'?: string
  'ml-model-type'?: string
  'ml-serving'?: string
  'ml-experiment-tracking'?: boolean
  // Browser-extension flags
  'ext-manifest'?: string
  'ext-ui-surfaces'?: string[]
  'ext-content-script'?: boolean
  'ext-background-worker'?: boolean
}

const initCommand: CommandModule<Record<string, unknown>, InitArgs> = {
  command: 'init',
  describe: 'Initialize scaffold for this project',
  builder: (yargs: Argv<Record<string, unknown>>) => {
    return (yargs
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
      // Library Configuration
      .option('lib-visibility', {
        type: 'string',
        describe: 'Library visibility',
        choices: ['public', 'internal'] as const,
      })
      .option('lib-runtime-target', {
        type: 'string',
        describe: 'Runtime target',
        choices: ['node', 'browser', 'isomorphic', 'edge'] as const,
      })
      .option('lib-bundle-format', {
        type: 'string',
        describe: 'Bundle format',
        choices: ['esm', 'cjs', 'dual', 'unbundled'] as const,
      })
      .option('lib-type-definitions', {
        type: 'boolean',
        describe: 'Ship type definitions',
      })
      .option('lib-doc-level', {
        type: 'string',
        describe: 'Documentation level',
        choices: ['none', 'readme', 'api-docs', 'full-site'] as const,
      })
      // Mobile-App Configuration
      .option('mobile-platform', {
        type: 'string',
        describe: 'Target platform',
        choices: ['ios', 'android', 'cross-platform'] as const,
      })
      .option('mobile-distribution', {
        type: 'string',
        describe: 'Distribution model',
        choices: ['public', 'private', 'mixed'] as const,
      })
      .option('mobile-offline', {
        type: 'string',
        describe: 'Offline support',
        choices: ['none', 'cache', 'offline-first'] as const,
      })
      .option('mobile-push-notifications', {
        type: 'boolean',
        describe: 'Push notification support',
      }) as unknown as Argv<InitArgs>)
      // Data Pipeline Configuration
      .option('pipeline-processing', {
        type: 'string',
        describe: 'Processing model',
        choices: ['batch', 'streaming', 'hybrid'] as const,
      })
      .option('pipeline-orchestration', {
        type: 'string',
        describe: 'Orchestration pattern',
        choices: ['none', 'dag-based', 'event-driven', 'scheduled'] as const,
      })
      .option('pipeline-quality', {
        type: 'string',
        describe: 'Data quality strategy',
        choices: ['none', 'validation', 'testing', 'observability'] as const,
      })
      .option('pipeline-schema', {
        type: 'string',
        describe: 'Schema management',
        choices: ['none', 'schema-registry', 'contracts'] as const,
      })
      .option('pipeline-catalog', {
        type: 'boolean',
        describe: 'Data catalog support',
      })
      // ML Configuration
      .option('ml-phase', {
        type: 'string',
        describe: 'Project phase',
        choices: ['training', 'inference', 'both'] as const,
      })
      .option('ml-model-type', {
        type: 'string',
        describe: 'Model type',
        choices: ['classical', 'deep-learning', 'llm'] as const,
      })
      .option('ml-serving', {
        type: 'string',
        describe: 'Serving pattern',
        choices: ['none', 'batch', 'realtime', 'edge'] as const,
      })
      .option('ml-experiment-tracking', {
        type: 'boolean',
        describe: 'Experiment tracking',
      })
      // Browser Extension Configuration
      .option('ext-manifest', {
        type: 'string',
        describe: 'Manifest version',
        choices: ['2', '3'] as const,
      })
      .option('ext-ui-surfaces', {
        type: 'string',
        array: true,
        describe: 'UI surfaces (popup,options,newtab,devtools,sidepanel)',
        coerce: coerceCSV,
      })
      .option('ext-content-script', {
        type: 'boolean',
        describe: 'Content script support',
      })
      .option('ext-background-worker', {
        type: 'boolean',
        describe: 'Background worker support',
      })
      // Game configuration options
      .option('engine', {
        type: 'string',
        describe: 'Game engine',
        choices: ['unity', 'unreal', 'godot', 'custom'] as const,
        alias: 'game-engine',
      })
      .option('multiplayer', {
        type: 'string',
        describe: 'Multiplayer mode',
        choices: ['none', 'local', 'online', 'hybrid'] as const,
        alias: 'game-multiplayer',
      })
      .option('target-platforms', {
        type: 'string',
        array: true,
        describe: 'Target platforms (pc,web,ios,android,ps5,xbox,switch,vr,ar)',
        coerce: coerceCSV,
        alias: 'game-target-platforms',
      })
      .option('online-services', {
        type: 'string',
        array: true,
        describe: 'Online services (leaderboards,accounts,matchmaking,live-ops)',
        coerce: coerceCSV,
        alias: 'game-online-services',
      })
      .option('content-structure', {
        type: 'string',
        describe: 'Content structure',
        choices: ['discrete', 'open-world', 'procedural', 'endless', 'mission-based'] as const,
        alias: 'game-content-structure',
      })
      .option('economy', {
        type: 'string',
        describe: 'Economy model',
        choices: ['none', 'progression', 'monetized', 'both'] as const,
        alias: 'game-economy',
      })
      .option('narrative', {
        type: 'string',
        describe: 'Narrative depth',
        choices: ['none', 'light', 'heavy'] as const,
        alias: 'game-narrative',
      })
      .option('locales', {
        type: 'string',
        array: true,
        describe: 'Supported locales (e.g. en,ja,fr-FR)',
        coerce: coerceCSV,
        alias: 'game-locales',
      })
      .option('npc-ai', {
        type: 'string',
        describe: 'NPC AI complexity',
        choices: ['none', 'simple', 'complex'] as const,
        alias: 'game-npc-ai',
      })
      .option('modding', {
        type: 'boolean',
        describe: 'Enable mod support',
        alias: 'game-modding',
      })
      .option('persistence', {
        type: 'string',
        describe: 'Persistence level',
        choices: ['none', 'settings-only', 'profile', 'progression', 'cloud'] as const,
        alias: 'game-persistence',
      })
      // Validation
      .check((argv) => {
        // --depth requires --methodology custom
        if (argv.depth !== undefined && argv.methodology !== 'custom') {
          throw new Error('--depth requires --methodology custom')
        }

        // Game flags auto-set --project-type game; error if explicitly non-game
        const hasGameFlag = GAME_FLAGS.some((f) => argv[f] !== undefined)
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

        // New project type flag detection
        const hasWebFlag = WEB_FLAGS.some((f) => argv[f] !== undefined)
        const hasBackendFlag = BACKEND_FLAGS.some(
          (f) => argv[f] !== undefined,
        )
        const hasCliFlag = CLI_TYPE_FLAGS.some(
          (f) => argv[f] !== undefined,
        )
        const hasLibFlag = LIB_FLAGS.some((f) => argv[f] !== undefined)
        const hasMobileFlag = MOBILE_FLAGS.some((f) => argv[f] !== undefined)
        const hasPipelineFlag = PIPELINE_FLAGS.some((f) => argv[f] !== undefined)
        const hasMlFlag = ML_FLAGS.some((f) => argv[f] !== undefined)
        const hasExtFlag = EXT_FLAGS.some((f) => argv[f] !== undefined)

        // Reject mixed-family flags
        const typeCount = [
          hasGameFlag, hasWebFlag, hasBackendFlag,
          hasCliFlag, hasLibFlag, hasMobileFlag,
          hasPipelineFlag, hasMlFlag, hasExtFlag,
        ].filter(Boolean).length
        if (typeCount > 1) {
          throw new Error(
            'Cannot mix flags from multiple project types'
            + ' (--web-*, --backend-*, --cli-*, --lib-*, --mobile-*, --pipeline-*, --ml-*, --ext-*, game flags)',
          )
        }

        // Web flags require web-app project type
        if (hasWebFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'web-app') {
          throw new Error('--web-* flags require --project-type web-app')
        }
        if (hasBackendFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'backend') {
          throw new Error('--backend-* flags require --project-type backend')
        }
        if (hasCliFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'cli') {
          throw new Error('--cli-* flags require --project-type cli')
        }
        if (hasLibFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'library') {
          throw new Error('--lib-* flags require --project-type library')
        }
        if (hasMobileFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'mobile-app') {
          throw new Error('--mobile-* flags require --project-type mobile-app')
        }
        if (hasPipelineFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'data-pipeline') {
          throw new Error('--pipeline-* flags require --project-type data-pipeline')
        }
        if (hasMlFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'ml') {
          throw new Error('--ml-* flags require --project-type ml')
        }
        if (hasExtFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'browser-extension') {
          throw new Error('--ext-* flags require --project-type browser-extension')
        }

        // CSV enum validation for array flags
        const validDataStores = ['relational', 'document', 'key-value']
        if (argv['backend-data-store']) {
          const invalid = (argv['backend-data-store'] as string[]).filter(
            (v: string) => !validDataStores.includes(v),
          )
          if (invalid.length) {
            throw new Error(
              `Invalid --backend-data-store value(s): ${invalid.join(', ')}`,
            )
          }
        }
        if (
          argv['backend-data-store'] &&
          (argv['backend-data-store'] as string[]).length === 0
        ) {
          throw new Error('--backend-data-store requires at least one value')
        }
        const validDistChannels = [
          'package-manager', 'system-package-manager',
          'standalone-binary', 'container',
        ]
        if (argv['cli-distribution']) {
          const invalid = (argv['cli-distribution'] as string[]).filter(
            (v: string) => !validDistChannels.includes(v),
          )
          if (invalid.length) {
            throw new Error(
              `Invalid --cli-distribution value(s): ${invalid.join(', ')}`,
            )
          }
        }
        if (
          argv['cli-distribution'] &&
          (argv['cli-distribution'] as string[]).length === 0
        ) {
          throw new Error('--cli-distribution requires at least one value')
        }
        const validUiSurfaces = ['popup', 'options', 'newtab', 'devtools', 'sidepanel']
        if (argv['ext-ui-surfaces']) {
          const invalid = (argv['ext-ui-surfaces'] as string[]).filter(
            (v: string) => !validUiSurfaces.includes(v),
          )
          if (invalid.length) {
            throw new Error(
              `Invalid --ext-ui-surfaces value(s): ${invalid.join(', ')}`,
            )
          }
        }
        if (
          argv['ext-ui-surfaces'] &&
          (argv['ext-ui-surfaces'] as string[]).length === 0
        ) {
          throw new Error('--ext-ui-surfaces requires at least one value')
        }

        // WebApp cross-field validation
        if (['ssr', 'hybrid'].includes(argv['web-rendering'] as string) && argv['web-deploy-target'] === 'static') {
          throw new Error('SSR/hybrid rendering requires compute, not static hosting')
        }
        if (argv['web-auth-flow'] === 'session' && argv['web-deploy-target'] === 'static') {
          throw new Error('Session auth requires server state, incompatible with static hosting')
        }

        return true
      })
      // Help grouping
      .group(['methodology', 'depth', 'adapters', 'traits', 'project-type'], 'Configuration:')
      .group(['web-rendering', 'web-deploy-target', 'web-realtime', 'web-auth-flow'], 'Web-App Configuration:')
      .group(['backend-api-style', 'backend-data-store', 'backend-auth',
        'backend-messaging', 'backend-deploy-target'], 'Backend Configuration:')
      .group(['cli-interactivity', 'cli-distribution', 'cli-structured-output'], 'CLI Configuration:')
      .group([...LIB_FLAGS], 'Library Configuration:')
      .group([...MOBILE_FLAGS], 'Mobile-App Configuration:')
      .group([...PIPELINE_FLAGS], 'Data Pipeline Configuration:')
      .group([...ML_FLAGS], 'ML Configuration:')
      .group([...EXT_FLAGS], 'Browser Extension Configuration:')
      .group([
        'game-engine', 'game-multiplayer', 'game-target-platforms', 'game-online-services',
        'game-content-structure', 'game-economy', 'game-narrative', 'game-locales',
        'game-npc-ai', 'game-modding', 'game-persistence',
      ], 'Game Configuration:')
      .group(['root', 'force', 'auto', 'idea', 'format', 'verbose'], 'General:') as Argv<InitArgs>
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? process.cwd()
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // Auto-detect project type from flags
    const hasGameFlag = GAME_FLAGS.some((f) => argv[f] !== undefined)
    const hasWebFlag = WEB_FLAGS.some(
      (f) => argv[f] !== undefined,
    )
    const hasBackendFlag = BACKEND_FLAGS.some(
      (f) => argv[f] !== undefined,
    )
    const hasCliTypeFlag = CLI_TYPE_FLAGS.some(
      (f) => argv[f] !== undefined,
    )
    const hasLibFlag = LIB_FLAGS.some((f) => argv[f] !== undefined)
    const hasMobileFlag = MOBILE_FLAGS.some((f) => argv[f] !== undefined)
    const hasPipelineFlag = PIPELINE_FLAGS.some((f) => argv[f] !== undefined)
    const hasMlFlag = ML_FLAGS.some((f) => argv[f] !== undefined)
    const hasExtFlag = EXT_FLAGS.some((f) => argv[f] !== undefined)

    const detectedType = hasGameFlag
      ? 'game'
      : hasWebFlag
        ? 'web-app'
        : hasBackendFlag
          ? 'backend'
          : hasCliTypeFlag
            ? 'cli'
            : hasLibFlag
              ? 'library'
              : hasMobileFlag
                ? 'mobile-app'
                : hasPipelineFlag
                  ? 'data-pipeline'
                  : hasMlFlag
                    ? 'ml'
                    : hasExtFlag
                      ? 'browser-extension'
                      : undefined
    const projectType = argv['project-type'] ?? detectedType

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
      gameFlags: hasGameFlag ? {
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
      } : undefined,
      webAppFlags: hasWebFlag ? {
        webRendering: argv['web-rendering'],
        webDeployTarget: argv['web-deploy-target'],
        webRealtime: argv['web-realtime'],
        webAuthFlow: argv['web-auth-flow'],
      } : undefined,
      backendFlags: hasBackendFlag ? {
        backendApiStyle: argv['backend-api-style'],
        backendDataStore: argv['backend-data-store'],
        backendAuth: argv['backend-auth'],
        backendMessaging: argv['backend-messaging'],
        backendDeployTarget: argv['backend-deploy-target'],
      } : undefined,
      cliFlags: hasCliTypeFlag ? {
        cliInteractivity: argv['cli-interactivity'],
        cliDistribution: argv['cli-distribution'],
        cliStructuredOutput: argv['cli-structured-output'],
      } : undefined,
      libraryFlags: hasLibFlag ? {
        libVisibility: argv['lib-visibility'],
        libRuntimeTarget: argv['lib-runtime-target'],
        libBundleFormat: argv['lib-bundle-format'],
        libTypeDefinitions: argv['lib-type-definitions'],
        libDocLevel: argv['lib-doc-level'],
      } : undefined,
      mobileAppFlags: hasMobileFlag ? {
        mobilePlatform: argv['mobile-platform'],
        mobileDistribution: argv['mobile-distribution'],
        mobileOffline: argv['mobile-offline'],
        mobilePushNotifications: argv['mobile-push-notifications'],
      } : undefined,
      dataPipelineFlags: hasPipelineFlag ? {
        pipelineProcessing: argv['pipeline-processing'],
        pipelineOrchestration: argv['pipeline-orchestration'],
        pipelineQuality: argv['pipeline-quality'],
        pipelineSchema: argv['pipeline-schema'],
        pipelineCatalog: argv['pipeline-catalog'],
      } : undefined,
      mlFlags: hasMlFlag ? {
        mlPhase: argv['ml-phase'],
        mlModelType: argv['ml-model-type'],
        mlServing: argv['ml-serving'],
        mlExperimentTracking: argv['ml-experiment-tracking'],
      } : undefined,
      browserExtensionFlags: hasExtFlag ? {
        extManifest: argv['ext-manifest'],
        extUiSurfaces: argv['ext-ui-surfaces'],
        extContentScript: argv['ext-content-script'],
        extBackgroundWorker: argv['ext-background-worker'],
      } : undefined,
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
