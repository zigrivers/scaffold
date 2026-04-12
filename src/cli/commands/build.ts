import type { CommandModule, Argv } from 'yargs'
import path from 'node:path'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import type { OutputContext } from '../output/context.js'
import { loadConfig } from '../../config/loader.js'
import { discoverAllMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import {
  getPackagePipelineDir, getPackageMethodologyDir,
  getPackageKnowledgeDir, getPackageToolsDir, getPackageRoot, atomicWriteFile,
} from '../../utils/fs.js'
import { loadAllPresets } from '../../core/assembly/preset-loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { detectCycles, topologicalSort } from '../../core/dependency/dependency.js'
import { displayErrors } from '../../cli/output/error-display.js'
import { buildIndexWithOverrides, loadFullEntries } from '../../core/assembly/knowledge-loader.js'
import { createAdapter } from '../../core/adapters/adapter.js'
import type { AdapterStepInput, AdapterStepOutput, OutputFile } from '../../core/adapters/adapter.js'
import { ensureScaffoldGitignore, findLegacyGeneratedOutputs } from '../../project/gitignore.js'
import fs from 'node:fs'
import type { CommandResult } from '../../types/index.js'
import { shutdown } from '../shutdown.js'

export interface BuildArgs {
  'validate-only': boolean
  force: boolean
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
}

interface RunBuildOptions {
  output?: OutputContext
  suppressFinalResult?: boolean
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
    const result = await runBuild(argv)
    process.exit(result.exitCode)
  },
}

export async function runBuild(argv: BuildArgs, options: RunBuildOptions = {}): Promise<CommandResult> {
  return shutdown.withContext(
    'Cancelled. Partial output may exist. Run `scaffold build` to regenerate.',
    async () => {
      const startTime = Date.now()

      // Step 1: Resolve project root
      const projectRoot = argv.root ?? findProjectRoot(process.cwd())
      if (!projectRoot) {
        process.stderr.write(
          '\u2717 error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n' +
      '  Fix: Run `scaffold init` to initialize a project\n',
        )
        return { exitCode: 1 }
      }

      const outputMode = resolveOutputMode(argv)
      const output = options.output ?? createOutputContext(outputMode)

      // Step 2: Load config
      const { config, errors: configErrors } = loadConfig(projectRoot, [])
      if (configErrors.length > 0) {
        displayErrors(configErrors, [], output)
        return { exitCode: 1, errors: configErrors }
      }
      if (!config) {
        output.error('Config not found')
        return { exitCode: 1 }
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
      } catch (err) {
        process.stderr.write(`[scaffold] Warning: could not load methodology presets: ${(err as Error).message}\n`)
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
        return { exitCode: 1, errors: cycles }
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
        const validationResult = { valid: true, stepCount: stepNames.length, cycles: 0 }
        output.success(`Validation passed: ${stepNames.length} steps, no cycles`)
        if (outputMode === 'json' && !options.suppressFinalResult) {
          output.result(validationResult)
        }
        return { exitCode: 0, data: validationResult }
      }

      // Step 9: Load knowledge index
      const kbIndex = buildIndexWithOverrides(
        projectRoot,
        getPackageKnowledgeDir(projectRoot),
      )

      // Step 9.5: Ensure .gitignore and warn about legacy root output
      const gitignoreResult = ensureScaffoldGitignore(projectRoot)
      for (const warning of gitignoreResult.warnings) {
        output.warn(warning)
      }

      const legacyOutputs = findLegacyGeneratedOutputs(projectRoot)
      if (legacyOutputs.length > 0) {
        output.warn({
          code: 'LEGACY_GENERATED_OUTPUTS_PRESENT',
          message: [
            `Legacy root Scaffold outputs still exist: ${legacyOutputs.join(', ')}.`,
            'See README migration instructions.',
          ].join(' '),
          context: { count: legacyOutputs.length },
        })
      }

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
      const configuredPlatforms = (config.platforms as string[]) ?? ['claude-code']
      const platforms = [...new Set([...configuredPlatforms, 'universal'])]
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

        const finalizeResult = adapter.finalize({ results })
        allOutputFiles.push(...finalizeResult.files)
      }

      // Step 12: Write output files
      let generatedCount = 0
      for (const file of allOutputFiles) {
        if (shutdown.isShuttingDown) break
        const fullPath = path.join(projectRoot, file.relativePath)
        const dir = path.dirname(fullPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        atomicWriteFile(fullPath, file.content)
        generatedCount++
      }

      // Step 12.5: Generate resolved skills for plugin auto-discovery
      const skillTemplateDir = path.join(getPackageRoot(), 'content', 'skills')
      const skillOutputDir = path.join(getPackageRoot(), 'skills')
      if (fs.existsSync(skillTemplateDir)) {
        const claudeVars: Record<string, string> = { INSTRUCTIONS_FILE: 'CLAUDE.md' }
        for (const skillName of fs.readdirSync(skillTemplateDir)) {
          if (shutdown.isShuttingDown) break
          const templatePath = path.join(skillTemplateDir, skillName, 'SKILL.md')
          if (!fs.existsSync(templatePath)) continue
          const template = fs.readFileSync(templatePath, 'utf8')
          const resolved = template.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) => claudeVars[key] ?? match)
          const outDir = path.join(skillOutputDir, skillName)
          fs.mkdirSync(outDir, { recursive: true })
          fs.writeFileSync(path.join(outDir, 'SKILL.md'), resolved, 'utf8')
        }
      }

      // Step 13: Report build stats
      const buildResult = {
        stepsTotal: stepNames.length,
        stepsEnabled: enabledSteps.length,
        platforms,
        generatedFiles: generatedCount,
        buildTimeMs: Date.now() - startTime,
      }

      // If shutdown interrupted the build, return early without success message
      if (shutdown.isShuttingDown) {
        return { exitCode: 1, data: buildResult }
      }

      if (outputMode === 'json') {
        if (!options.suppressFinalResult) {
          output.result(buildResult)
        }
      } else {
        output.success(`Build complete: ${generatedCount} files generated for ${enabledSteps.length} steps`)
        output.info(`Platforms: ${platforms.join(', ')}`)
      }

      return { exitCode: 0, data: buildResult }
    }) // end withContext
}

export default buildCommand
