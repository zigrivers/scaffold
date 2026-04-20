import type { CommandModule } from 'yargs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../../../package.json') as { version: string }
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { readDecisions } from '../../state/decision-logger.js'
import { loadConfig } from '../../config/loader.js'
import { guardSteplessCommand } from '../guards.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'
import {
  generateDashboardData,
  generateHtml,
  generateMultiServiceDashboardData,
  generateMultiServiceHtml,
} from '../../dashboard/generator.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { getPackagePipelineDir, atomicWriteFile } from '../../utils/fs.js'
import type { PipelineState, ServiceConfig } from '../../types/index.js'

interface DashboardArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  output?: string
  'no-open'?: boolean
  'json-only'?: boolean
  service?: string
}

type ConfigWithMethodology = { methodology?: { preset?: string } } | null

/**
 * Write HTML to the requested path (or a tmpfile), then optionally open it in
 * the system browser. Shared between single-service and multi-service modes.
 * Calls process.exit(0) on success.
 */
function writeAndOpenDashboard(
  html: string,
  argv: DashboardArgs,
  output: { success: (msg: string) => void },
): void {
  const outputPath = argv.output ?? path.join(os.tmpdir(), `scaffold-dashboard-${Date.now()}.html`)

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  atomicWriteFile(outputPath, html)

  if (!argv['no-open']) {
    let opener = 'xdg-open'
    if (process.platform === 'darwin') opener = 'open'
    if (process.platform === 'win32') opener = 'start'
    try {
      execFileSync(opener, [outputPath])
    } catch {
      // Ignore errors when opening browser
    }
  }

  output.success(`Dashboard generated: ${outputPath}`)
  process.exit(0)
}

const dashboardCommand: CommandModule<Record<string, unknown>, DashboardArgs> = {
  command: 'dashboard',
  describe: 'Open pipeline dashboard in browser',
  builder: (yargs) => {
    return yargs
      .option('output', {
        type: 'string',
        description: 'Output path for HTML file',
      })
      .option('no-open', {
        type: 'boolean',
        description: 'Skip opening in browser',
        default: false,
      })
      .option('json-only', {
        type: 'boolean',
        description: 'Output data as JSON to stdout',
        default: false,
      })
      .option('service', {
        type: 'string',
        describe: 'Target service name (multi-service projects)',
      })
  },
  handler: async (argv) => {
    // 1. Resolve project root
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n' +
        '  Fix: Run `scaffold init` to initialize a project\n',
      )
      process.exit(1)
      return
    }

    // 2. Resolve output mode and create context
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // 3. Load config (needed for state dispatch + methodology resolution)
    const { config } = loadConfig(projectRoot, [])
    const service = argv.service as string | undefined
    ensureV3Migration(projectRoot, config)
    guardSteplessCommand(config ?? {}, service, { commandName: 'dashboard', output })
    if (process.exitCode === 2) return

    // Multi-service mode: config has services[] AND no --service flag.
    // Iterate per-service, render aggregate bird's-eye dashboard.
    const configuredServices = config?.project?.services as ServiceConfig[] | undefined
    const isMultiServiceMode =
      !service && Array.isArray(configuredServices) && configuredServices.length > 0

    if (isMultiServiceMode) {
      // Load meta-prompts ONCE and share across all services.
      const metaPrompts = discoverMetaPrompts(getPackagePipelineDir(projectRoot))

      // Methodology resolution: prefer config.methodology.preset; else fall back to
      // the first loaded service state's config_methodology; else 'unknown'.
      const configMethodology = (config as ConfigWithMethodology)?.methodology?.preset

      const loadedServices: Array<{
        name: string
        projectType: string
        state: PipelineState
        metaPrompts: typeof metaPrompts
      }> = []

      let fallbackStateMethodology: string | undefined
      for (const svc of configuredServices!) {
        const svcResolver = new StatePathResolver(projectRoot, svc.name)
        const svcStateManager = new StateManager(
          projectRoot,
          () => [],
          () => config ?? undefined,
          svcResolver,
          new Set<string>(),
          undefined,
        )
        let svcState: PipelineState
        try {
          svcState = svcStateManager.loadState()
          if (!fallbackStateMethodology) {
            fallbackStateMethodology = svcState.config_methodology
          }
        } catch (err) {
          // Only convert missing-state-file into a skeleton; re-throw anything
          // else (corrupt JSON, schema-version mismatch, permission errors) so
          // the user sees the real error instead of a confusing 0% row.
          // Codex/Claude MMR P2: bare catch collapsed every failure mode.
          const code = (err as { code?: string } | undefined)?.code
          if (code !== 'STATE_MISSING') throw err
          // Skeleton state: empty steps (total=0) renders as "Not started" in
          // the multi-service template, distinct from "Complete".
          svcState = {
            'schema-version': 3,
            'scaffold-version': pkg.version,
            init_methodology: configMethodology ?? 'unknown',
            config_methodology: configMethodology ?? 'unknown',
            'init-mode': 'greenfield',
            created: new Date().toISOString(),
            in_progress: null,
            steps: {},
            next_eligible: [],
            'extra-steps': [],
          } as PipelineState
        }
        loadedServices.push({
          name: svc.name,
          projectType: svc.projectType,
          state: svcState,
          metaPrompts,
        })
      }

      const methodology = configMethodology ?? fallbackStateMethodology ?? 'unknown'

      const dashboardData = generateMultiServiceDashboardData({
        services: loadedServices,
        methodology,
      })

      if (argv['json-only']) {
        output.result(dashboardData)
        process.exit(0)
        return
      }

      const html = generateMultiServiceHtml(dashboardData)
      writeAndOpenDashboard(html, argv, output)
      return
    }

    // 4. Load state (single-service / global scope)
    const pathResolver = new StatePathResolver(projectRoot, service)
    const stateManager = new StateManager(
      projectRoot,
      () => [],
      () => config ?? undefined,
      pathResolver,
      // Empty Set (truthy) so StateManager.saveState's `isServiceScoped && globalSteps`
      // guard correctly classifies --service invocations as service-scope even though
      // dashboard doesn't resolve a pipeline. Prevents mis-scoped saves (e.g. writing
      // save_counter onto a service state file) when loadState triggers migration.
      new Set<string>(),
      undefined,  // pipelineHash — legacy-safe; dashboard only triggers saveState via one-time migration
    )
    let state: PipelineState
    try {
      state = stateManager.loadState()
    } catch {
      output.error({
        code: 'STATE_MISSING',
        message: 'No state.json found',
        exitCode: 1,
        recovery: 'Run scaffold init',
      })
      process.exit(1)
      return
    }

    // 5. Load decisions
    const decisions = readDecisions(projectRoot, {}, pathResolver)
    const methodology =
      (config as ConfigWithMethodology)?.methodology?.preset ??
      state.config_methodology ??
      'unknown'

    // 6. Load meta-prompts for enriched step data
    const metaPrompts = discoverMetaPrompts(getPackagePipelineDir(projectRoot))

    // 7. Generate dashboard data
    const dashboardData = generateDashboardData({ state, decisions, methodology, metaPrompts })

    // 8. JSON-only mode — output data and exit
    if (argv['json-only']) {
      output.result(dashboardData)
      process.exit(0)
      return
    }

    // 9. Generate HTML + write + open
    const html = generateHtml(dashboardData)
    writeAndOpenDashboard(html, argv, output)
  },
}

export default dashboardCommand
