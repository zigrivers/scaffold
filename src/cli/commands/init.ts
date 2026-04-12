import type { CommandModule, Argv } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { runWizard } from '../../wizard/wizard.js'
import { runBuild } from './build.js'
import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
import { shutdown } from '../shutdown.js'
import { ProjectTypeSchema } from '../../config/schema.js'
import { coerceCSV } from '../utils/coerce.js'
import {
  GAME_FLAGS, WEB_FLAGS, BACKEND_FLAGS, CLI_TYPE_FLAGS,
  LIB_FLAGS, MOBILE_FLAGS, PIPELINE_FLAGS, ML_FLAGS, EXT_FLAGS,
  applyFlagFamilyValidation,
} from '../init-flag-families.js'
import type {
  GameFlags, WebAppFlags, BackendFlags, CliFlags, LibraryFlags,
  MobileAppFlags, DataPipelineFlags, MlFlags, BrowserExtensionFlags,
} from '../../wizard/flags.js'

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
        // --depth requires --methodology custom (init-only)
        if (argv.depth !== undefined && argv.methodology !== 'custom') {
          throw new Error('--depth requires --methodology custom')
        }

        // Validate array enum values (init-only)
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

        return applyFlagFamilyValidation(argv as Record<string, unknown>)
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

    let result: Awaited<ReturnType<typeof runWizard>>

    await shutdown.withContext('Cancelled. No changes were made.', async () => {
      result = await shutdown.withPrompt(async () => runWizard({
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
        // yargs `choices:` validates these at runtime, so the narrow casts at
        // this CLI boundary are safe. See src/wizard/flags.ts for rationale.
        gameFlags: hasGameFlag ? {
          engine: argv.engine as GameFlags['engine'],
          multiplayer: argv.multiplayer as GameFlags['multiplayer'],
          targetPlatforms: argv['target-platforms'] as GameFlags['targetPlatforms'],
          onlineServices: argv['online-services'] as GameFlags['onlineServices'],
          contentStructure: argv['content-structure'] as GameFlags['contentStructure'],
          economy: argv.economy as GameFlags['economy'],
          narrative: argv.narrative as GameFlags['narrative'],
          locales: argv.locales as GameFlags['locales'],
          npcAi: argv['npc-ai'] as GameFlags['npcAi'],
          modding: argv.modding,
          persistence: argv.persistence as GameFlags['persistence'],
        } : undefined,
        webAppFlags: hasWebFlag ? {
          webRendering: argv['web-rendering'] as WebAppFlags['webRendering'],
          webDeployTarget: argv['web-deploy-target'] as WebAppFlags['webDeployTarget'],
          webRealtime: argv['web-realtime'] as WebAppFlags['webRealtime'],
          webAuthFlow: argv['web-auth-flow'] as WebAppFlags['webAuthFlow'],
        } : undefined,
        backendFlags: hasBackendFlag ? {
          backendApiStyle: argv['backend-api-style'] as BackendFlags['backendApiStyle'],
          backendDataStore: argv['backend-data-store'] as BackendFlags['backendDataStore'],
          backendAuth: argv['backend-auth'] as BackendFlags['backendAuth'],
          backendMessaging: argv['backend-messaging'] as BackendFlags['backendMessaging'],
          backendDeployTarget: argv['backend-deploy-target'] as BackendFlags['backendDeployTarget'],
        } : undefined,
        cliFlags: hasCliTypeFlag ? {
          cliInteractivity: argv['cli-interactivity'] as CliFlags['cliInteractivity'],
          cliDistribution: argv['cli-distribution'] as CliFlags['cliDistribution'],
          cliStructuredOutput: argv['cli-structured-output'],
        } : undefined,
        libraryFlags: hasLibFlag ? {
          libVisibility: argv['lib-visibility'] as LibraryFlags['libVisibility'],
          libRuntimeTarget: argv['lib-runtime-target'] as LibraryFlags['libRuntimeTarget'],
          libBundleFormat: argv['lib-bundle-format'] as LibraryFlags['libBundleFormat'],
          libTypeDefinitions: argv['lib-type-definitions'],
          libDocLevel: argv['lib-doc-level'] as LibraryFlags['libDocLevel'],
        } : undefined,
        mobileAppFlags: hasMobileFlag ? {
          mobilePlatform: argv['mobile-platform'] as MobileAppFlags['mobilePlatform'],
          mobileDistribution: argv['mobile-distribution'] as MobileAppFlags['mobileDistribution'],
          mobileOffline: argv['mobile-offline'] as MobileAppFlags['mobileOffline'],
          mobilePushNotifications: argv['mobile-push-notifications'],
        } : undefined,
        dataPipelineFlags: hasPipelineFlag ? {
          pipelineProcessing: argv['pipeline-processing'] as DataPipelineFlags['pipelineProcessing'],
          pipelineOrchestration: argv['pipeline-orchestration'] as DataPipelineFlags['pipelineOrchestration'],
          pipelineQuality: argv['pipeline-quality'] as DataPipelineFlags['pipelineQuality'],
          pipelineSchema: argv['pipeline-schema'] as DataPipelineFlags['pipelineSchema'],
          pipelineCatalog: argv['pipeline-catalog'],
        } : undefined,
        mlFlags: hasMlFlag ? {
          mlPhase: argv['ml-phase'] as MlFlags['mlPhase'],
          mlModelType: argv['ml-model-type'] as MlFlags['mlModelType'],
          mlServing: argv['ml-serving'] as MlFlags['mlServing'],
          mlExperimentTracking: argv['ml-experiment-tracking'],
        } : undefined,
        browserExtensionFlags: hasExtFlag ? {
          extManifest: argv['ext-manifest'] as BrowserExtensionFlags['extManifest'],
          extUiSurfaces: argv['ext-ui-surfaces'] as BrowserExtensionFlags['extUiSurfaces'],
          extContentScript: argv['ext-content-script'],
          extBackgroundWorker: argv['ext-background-worker'],
        } : undefined,
      }))

      if (!result.success) {
        for (const err of result.errors) {
          output.error(err)
        }
        process.exit(1)
        return
      }

      await shutdown.withContext(
        'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
        async () => {
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
      )
    })
  },
}

export default initCommand
