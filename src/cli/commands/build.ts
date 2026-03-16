import type { CommandModule, Argv } from 'yargs'
import path from 'node:path'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadConfig } from '../../config/loader.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { loadAllPresets } from '../../core/assembly/preset-loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { detectCycles, topologicalSort } from '../../core/dependency/dependency.js'
import { displayErrors } from '../../cli/output/error-display.js'

interface BuildArgs {
  'validate-only': boolean
  force: boolean
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
}

const buildCommand: CommandModule<Record<string, unknown>, BuildArgs> = {
  command: 'build',
  describe: 'Generate platform adapter output files',
  builder: (yargs: Argv) => {
    return yargs
      .option('validate-only', {
        type: 'boolean',
        description: 'Validate without generating files',
        default: false,
      })
      .option('force', {
        type: 'boolean',
        description: 'Regenerate even if outputs exist',
        default: false,
      })
  },
  handler: async (argv) => {
    const startTime = Date.now()

    // Step 1: Resolve project root
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '\u2717 error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n' +
        '  Fix: Run `scaffold init` to initialize a project\n',
      )
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // Step 2: Load config
    const { config, errors: configErrors } = loadConfig(projectRoot, [])
    if (configErrors.length > 0) {
      displayErrors(configErrors, [], output)
      process.exit(1)
      return
    }
    if (!config) {
      output.error('Config not found')
      process.exit(1)
      return
    }

    // Step 3: Discover meta-prompts
    const metaPrompts = discoverMetaPrompts(path.join(projectRoot, 'pipeline'))
    const stepNames = [...metaPrompts.keys()]

    // Step 4: Load presets (optional — failures are non-fatal)
    try {
      const methodologyDir = path.join(projectRoot, 'methodology')
      loadAllPresets(methodologyDir, stepNames)
    } catch {
      // No presets available — continue without them
    }

    // Step 5: Build dependency graph
    const graph = buildGraph(
      [...metaPrompts.values()].map(m => m.frontmatter),
      new Map(),
    )

    // Step 6: Detect cycles
    const cycles = detectCycles(graph)
    if (cycles.length > 0) {
      displayErrors(cycles, [], output)
      process.exit(1)
      return
    }

    // Step 7: Topological sort
    const sorted = topologicalSort(graph)
    const enabledSteps = sorted.filter(() => {
      // For now: all steps enabled (adapter logic comes in T-039-T-042)
      return true
    })

    // Step 8: Handle --validate-only
    if (argv['validate-only']) {
      output.success(`Validation passed: ${stepNames.length} steps, no cycles`)
      if (outputMode === 'json') {
        output.result({ valid: true, stepCount: stepNames.length, cycles: 0 })
      }
      process.exit(0)
      return
    }

    // Step 9: Report build stats (adapter file generation is T-039-T-042)
    const buildResult = {
      stepsTotal: stepNames.length,
      stepsEnabled: enabledSteps.length,
      platforms: (config.platforms as string[]) ?? [],
      generatedFiles: 0,
      buildTimeMs: Date.now() - startTime,
    }

    if (outputMode === 'json') {
      output.result(buildResult)
    } else {
      output.success(`Build complete: ${enabledSteps.length}/${stepNames.length} steps enabled`)
      output.info(`Platforms: ${buildResult.platforms.join(', ') || 'none'}`)
    }

    process.exit(0)
  },
}

export default buildCommand
