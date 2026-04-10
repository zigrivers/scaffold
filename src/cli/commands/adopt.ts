import type { CommandModule, Argv } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { parseDocument, isMap, isScalar, type Document } from 'yaml'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { getPackagePipelineDir } from '../../utils/fs.js'
import { runAdoption, TYPE_KEY } from '../../project/adopt.js'
import type { AdoptionResult } from '../../project/adopt.js'
import { ProjectTypeSchema } from '../../config/schema.js'
import { coerceCSV } from '../utils/coerce.js'
import {
  LIB_FLAGS, MOBILE_FLAGS, PIPELINE_FLAGS, ML_FLAGS, EXT_FLAGS,
  applyFlagFamilyValidation, buildFlagOverrides,
} from '../init-flag-families.js'
import type { ProjectType } from '../../types/index.js'
import { asScaffoldError } from '../../utils/errors.js'
import { configParseError, configNotObject } from '../../utils/errors.js'
import { ExitCode } from '../../types/enums.js'

interface AdoptArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  'dry-run': boolean
  'project-type'?: string
  // The 32 init flags are dynamic — typed via Record<string, unknown>
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Atomic file write helpers
// ---------------------------------------------------------------------------

function atomicWriteFileSync(target: string, content: string): void {
  const tmpPath = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, target)
}

function writeOrUpdateConfig(
  projectRoot: string,
  result: AdoptionResult,
): void {
  const configPath = path.join(projectRoot, '.scaffold', 'config.yml')

  let doc: Document
  if (!fs.existsSync(configPath)) {
    // Bootstrap minimal config — NO methodology/platforms imposition
    doc = parseDocument(`# scaffold config — created by scaffold adopt
version: 2
project:
`)
  } else {
    const content = fs.readFileSync(configPath, 'utf8')
    doc = parseDocument(content)
    if (doc.errors.length > 0) {
      throw configParseError(configPath, doc.errors[0].message)
    }
    const projectNode = doc.get('project', true)
    if (projectNode !== undefined && !isMap(projectNode)) {
      throw configNotObject(configPath)
    }
  }

  // Ensure project node is a map (YAML `project:` with no value parses as null Scalar)
  const projectNode = doc.get('project', true)
  if (!projectNode || isScalar(projectNode)) {
    doc.set('project', doc.createNode({}))
  }

  // Mutate AST with detected config (TYPE_KEY constant lookup, NOT string transform)
  if (result.projectType && result.detectedConfig) {
    doc.setIn(['project', 'projectType'], result.projectType)
    doc.setIn(['project', TYPE_KEY[result.projectType]], result.detectedConfig.config)

    // Remove stale config blocks from previous project types
    for (const [type, key] of Object.entries(TYPE_KEY)) {
      if (type !== result.projectType && doc.hasIn(['project', key])) {
        doc.deleteIn(['project', key])
      }
    }
  }

  // Ensure .scaffold directory exists
  const scaffoldDir = path.join(projectRoot, '.scaffold')
  if (!fs.existsSync(scaffoldDir)) {
    fs.mkdirSync(scaffoldDir, { recursive: true })
  }

  atomicWriteFileSync(configPath, doc.toString())
}

function writeOrUpdateState(
  projectRoot: string,
  result: AdoptionResult,
  methodology: string,
  metaPromptDir: string,
): void {
  const stateFile = path.join(projectRoot, '.scaffold', 'state.json')

  if (!fs.existsSync(stateFile)) {
    // Initialize state
    const metaPrompts = discoverMetaPrompts(metaPromptDir)
    const allSteps = [...metaPrompts.entries()].map(([slug, mp]) => ({
      slug,
      produces: mp.frontmatter.outputs ?? [],
    }))
    const stateManager = new StateManager(projectRoot, () => [])
    stateManager.initializeState({
      enabledSteps: allSteps,
      scaffoldVersion: '2.0.0',
      methodology,
      initMode: result.mode === 'v1-migration'
        ? 'v1-migration'
        : result.mode === 'brownfield'
          ? 'brownfield'
          : 'greenfield',
    })
  } else {
    // Update existing state — mark stepsCompleted
    const stateManager = new StateManager(projectRoot, () => [])
    const state = stateManager.loadState()
    const now = new Date().toISOString()
    for (const slug of result.stepsCompleted) {
      if (state.steps[slug]) {
        state.steps[slug] = {
          ...state.steps[slug],
          status: 'completed',
          at: now,
          completed_by: 'scaffold-adopt',
        }
      }
    }
    stateManager.saveState(state)
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const adoptCommand: CommandModule<Record<string, unknown>, AdoptArgs> = {
  command: 'adopt',
  describe: 'Adopt an existing project into scaffold',
  builder: (yargs: Argv<Record<string, unknown>>) => {
    return (yargs
      .option('root', { type: 'string', describe: 'Project root directory' })
      .option('dry-run', { type: 'boolean', default: false, describe: 'Preview without writing' })
      .option('force', { type: 'boolean', default: false, describe: 'Force adoption even if state exists' })
      .option('format', { type: 'string', describe: 'Output format' })
      .option('auto', { type: 'boolean', default: false, describe: 'Non-interactive' })
      .option('verbose', { type: 'boolean', default: false, describe: 'Verbose output' })
      // Project type
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
      }) as unknown as Argv<AdoptArgs>)
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
      // Flag family validation
      .check((argv) => applyFlagFamilyValidation(argv as Record<string, unknown>))
      // Help grouping
      .group(['project-type'], 'Configuration:')
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
      .group(['root', 'force', 'auto', 'format', 'verbose', 'dry-run'], 'General:') as unknown as Argv<AdoptArgs>
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())

    if (!projectRoot) {
      const output = createOutputContext('auto')
      output.error({ code: 'PROJECT_NOT_INITIALIZED', message: 'No .scaffold/ directory found', exitCode: 1 })
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // Acquire lock
    const lockResult = acquireLock(projectRoot, 'adopt')
    if (!lockResult.acquired) {
      if (lockResult.error) output.error(lockResult.error)
      process.exit(3)
      return
    }

    try {
      const dryRun = argv['dry-run'] ?? false
      const metaPromptDir = getPackagePipelineDir(projectRoot)
      const methodology = 'deep'

      // JSON mode → auto per spec Section 4 R2-delta-8
      const effectiveAuto = argv.auto === true || outputMode === 'json'

      let adoptResult: AdoptionResult
      try {
        adoptResult = await runAdoption({
          projectRoot,
          metaPromptDir,
          methodology,
          dryRun,
          auto: effectiveAuto,
          force: argv.force === true,
          verbose: argv.verbose === true,
          explicitProjectType: argv['project-type'] as ProjectType | undefined,
          flagOverrides: buildFlagOverrides(argv as Record<string, unknown>),
        })
      } catch (err) {
        output.error(asScaffoldError(err, 'ADOPT_INTERNAL', ExitCode.ValidationError))
        process.exitCode = ExitCode.ValidationError
        return
      }

      // Emit warnings
      for (const w of adoptResult.warnings) {
        output.warn(w)
      }

      // Check for errors
      if (adoptResult.errors.length > 0) {
        for (const e of adoptResult.errors) {
          output.error(e)
        }
        process.exitCode = adoptResult.errors[0].exitCode
        return
      }

      // Writes (config first, state second)
      if (!dryRun && adoptResult.errors.length === 0) {
        // Only write config if there's a detected config to persist
        if (adoptResult.projectType && adoptResult.detectedConfig) {
          try {
            writeOrUpdateConfig(projectRoot, adoptResult)
          } catch (err) {
            output.error(asScaffoldError(err, 'ADOPT_CONFIG_WRITE_FAILED', ExitCode.ValidationError))
            process.exitCode = ExitCode.ValidationError
            return
          }
        }
        try {
          writeOrUpdateState(projectRoot, adoptResult, methodology, metaPromptDir)
        } catch (err) {
          // State write failure is recoverable — emit warning and continue
          output.warn({
            code: 'ADOPT_STATE_WRITE_FAILED',
            message: `state.json write failed (recoverable on next run): ${(err as Error).message}`,
          })
        }
      }

      const resultData = {
        schema_version: 2,
        mode: adoptResult.mode,
        artifacts_found: adoptResult.artifactsFound,
        steps_completed: adoptResult.stepsCompleted,
        steps_remaining: adoptResult.stepsRemaining,
        methodology: adoptResult.methodology,
        dry_run: dryRun,
        ...(adoptResult.projectType && { project_type: adoptResult.projectType }),
        ...(adoptResult.gameConfig && { game_config: adoptResult.gameConfig }),
        ...(adoptResult.detectedConfig && { detected_config: adoptResult.detectedConfig }),
        ...(adoptResult.detectionConfidence && { detection_confidence: adoptResult.detectionConfidence }),
        ...(adoptResult.detectionEvidence && { detection_evidence: adoptResult.detectionEvidence }),
      }

      if (outputMode === 'json') {
        output.result(resultData)
      } else {
        output.success(
          `Adoption complete: ${adoptResult.artifactsFound} artifacts found, ` +
          `${adoptResult.stepsCompleted.length} steps completed`,
        )
      }

      process.exit(0)
    } finally {
      releaseLock(projectRoot)
    }
  },
}

export default adoptCommand
