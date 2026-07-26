import type { CommandModule, Argv } from 'yargs'
import { ExitCode } from '../../types/enums.js'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { parse as parseYaml } from 'yaml'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { runWizard, materializeScaffoldProject, readOldStateIfExists } from '../../wizard/wizard.js'
import { AutoFlagRequiredError } from '../../wizard/questions.js'
import { runBuild } from './build.js'
import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
import { shutdown } from '../shutdown.js'
import { ProjectTypeSchema, ConfigSchema } from '../../config/schema.js'
import { coerceCSV } from '../utils/coerce.js'
import {
  InvalidYamlError, InvalidConfigError, FromPathReadError,
  TTYStdinError, isScaffoldUserError, toScaffoldError,
} from '../../utils/user-errors.js'
import {
  GAME_FLAGS, WEB_FLAGS, BACKEND_FLAGS, CLI_TYPE_FLAGS,
  LIB_FLAGS, MOBILE_FLAGS, PIPELINE_FLAGS, ML_FLAGS, EXT_FLAGS,
  RESEARCH_FLAGS, MCP_SERVER_FLAGS, MACOS_NATIVE_FLAGS, applyFlagFamilyValidation,
  autoRequiredSuffix,
} from '../init-flag-families.js'
import type { ScaffoldConfig } from '../../types/index.js'
import { withRecovery } from '../../utils/errors.js'
import type { ScaffoldError } from '../../types/errors.js'
import type {
  GameFlags, WebAppFlags, BackendFlags, CliFlags, LibraryFlags,
  MobileAppFlags, DataPipelineFlags, MlFlags, BrowserExtensionFlags,
  ResearchFlags, McpServerFlags, MacosNativeFlags,
} from '../../wizard/flags.js'

interface InitArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  from?: string
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
  'backend-domain'?: string
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
  // Research flags
  'research-driver'?: string
  'research-interaction'?: string
  'research-domain'?: string
  'research-tracking'?: boolean
  // MCP server flags
  'mcp-language'?: string
  'mcp-transport'?: string
  'mcp-primitives'?: string[]
  'mcp-auth'?: string
  'mcp-deployment'?: string
  'mcp-stateful'?: boolean
  // macOS-native flags
  'macos-ui-framework'?: string
  'macos-app-style'?: string
  'macos-min-version'?: string
  'macos-distribution'?: string
  'macos-sandboxed'?: boolean
  'macos-persistence'?: string
  'macos-auto-update'?: string
}

// ---------------------------------------------------------------------------
// CONFIG_SETTING_FLAGS — every flag that --from is mutually exclusive with
// ---------------------------------------------------------------------------

export const CONFIG_SETTING_FLAGS: readonly string[] = [
  'methodology', 'depth', 'adapters', 'traits', 'project-type', 'idea',
  ...GAME_FLAGS, ...WEB_FLAGS, ...BACKEND_FLAGS, ...CLI_TYPE_FLAGS,
  ...LIB_FLAGS, ...MOBILE_FLAGS, ...PIPELINE_FLAGS, ...ML_FLAGS,
  ...EXT_FLAGS, ...RESEARCH_FLAGS, ...MCP_SERVER_FLAGS, ...MACOS_NATIVE_FLAGS,
]

// ---------------------------------------------------------------------------
// --from helpers
// ---------------------------------------------------------------------------

function readFromPath(pathArg: string): string {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), pathArg), 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? (err as Error).message
    throw new FromPathReadError(pathArg, code)
  }
}

function readStdinOrError(): string {
  if (process.stdin.isTTY) {
    throw new TTYStdinError()
  }
  try {
    return fs.readFileSync(0, 'utf-8')
  } catch (err) {
    throw new FromPathReadError('-', (err as Error).message)
  }
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map(issue => {
    const p = issue.path.join('.') || '(root)'
    return `  ${p}: ${issue.message}`
  }).join('\n')
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

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
      .option('from', {
        type: 'string',
        // Without requiresArg, yargs treats the bare "-" as a positional and
        // .strict() rejects it with "Unknown argument: -", contradicting this
        // very describe string. Verified against yargs 17 both ways.
        requiresArg: true,
        describe: 'Path to a ScaffoldConfig YAML file, or "-" for stdin. Exclusive with config-setting flags.',
      })
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
        describe: 'AI adapters (claude-code,codex)',
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
        describe: `Rendering strategy${autoRequiredSuffix('web-rendering')}`,
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
        describe: `API style${autoRequiredSuffix('backend-api-style')}`,
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
      .option('backend-domain', {
        type: 'string',
        describe: 'Backend domain (none | fintech)',
        choices: ['none', 'fintech'] as const,
      })
      // CLI Configuration
      .option('cli-interactivity', {
        type: 'string',
        describe: `Interactivity model${autoRequiredSuffix('cli-interactivity')}`,
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
        describe: `Library visibility${autoRequiredSuffix('lib-visibility')}`,
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
        describe: `Target platform${autoRequiredSuffix('mobile-platform')}`,
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
        describe: `Processing model${autoRequiredSuffix('pipeline-processing')}`,
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
        describe: `Project phase${autoRequiredSuffix('ml-phase')}`,
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
      // Research Configuration
      .option('research-driver', {
        type: 'string',
        describe: `Experiment driver${autoRequiredSuffix('research-driver')}`,
        choices: ['code-driven', 'config-driven', 'api-driven', 'notebook-driven'] as const,
      })
      .option('research-interaction', {
        type: 'string',
        describe: 'Interaction mode',
        choices: ['autonomous', 'checkpoint-gated', 'human-guided'] as const,
      })
      .option('research-domain', {
        type: 'string',
        describe: 'Research domain',
        choices: ['none', 'quant-finance', 'ml-research', 'simulation'] as const,
      })
      .option('research-tracking', {
        type: 'boolean',
        describe: 'Experiment tracking',
      })
      // MCP Server Configuration
      .option('mcp-language', {
        type: 'string',
        describe: `MCP server language${autoRequiredSuffix('mcp-language')}`,
        choices: ['typescript', 'python'] as const,
      })
      .option('mcp-transport', {
        type: 'string',
        describe: 'MCP transport',
        choices: ['stdio', 'streamable-http', 'sse'] as const,
      })
      .option('mcp-primitives', {
        type: 'string',
        array: true,
        describe: 'MCP primitives exposed (tools,resources,prompts)',
        coerce: coerceCSV,
      })
      .option('mcp-auth', {
        type: 'string',
        describe: 'MCP auth',
        choices: ['none', 'oauth', 'apikey'] as const,
      })
      .option('mcp-deployment', {
        type: 'string',
        describe: 'MCP deployment',
        choices: ['local', 'hosted'] as const,
      })
      .option('mcp-stateful', {
        type: 'boolean',
        describe: 'MCP server persists state',
      })
      // macOS-Native Configuration
      .option('macos-ui-framework', {
        type: 'string',
        describe: 'UI framework',
        choices: ['swiftui', 'appkit', 'hybrid'] as const,
      })
      .option('macos-app-style', {
        type: 'string',
        describe: 'App style',
        choices: ['standard', 'menu-bar', 'agent'] as const,
      })
      .option('macos-min-version', { type: 'string', describe: 'Minimum macOS version (e.g. 15.0)' })
      .option('macos-distribution', {
        type: 'string',
        describe: 'Distribution',
        choices: ['developer-id', 'mac-app-store', 'both'] as const,
      })
      .option('macos-sandboxed', { type: 'boolean', describe: 'Enable App Sandbox' })
      .option('macos-persistence', {
        type: 'string',
        describe: 'Local persistence',
        choices: ['none', 'sqlite', 'core-data', 'swiftdata'] as const,
      })
      .option('macos-auto-update', {
        type: 'string',
        describe: 'Auto-update mechanism',
        choices: ['none', 'sparkle'] as const,
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
        // --from is exclusive with all config-setting flags
        if (argv.from !== undefined) {
          const conflicts = CONFIG_SETTING_FLAGS.filter(
            f => (argv as Record<string, unknown>)[f] !== undefined,
          )
          if (conflicts.length > 0) {
            const summary = conflicts.map(f => '--' + f).join(', ')
            throw new Error(`--from cannot be combined with: ${summary}. Edit services.yml and re-run.`)
          }
          return true  // skip all other validation when --from is set
        }

        // --depth requires --methodology custom (init-only)
        if (argv.depth !== undefined && argv.methodology !== 'custom') {
          throw new Error('--depth requires --methodology custom')
        }

        // Validate array enum values (init-only). Gemini was dropped (its CLI
        // is sunset) — accept it as a legacy no-op so old scripts don't break,
        // but warn; it is stripped from the platform list downstream.
        const validAdapters = ['claude-code', 'codex']
        if (argv.adapters) {
          for (const a of argv.adapters as string[]) {
            if (a === 'gemini') {
              console.error('[scaffold] warning: the "gemini" adapter was removed (CLI sunset) — ignoring it.')
              continue
            }
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
        'backend-messaging', 'backend-deploy-target', 'backend-domain'], 'Backend Configuration:')
      .group(['cli-interactivity', 'cli-distribution', 'cli-structured-output'], 'CLI Configuration:')
      .group([...LIB_FLAGS], 'Library Configuration:')
      .group([...MOBILE_FLAGS], 'Mobile-App Configuration:')
      .group([...PIPELINE_FLAGS], 'Data Pipeline Configuration:')
      .group([...ML_FLAGS], 'ML Configuration:')
      .group([...EXT_FLAGS], 'Browser Extension Configuration:')
      .group([...RESEARCH_FLAGS], 'Research Configuration:')
      .group([...MCP_SERVER_FLAGS], 'MCP Server Configuration:')
      .group([...MACOS_NATIVE_FLAGS], 'macOS-Native Configuration:')
      .group([
        'game-engine', 'game-multiplayer', 'game-target-platforms', 'game-online-services',
        'game-content-structure', 'game-economy', 'game-narrative', 'game-locales',
        'game-npc-ai', 'game-modding', 'game-persistence',
      ], 'Game Configuration:')
      .group(['root', 'force', 'auto', 'from', 'idea', 'format', 'verbose'], 'General:') as Argv<InitArgs>
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? process.cwd()
    const outputMode = resolveOutputMode(argv)
    // Any non-interactive mode implies auto. A context that cannot ask a
    // question must not invent the answer, so the discriminator guards have to
    // see `auto` even when the caller never typed --auto. adopt.ts already
    // derived this (effectiveAuto); init read the raw flag, which is why a
    // piped `init --project-type web-app` silently wrote renderingStrategy:
    // spa while `--auto` on the same input refused.
    const effectiveAuto = argv.auto === true || outputMode !== 'interactive'
    const output = createOutputContext(outputMode)

    // Track whether Phase 1 succeeded so we know to run Phase 2
    let phase1Success = false
    // Wizard result — populated by the wizard path, undefined for --from path
    let result: Awaited<ReturnType<typeof runWizard>> | undefined
    // The --from path produces no WizardResult, but --format json still
    // owes the caller a parseable result. Captured here so the emit site
    // below can synthesize one instead of falling through to a
    // stderr-only success message.
    let fromConfig: ScaffoldConfig | undefined

    try {
      // Phase 1: collect or parse config (Ctrl-C → clean exit, no changes)
      await shutdown.withContext('Cancelled. No changes were made.', async () => {
        if (argv.from !== undefined) {
          // --from declarative path: read YAML, validate, materialize
          const sourceLabel = argv.from === '-' ? '<stdin>' : argv.from
          const raw = argv.from === '-' ? readStdinOrError() : readFromPath(argv.from)
          let parsedYaml: unknown
          try {
            parsedYaml = parseYaml(raw)
          } catch (err) {
            throw new InvalidYamlError(sourceLabel, (err as Error).message)
          }
          const parseResult = ConfigSchema.safeParse(parsedYaml)
          if (!parseResult.success) {
            throw new InvalidConfigError(sourceLabel, formatZodError(parseResult.error))
          }
          const config = parseResult.data as unknown as ScaffoldConfig
          // Task 7's guard lives in askWizardQuestions, which --from never
          // calls: this path parses YAML and materializes it directly. Without
          // this check a schema-valid config could still write the typeless
          // project the wizard now refuses to produce, on the one path the
          // wizard cannot see.
          // Multi-service configs are exempt: ServiceSchema requires a
          // projectType on EVERY service (config/schema.ts), so the type is
          // declared per service rather than at project.projectType. Requiring
          // it at the top level would reject every valid services[] config.
          const hasServices = (config.project?.services?.length ?? 0) > 0
          if (!hasServices && config.project?.projectType === undefined) {
            throw new AutoFlagRequiredError({
              code: 'INIT_PROJECT_TYPE_REQUIRED',
              message: `${sourceLabel} does not set project.projectType`,
              exitCode: ExitCode.ValidationError,
              recovery: `Add "project: { projectType: <${ProjectTypeSchema.options.join('|')}> }" `
                + 'to the config, since a config with no project type disables every '
                + 'type-conditional step',
            })
          }
          fromConfig = config
          const oldState = readOldStateIfExists(projectRoot)
          await materializeScaffoldProject(config, {
            projectRoot, force: argv.force ?? false, oldState, output,
          })
          phase1Success = true
        } else {
          // Interactive wizard path
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
          const hasResearchFlag = RESEARCH_FLAGS.some((f) => argv[f] !== undefined)
          const hasMcpServerFlag = MCP_SERVER_FLAGS.some((f) => argv[f] !== undefined)
          const hasMacosNativeFlag = MACOS_NATIVE_FLAGS.some((f) => argv[f] !== undefined)

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
                            : hasResearchFlag
                              ? 'research'
                              : hasMcpServerFlag
                                ? 'mcp-server'
                                : hasMacosNativeFlag
                                  ? 'macos-native'
                                  : undefined
          const projectType = argv['project-type'] ?? detectedType

          result = await shutdown.withPrompt(async () => runWizard({
            projectRoot,
            auto: effectiveAuto,
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
              backendDomain: argv['backend-domain'] as BackendFlags['backendDomain'],
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
            researchFlags: hasResearchFlag ? {
              researchDriver: argv['research-driver'] as ResearchFlags['researchDriver'],
              researchInteraction: argv['research-interaction'] as ResearchFlags['researchInteraction'],
              researchDomain: argv['research-domain'] as ResearchFlags['researchDomain'],
              researchTracking: argv['research-tracking'],
            } : undefined,
            mcpServerFlags: hasMcpServerFlag ? {
              mcpLanguage: argv['mcp-language'] as McpServerFlags['mcpLanguage'],
              mcpTransport: argv['mcp-transport'] as McpServerFlags['mcpTransport'],
              mcpPrimitives: argv['mcp-primitives'] as McpServerFlags['mcpPrimitives'],
              mcpAuth: argv['mcp-auth'] as McpServerFlags['mcpAuth'],
              mcpDeployment: argv['mcp-deployment'] as McpServerFlags['mcpDeployment'],
              mcpStateful: argv['mcp-stateful'] as McpServerFlags['mcpStateful'],
            } : undefined,
            macosNativeFlags: hasMacosNativeFlag ? {
              macosUiFramework: argv['macos-ui-framework'] as MacosNativeFlags['macosUiFramework'],
              macosAppStyle: argv['macos-app-style'] as MacosNativeFlags['macosAppStyle'],
              macosMinVersion: argv['macos-min-version'] as MacosNativeFlags['macosMinVersion'],
              macosDistribution: argv['macos-distribution'] as MacosNativeFlags['macosDistribution'],
              macosSandboxed: argv['macos-sandboxed'],
              macosPersistence: argv['macos-persistence'] as MacosNativeFlags['macosPersistence'],
              macosAutoUpdate: argv['macos-auto-update'] as MacosNativeFlags['macosAutoUpdate'],
            } : undefined,
          }))

          if (!result!.success) {
            // Honour the exit code the error carries. Hardcoding 1 here was the
            // original defect: ScaffoldError.exitCode has always existed and
            // runWizard has always populated it, but this site discarded it.
            // withRecovery, not object spread: Error.prototype.message is
            // non-enumerable, so `{ ...e }` would ship message: undefined for
            // any Error-shaped error. adopt.ts hit this exact bug.
            output.fail(result!.errors.map(e => withRecovery(
              e, 'See the message above and re-run with corrected input')))
            process.exitCode = result!.errors[0]?.exitCode ?? ExitCode.ValidationError
            return
          }
          phase1Success = true
        }
      })

      // Phase 2: build + skill sync (Ctrl-C → partial output warning)
      if (!phase1Success) return

      await shutdown.withContext(
        'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
        async () => {
          const buildResult = await runBuild({
            'validate-only': false,
            force: false,
            format: argv.format,
            auto: effectiveAuto,
            verbose: argv.verbose,
            root: projectRoot,
          }, {
            output,
            suppressFinalResult: outputMode === 'json',
          })

          if (buildResult.exitCode !== 0) {
            process.exitCode = buildResult.exitCode
            return
          }

          // Install project-local skills — middleware can't handle this because
          // init is ROOT_OPTIONAL and .scaffold/ doesn't exist when middleware runs
          try {
            syncSkillsIfNeeded(projectRoot)
          } catch {
            // best-effort — don't fail init if skill sync fails
          }

          const emitted = result ?? {
            success: true as const,
            projectRoot,
            configPath: path.join(projectRoot, '.scaffold', 'config.yml'),
            methodology: fromConfig?.methodology ?? 'unknown',
            errors: [],
          }
          if (outputMode === 'json') {
            output.result({
              ...emitted,
              buildResult: buildResult.data ?? null,
            })
          } else {
            output.success(`Scaffold initialized at ${emitted.configPath}`)
          }
        },
      )
    } catch (err) {
      // Errors already carrying a ScaffoldError (AutoFlagRequiredError from the
      // wizard, and anything later adopting the same shape) are forwarded as
      // they are. Structural check rather than `instanceof`, so this does not
      // depend on class identity across module boundaries.
      const carried = (err as { scaffoldError?: ScaffoldError } | null)?.scaffoldError
      if (carried) {
        output.fail([withRecovery(carried, 'See the message above and re-run with corrected input')])
        process.exitCode = carried.exitCode
        return
      }
      if (isScaffoldUserError(err)) {
        // Was: output.error(err.message) + exit 2. That printed an uncoded
        // message to stderr with empty stdout under --format json, and exit 2
        // means MissingDependency — the wrong code for bad input.
        const scaffoldError = toScaffoldError(err)
        output.fail([scaffoldError])
        process.exitCode = scaffoldError.exitCode
        return
      }
      throw err
    }
  },
}

export default initCommand
