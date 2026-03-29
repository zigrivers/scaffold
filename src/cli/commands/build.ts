import type { CommandModule, Argv } from 'yargs'
import path from 'node:path'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadConfig } from '../../config/loader.js'
import { discoverAllMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import {
  getPackagePipelineDir, getPackageMethodologyDir,
  getPackageKnowledgeDir, getPackageToolsDir,
} from '../../utils/fs.js'
import { loadAllPresets } from '../../core/assembly/preset-loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { detectCycles, topologicalSort } from '../../core/dependency/dependency.js'
import { displayErrors } from '../../cli/output/error-display.js'
import { buildIndexWithOverrides, loadFullEntries } from '../../core/assembly/knowledge-loader.js'
import { createAdapter } from '../../core/adapters/adapter.js'
import type { AdapterStepInput, AdapterStepOutput, OutputFile } from '../../core/adapters/adapter.js'
import fs from 'node:fs'

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

    // Step 3: Discover meta-prompts from both pipeline/ and tools/ directories
    const metaPrompts = discoverAllMetaPrompts(
      getPackagePipelineDir(projectRoot),
      getPackageToolsDir(projectRoot),
    )
    const stepNames = [...metaPrompts.keys()]

    // Step 4: Load presets (optional — failures are non-fatal)
    try {
      const methodologyDir = getPackageMethodologyDir(projectRoot)
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

    // Step 7: Topological sort (pipeline steps only — tools are excluded from graph)
    const sorted = topologicalSort(graph)
    // Append tools (category: 'tool') after pipeline steps — they aren't in the graph
    const toolSteps = [...metaPrompts.values()]
      .filter(m => m.frontmatter.category === 'tool')
      .map(m => m.frontmatter.name)
      .sort()
    const enabledSteps = [...sorted, ...toolSteps]

    // Step 8: Handle --validate-only
    if (argv['validate-only']) {
      output.success(`Validation passed: ${stepNames.length} steps, no cycles`)
      if (outputMode === 'json') {
        output.result({ valid: true, stepCount: stepNames.length, cycles: 0 })
      }
      process.exit(0)
      return
    }

    // Step 9: Load knowledge index
    const kbIndex = buildIndexWithOverrides(
      projectRoot,
      getPackageKnowledgeDir(projectRoot),
    )

    // Step 10: Build reverse dependency map (step → steps that come after it)
    const forwardDeps = new Map<string, string[]>()
    for (const [stepName, _node] of graph.nodes) {
      // Find steps that list this step as a dependency
      const dependents: string[] = []
      for (const [otherName, _otherNode] of graph.nodes) {
        if (otherName === stepName) continue
        const otherMeta = metaPrompts.get(otherName)
        if (otherMeta?.frontmatter.dependencies.includes(stepName)) {
          dependents.push(otherName)
        }
      }
      forwardDeps.set(stepName, dependents)
    }

    // Step 11: Create adapters and generate
    const platforms = (config.platforms as string[]) ?? ['claude-code']
    const allOutputFiles: OutputFile[] = []

    for (const platformId of platforms) {
      const adapter = createAdapter(platformId)
      adapter.initialize({
        projectRoot,
        methodology: config.methodology ?? 'deep',
        allSteps: stepNames,
      })

      const results: AdapterStepOutput[] = []

      for (const stepSlug of enabledSteps) {
        const meta = metaPrompts.get(stepSlug)
        if (!meta) continue

        // Load full knowledge entries (Summary + Deep Guidance) for self-contained commands
        const kbNames = meta.frontmatter.knowledgeBase ?? []
        const { entries: kbEntries } = loadFullEntries(kbIndex, kbNames)

        // Build long description: prefer summary, then Purpose section first line, then description
        const purposeSection = meta.sections['Purpose'] ?? ''
        const longDescription = meta.frontmatter.summary
          ?? purposeSection.split('\n')[0]?.trim()
          ?? meta.frontmatter.description

        const input: AdapterStepInput = {
          slug: stepSlug,
          description: meta.frontmatter.description,
          phase: meta.frontmatter.phase,
          dependsOn: forwardDeps.get(stepSlug) ?? [],
          produces: meta.frontmatter.outputs,
          pipelineIndex: enabledSteps.indexOf(stepSlug),
          body: meta.body,
          sections: meta.sections,
          knowledgeEntries: kbEntries.map(e => ({
            name: e.name,
            description: e.description,
            content: e.content,
          })),
          conditional: meta.frontmatter.conditional,
          longDescription,
        }

        const stepResult = adapter.generateStepWrapper(input)
        results.push(stepResult)
        allOutputFiles.push(...stepResult.files)
      }

      adapter.finalize({ results })
    }

    // Step 12: Write output files
    let generatedCount = 0
    for (const file of allOutputFiles) {
      const fullPath = path.join(projectRoot, file.relativePath)
      const dir = path.dirname(fullPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(fullPath, file.content, 'utf8')
      generatedCount++
    }

    // Step 13: Report build stats
    const buildResult = {
      stepsTotal: stepNames.length,
      stepsEnabled: enabledSteps.length,
      platforms,
      generatedFiles: generatedCount,
      buildTimeMs: Date.now() - startTime,
    }

    if (outputMode === 'json') {
      output.result(buildResult)
    } else {
      output.success(`Build complete: ${generatedCount} files generated for ${enabledSteps.length} steps`)
      output.info(`Platforms: ${platforms.join(', ')}`)
    }

    process.exit(0)
  },
}

export default buildCommand
