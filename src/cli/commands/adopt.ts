import type { CommandModule, Argv } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { parseDocument, isMap, isScalar, type Document } from 'yaml'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { getPackagePipelineDir } from '../../utils/fs.js'
import { runAdoption, TYPE_KEY } from '../../project/adopt.js'
import type { AdoptionResult } from '../../project/adopt.js'
import { buildAdoptionPlan, renderPlanMarkdown, extractPlanKey } from '../../project/adoption-plan.js'
import { applyAdoptionPlan } from '../../project/adoption-apply.js'
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { shutdown } from '../shutdown.js'
import { readPackageVersion } from './version.js'
import { ProjectTypeSchema } from '../../config/schema.js'
import { coerceCSV } from '../utils/coerce.js'
import {
  LIB_FLAGS, MOBILE_FLAGS, PIPELINE_FLAGS, ML_FLAGS, EXT_FLAGS,
  RESEARCH_FLAGS, MCP_SERVER_FLAGS, MACOS_NATIVE_FLAGS, applyFlagFamilyValidation, buildFlagOverrides,
} from '../init-flag-families.js'
import type { ProjectType } from '../../types/index.js'
import { asScaffoldError } from '../../utils/errors.js'
import { configParseError, configNotObject } from '../../utils/errors.js'
import { ExitCode } from '../../types/enums.js'
import type { ScaffoldError, TerminalError } from '../../types/errors.js'

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

// Retained for the config-write integration tests; the apply path writes config via
// writeInitializeConfig (adoption-apply.ts). Slated for removal in R2.
export function writeOrUpdateConfig(
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
    if (projectNode !== undefined && !isMap(projectNode) && !isScalar(projectNode)) {
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

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * Pick a fallback recovery that fits the error, for the catch-all sites that
 * map over a whole error array.
 *
 * A blanket "re-run with --project-type" would be stapled onto config-parse
 * and filesystem failures too, pointing the reader at an unrelated flag. Only
 * the detection-family codes get that hint; everything else gets a truthful
 * generic one.
 */
function genericRecovery(e: ScaffoldError): string {
  if (e.code.startsWith('ADOPT_AMBIGUOUS') || e.code.includes('PROJECT_TYPE')) {
    return 'Re-run with --project-type <type> to choose explicitly'
  }
  return 'See the message above; re-run with --verbose for more detail'
}

/**
 * Widen a ScaffoldError into a TerminalError, supplying a fallback recovery.
 *
 * fail() takes TerminalError so every process-ending failure names its fix.
 * Errors built elsewhere (asScaffoldError, adoptResult.errors, lock errors)
 * carry an optional recovery, so this fills the gap without overwriting one
 * that was already set.
 */
function withRecovery(e: ScaffoldError, fallback: string): TerminalError {
  return { ...e, recovery: e.recovery ?? fallback }
}

const adoptCommand: CommandModule<Record<string, unknown>, AdoptArgs> = {
  command: 'adopt',
  describe: 'Adopt an existing project into scaffold',
  builder: (yargs: Argv<Record<string, unknown>>) => {
    return (yargs
      .option('root', { type: 'string', describe: 'Project root directory' })
      .option('dry-run', {
        type: 'boolean',
        default: false,
        describe: 'Deprecated: plan mode is the default and writes nothing',
      })
      .option('force', { type: 'boolean', default: false, describe: 'Force adoption even if state exists' })
      .option('format', { type: 'string', describe: 'Output format' })
      .option('auto', { type: 'boolean', default: false, describe: 'Non-interactive' })
      .option('verbose', { type: 'boolean', default: false, describe: 'Verbose output' })
      .option('write', {
        type: 'string',
        describe: 'Write the rendered plan document (default path docs/adoption-plan.md)',
      })
      .option('include', {
        type: 'string',
        array: true,
        describe: 'Opt a preset-disabled step into the plan (CSV or repeatable); applied before resolution',
        coerce: coerceCSV,
      })
      .option('apply', {
        type: 'boolean',
        default: false,
        describe: 'Execute the approved plan (writes config/state; pass --plan or --plan-key)',
      })
      .option('plan', {
        type: 'string',
        describe: 'Path to the approved plan document (drift-checked via its embedded plan key)',
      })
      .option('plan-key', {
        type: 'string',
        describe: 'Approved plan key (sha256) to drift-check against',
      })
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
      .option('backend-domain', {
        type: 'string',
        describe: 'Backend domain (none | fintech)',
        choices: ['none', 'fintech'] as const,
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
      // Research Configuration
      .option('research-driver', {
        type: 'string',
        describe: 'Experiment driver',
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
        describe: 'MCP server language',
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
      // Flag family validation
      .check((argv) => applyFlagFamilyValidation(argv as Record<string, unknown>))
      // Help grouping
      .group(['project-type'], 'Configuration:')
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
      .group(
        ['root', 'force', 'auto', 'format', 'verbose', 'dry-run', 'write', 'include', 'apply', 'plan', 'plan-key'],
        'General:',
      ) as unknown as Argv<AdoptArgs>
  },
  handler: async (argv) => {
    // D2: adopt is first-touch — with no .scaffold/ anywhere, the current
    // directory is the project root (plan mode is read-only; --apply performs init).
    const projectRoot = (argv.root as string | undefined) ?? findProjectRoot(process.cwd()) ?? process.cwd()

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const dryRun = argv['dry-run'] ?? false
    const metaPromptDir = getPackagePipelineDir(projectRoot)
    // greenfield fallback — runAdoption returns 'brownfield' for brownfield/v1-migration repos (D11 R1)
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
      // asScaffoldError returns an already-formed ScaffoldError untouched
      // (utils/errors.ts:363-368), so it can carry a non-validation exitCode.
      // Bind it and read the code FROM it: hardcoding a constant here would
      // make the envelope's exit_code disagree with the process status.
      const terminal = withRecovery(
        asScaffoldError(err, 'ADOPT_INTERNAL', ExitCode.ValidationError),
        'Re-run with --verbose for detail; if it persists, this is a bug worth reporting',
      )
      output.fail([terminal])
      process.exitCode = terminal.exitCode
      return
    }

    // Emit warnings
    for (const w of adoptResult.warnings) {
      output.warn(w)
    }

    // Check for errors
    if (adoptResult.errors.length > 0) {
      output.fail(adoptResult.errors.map(e => withRecovery(e, genericRecovery(e))))
      process.exitCode = adoptResult.errors[0].exitCode
      return
    }

    // D1: plan mode — render, never write.
    const includes = (argv.include as string[] | undefined) ?? []
    const { plan, errors: planErrors } = buildAdoptionPlan({ projectRoot, adoptResult, includes })
    if (planErrors.length > 0) {
      output.fail(planErrors.map(e => withRecovery(e, genericRecovery(e))))
      process.exitCode = planErrors[0].exitCode
      return
    }

    if (argv.apply === true) {
      // Resolve the approved key from the plan artifact. Reading the approved
      // doc is safe pre-lock; the authoritative render + key COMPARE happen
      // under the lock below.
      let approvedKey: string | null = (argv['plan-key'] as string | undefined) ?? null
      if (approvedKey === null && typeof argv.plan === 'string') {
        const planPath = path.isAbsolute(argv.plan) ? argv.plan : path.join(projectRoot, argv.plan)
        if (!fs.existsSync(planPath)) {
          output.fail([{
            code: 'ADOPT_PLAN_NOT_FOUND',
            message: `Plan file not found: ${planPath}`,
            exitCode: ExitCode.ValidationError,
            recovery: 'Render one first with `scaffold adopt --write`, then pass its path to --plan',
          }])
          process.exitCode = ExitCode.ValidationError
          return
        }
        approvedKey = extractPlanKey(fs.readFileSync(planPath, 'utf8'))
        if (approvedKey === null) {
          output.fail([{
            code: 'ADOPT_PLAN_KEY_MISSING',
            message: `No plan key found in ${planPath} — re-render with \`scaffold adopt --write\``,
            exitCode: ExitCode.ValidationError,
            recovery: 'Re-render with `scaffold adopt --write`, then re-run --apply with the new plan',
          }])
          process.exitCode = ExitCode.ValidationError
          return
        }
      }
      // D1: a bare --apply is interactive-only — automation must pass the key
      // it approved. Fail fast BEFORE taking the lock so a non-interactive
      // bare apply never acquires (and immediately releases) it.
      // NOTE: `effectiveAuto` already folds in `outputMode === 'json'` (line
      // ~509), so re-checking it here would be dead code — TS's aliased-
      // condition narrowing catches this (TS2367) if left in.
      if (approvedKey === null && (effectiveAuto || !output.supportsInteractivePrompts())) {
        output.fail([{
          code: 'ADOPT_APPLY_NON_INTERACTIVE',
          message: 'Bare --apply is interactive-only. In automation, pass the approved plan: '
            + '--plan <path> or --plan-key <sha256>.',
          exitCode: ExitCode.ValidationError,
          recovery: 'Render a plan with `scaffold adopt --format json`, then pass its plan_key to --plan-key',
        }])
        process.exitCode = ExitCode.ValidationError
        return
      }

      // Take the lock BEFORE the final detection + render + key compare so no
      // writer can change config/state between the compare and the writes
      // (TOCTOU). The SAME lock is held through every write below.
      const lockResult = acquireLock(projectRoot, 'adopt')
      if (!lockResult.acquired) {
        // Always emit. Without the else branch this path exited non-zero with
        // empty stdout whenever lockResult carried no error object — the exact
        // silent-failure shape this release exists to remove.
        output.fail([lockResult.error
          ? withRecovery(
            lockResult.error,
            'Another scaffold process holds the lock; wait for it, or pass --force to override',
          )
          : {
            code: 'ADOPT_LOCK_UNAVAILABLE',
            message: 'Could not acquire the adopt lock.',
            exitCode: ExitCode.StateCorruption,
            recovery: 'Another scaffold process may hold it; wait and retry, or pass --force',
          }], ExitCode.StateCorruption)
        process.exitCode = ExitCode.StateCorruption
        return
      }
      shutdown.registerLockOwnership(getLockPath(projectRoot))
      await shutdown.withResource('lock', () => {
        releaseLock(projectRoot)
        shutdown.releaseLockOwnership()
      }, async () => {
        // Authoritative re-render UNDER the lock: re-run adoption detection
        // and rebuild the plan against live reality. The plan built outside
        // the lock (plan mode) is intentionally discarded here.
        let liveAdopt: AdoptionResult
        try {
          liveAdopt = await runAdoption({
            projectRoot, metaPromptDir, methodology, dryRun,
            auto: true, force: argv.force === true, verbose: argv.verbose === true,
            explicitProjectType: argv['project-type'] as ProjectType | undefined,
            flagOverrides: buildFlagOverrides(argv as Record<string, unknown>),
          })
        } catch (err) {
          const terminal = withRecovery(
            asScaffoldError(err, 'ADOPT_INTERNAL', ExitCode.ValidationError),
            'Re-run with --verbose for detail; if it persists, this is a bug worth reporting',
          )
          output.fail([terminal])
          process.exitCode = terminal.exitCode
          return
        }
        const { plan: livePlan, errors: liveErrors } = buildAdoptionPlan({
          projectRoot, adoptResult: liveAdopt, includes,
        })
        if (liveErrors.length > 0) {
          output.fail(liveErrors.map(e => withRecovery(e, genericRecovery(e))))
          process.exitCode = liveErrors[0].exitCode
          return
        }

        if (approvedKey === null) {
          // Bare --apply — interactive confirmation against the live render.
          for (const line of renderPlanMarkdown(livePlan).split('\n')) output.info(line)
          const typed = await output.prompt<string>(
            `Type "apply" to execute plan ${livePlan.plan_key.slice(0, 12)}… (anything else aborts)`, '',
          )
          if (typed !== 'apply') {
            output.info('Aborted — nothing was written.')
            process.exitCode = 0
            return
          }
        } else if (approvedKey !== livePlan.plan_key) {
          // D1 drift contract: the under-lock re-render IS the pre-write check.
          output.fail([{
            code: 'ADOPT_PLAN_DRIFT',
            message: `Plan key mismatch: approved ${approvedKey.slice(0, 12)}… but the live re-render `
              + `produced ${livePlan.plan_key.slice(0, 12)}… — `
              + 'reality changed since approval (a disposition, detect result, include, or the initialize payload). '
              + 'Re-review: `scaffold adopt --write`, then re-run --apply against the new plan.',
            exitCode: ExitCode.ValidationError,
            recovery: 'Re-render with `scaffold adopt --write`, then re-run --apply against the new plan key',
          }])
          process.exitCode = ExitCode.ValidationError
          return
        }

        const applyResult = await applyAdoptionPlan({
          projectRoot, plan: livePlan, scaffoldVersion: readPackageVersion(),
        })
        // D10a: a mapped step whose detect: contract still didn't pass after
        // the mapping was written stays honestly pending — surface why rather
        // than silently dropping the outcome.
        for (const w of applyResult.warnings) output.warn(w)
        if (outputMode === 'json') {
          output.result({
            schema_version: 3,
            applied: true,
            plan_key: livePlan.plan_key,
            initialized: applyResult.initialized,
            marked_completed: applyResult.marked_completed,
            reopened: applyResult.reopened,
            recorded_pending: applyResult.recorded_pending,
            audit_records: applyResult.audit_records,
            doctor: { verdict: applyResult.doctor.verdict, exit_code: applyResult.doctor.exitCode },
          })
        } else {
          output.success(
            `Applied plan ${livePlan.plan_key.slice(0, 12)}…: `
            + `${applyResult.marked_completed.length} completed, ${applyResult.reopened.length} reopened, `
            + `${applyResult.recorded_pending.length} recorded pending`
            + (applyResult.initialized ? ' (project initialized)' : ''),
          )
          output.info(
            `doctor: ${applyResult.doctor.verdict} (exit ${applyResult.doctor.exitCode}) `
            + '— run `scaffold doctor` for details',
          )
        }
        process.exitCode = 0
      })
      return
    }

    // D16 one-release notice — REMOVE in the release after R1 ships.
    output.warn(
      'Behavior change: `scaffold adopt` now renders an Adoption Plan and writes nothing by default. '
      + 'Run `scaffold adopt --apply --plan <path>` (or --plan-key <sha256>) to execute an approved plan. '
      + 'The previous silent write-on-run behavior was a defect — see CHANGELOG.',
    )

    const writeTarget = argv.write === undefined
      ? null
      : (argv.write === '' ? 'docs/adoption-plan.md' : String(argv.write))
    if (writeTarget !== null) {
      const target = path.isAbsolute(writeTarget) ? writeTarget : path.join(projectRoot, writeTarget)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      atomicWriteFileSync(target, renderPlanMarkdown(plan))
      output.info(`Plan written: ${target}`)
    }
    if (outputMode === 'json') {
      output.result({
        schema_version: 3,
        ...plan,
        ...(adoptResult.projectType && { project_type: adoptResult.projectType }),
        ...(adoptResult.detectedConfig && { detected_config: adoptResult.detectedConfig }),
        ...(adoptResult.detectionConfidence !== undefined && { detection_confidence: adoptResult.detectionConfidence }),
        ...(adoptResult.detectionEvidence !== undefined && { detection_evidence: adoptResult.detectionEvidence }),
      })
    } else {
      for (const line of renderPlanMarkdown(plan).split('\n')) output.info(line)
      output.success(
        `Adoption plan rendered (${plan.steps.length} steps). Nothing was written. `
        + 'Apply with: scaffold adopt --apply',
      )
    }
    process.exitCode = 0
  },
}

export default adoptCommand
