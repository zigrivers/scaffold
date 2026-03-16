import type { CommandModule } from 'yargs'
import path from 'node:path'
import type { MethodologyPreset } from '../../types/index.js'
import { loadAllPresets } from '../../core/assembly/preset-loader.js'
import { createOutputContext } from '../output/context.js'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'

interface ListArgs {
  section?: 'methodologies' | 'platforms'
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const listCommand: CommandModule<Record<string, unknown>, ListArgs> = {
  command: 'list',
  describe: 'List available methodologies and platform adapters',
  builder: (yargs) => {
    return yargs.option('section', {
      type: 'string',
      choices: ['methodologies', 'platforms'] as const,
      description: 'Filter to show only this section',
    })
  },
  handler: async (argv) => {
    // list doesn't require an initialized project
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // Try to find project root for methodology dir
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    const methodologyDir = projectRoot ? path.join(projectRoot, 'methodology') : null

    // Load presets if methodology dir is available
    const presets: Map<string, MethodologyPreset> = new Map()
    if (methodologyDir) {
      try {
        const { deep, mvp, custom } = loadAllPresets(methodologyDir, [])
        if (deep) presets.set(deep.name, deep)
        if (mvp) presets.set(mvp.name, mvp)
        if (custom) presets.set(custom.name, custom)
      } catch {
        // no presets available
      }
    }

    const section = argv.section

    if (outputMode === 'json') {
      const result: Record<string, unknown> = {}
      if (!section || section === 'methodologies') {
        result['methodologies'] = [...presets.entries()].map(([name, p]) => ({
          name,
          depth: p.default_depth,
          description: p.description,
        }))
      }
      if (!section || section === 'platforms') {
        result['platforms'] = []  // T-039-T-043 will populate adapters
      }
      output.result(result)
    } else {
      if (!section || section === 'methodologies') {
        output.info('Methodology Presets:')
        if (presets.size === 0) {
          output.info('  (none found — run from a scaffold project directory)')
        }
        for (const [name, p] of presets.entries()) {
          output.info(`  ${name}: depth ${p.default_depth}`)
        }
      }
      if (!section || section === 'platforms') {
        output.info('Platform Adapters:')
        output.info('  (platform adapters not yet configured)')
      }
    }
    process.exit(0)
  },
}

export default listCommand
