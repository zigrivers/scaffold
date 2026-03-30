import type { CommandModule } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'

import type { MethodologyPreset } from '../../types/index.js'
import { loadAllPresets } from '../../core/assembly/preset-loader.js'
import { getPackageMethodologyDir, getPackageToolsDir, getPackagePipelineDir } from '../../utils/fs.js'
import { createOutputContext } from '../output/context.js'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { parseFrontmatter } from '../../project/frontmatter.js'

interface ListArgs {
  section?: 'methodologies' | 'platforms' | 'tools'
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

interface ToolEntry {
  name: string
  description: string
  argumentHint: string | null
}

function scanTools(projectRoot: string | undefined): { build: ToolEntry[]; utility: ToolEntry[] } {
  const toolsDir = getPackageToolsDir(projectRoot)
  const pipelineDir = getPackagePipelineDir(projectRoot)
  const buildDir = path.join(pipelineDir, 'build')

  const utility: ToolEntry[] = []
  const buildRaw: Array<ToolEntry & { order: number }> = []

  // Scan tools/ for category: tool
  try {
    for (const file of fs.readdirSync(toolsDir).filter(f => f.endsWith('.md')).sort()) {
      try {
        const fm = parseFrontmatter(path.join(toolsDir, file))
        if (fm.category !== 'tool') continue
        utility.push({
          name: fm.name,
          description: fm.description,
          argumentHint: typeof fm['argument-hint'] === 'string' ? fm['argument-hint'] : null,
        })
      } catch { /* skip unparseable files */ }
    }
  } catch { /* toolsDir not found */ }

  // Scan pipeline/build/ for stateless: true, sort by order
  try {
    for (const file of fs.readdirSync(buildDir).filter(f => f.endsWith('.md'))) {
      try {
        const fm = parseFrontmatter(path.join(buildDir, file))
        if (!fm.stateless) continue
        buildRaw.push({
          name: fm.name,
          description: fm.description,
          argumentHint: typeof fm['argument-hint'] === 'string' ? fm['argument-hint'] : null,
          order: fm.order ?? 9999,
        })
      } catch { /* skip unparseable files */ }
    }
  } catch { /* buildDir not found */ }

  buildRaw.sort((a, b) => a.order - b.order)
  const build = buildRaw.map(({ name, description, argumentHint }) => ({ name, description, argumentHint }))

  return { build, utility }
}

const listCommand: CommandModule<Record<string, unknown>, ListArgs> = {
  command: 'list',
  describe: 'List available methodologies and platform adapters',
  builder: (yargs) => {
    return yargs.option('section', {
      type: 'string',
      choices: ['methodologies', 'platforms', 'tools'] as const,
      description: 'Filter to show only this section',
    })
  },
  handler: async (argv) => {
    // list doesn't require an initialized project
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // Try to find project root for methodology dir
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    const methodologyDir = getPackageMethodologyDir(projectRoot ?? undefined)

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
      if (!section || section === 'tools') {
        const { build, utility } = scanTools(projectRoot ?? undefined)
        const nameWidth = Math.max(
          ...build.map(t => t.name.length),
          ...utility.map(t => t.name.length),
          12,
        ) + 2
        const descWidth = argv.verbose
          ? Math.max(
            ...build.map(t => t.description.length),
            ...utility.map(t => t.description.length),
            20,
          ) + 2
          : 0

        const formatEntry = (t: ToolEntry): string => {
          const base = `  ${t.name.padEnd(nameWidth)}${t.description}`
          if (argv.verbose && t.argumentHint) {
            return `${base.padEnd(nameWidth + descWidth + 2)}  ${t.argumentHint}`
          }
          return base
        }

        output.info('Build Tools:')
        if (build.length === 0) {
          output.info('  (none found)')
        }
        for (const t of build) {
          output.info(formatEntry(t))
        }

        output.info('Utility Tools:')
        if (utility.length === 0) {
          output.info('  (none found)')
        }
        for (const t of utility) {
          output.info(formatEntry(t))
        }
      }
    }
    process.exit(0)
  },
}

export default listCommand
