import type { CommandModule } from 'yargs'
import path from 'node:path'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadConfig } from '../../config/loader.js'
import { StateManager } from '../../state/state-manager.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { computeEligible } from '../../core/dependency/eligibility.js'

interface NextArgs {
  count?: number
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const nextCommand: CommandModule<Record<string, unknown>, NextArgs> = {
  command: 'next',
  describe: 'Show next eligible step(s)',
  builder: (yargs) => {
    return yargs.option('count', {
      type: 'number',
      description: 'Show up to N next eligible steps',
    })
  },
  handler: async (argv) => {
    // 1. Resolve project root
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n',
      )
      process.stderr.write(
        '  Fix: Run `scaffold init` to initialize a project\n',
      )
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // 2. Load state and config
    const stateManager = new StateManager(projectRoot, () => [])
    const state = stateManager.loadState()
    loadConfig(projectRoot, [])

    // 3. Discover meta-prompts and compute eligible
    const metaPrompts = discoverMetaPrompts(path.join(projectRoot, 'pipeline'))
    const graph = buildGraph(
      [...metaPrompts.values()].map(m => m.frontmatter),
      new Map(),
    )
    const eligible = computeEligible(graph, state.steps)

    // 4. Apply --count limit
    const count = argv.count ?? eligible.length
    const shown = eligible.slice(0, count)

    // 5. Check pipeline completion
    const stepValues = Object.values(state.steps)
    const allDone =
      stepValues.length > 0 &&
      stepValues.every(s => s.status === 'completed' || s.status === 'skipped')

    if (outputMode === 'json') {
      output.result({
        eligible: shown.map(s => ({
          slug: s,
          description: metaPrompts.get(s)?.frontmatter?.description ?? '',
          command: `scaffold run ${s}`,
        })),
        blocked_steps: [],
        pipeline_complete: allDone,
      })
    } else {
      if (allDone) {
        output.success('Pipeline complete!')
      } else if (shown.length === 0) {
        output.warn('No eligible steps. Check dependencies.')
      } else {
        output.info(`Next eligible steps (${shown.length}):`)
        for (const slug of shown) {
          const desc = metaPrompts.get(slug)?.frontmatter?.description ?? ''
          output.info(`  scaffold run ${slug}  — ${desc}`)
        }
      }
    }

    process.exit(0)
  },
}

export default nextCommand
