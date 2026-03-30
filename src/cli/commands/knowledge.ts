import type { Argv, CommandModule } from 'yargs'
import path from 'node:path'
import fs from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { buildIndex, extractKBFrontmatter } from '../../core/assembly/knowledge-loader.js'
import { KnowledgeUpdateAssembler, loadTemplate } from '../../core/knowledge/knowledge-update-assembler.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { loadConfig } from '../../config/loader.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
import { getPackageKnowledgeDir, getPackagePipelineDir } from '../../utils/fs.js'

// -----------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------

function getProjectRoot(argv: { root?: string }): string | null {
  return argv.root ?? findProjectRoot(process.cwd())
}

function readFrontmatterDescription(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return extractKBFrontmatter(content)?.description ?? ''
  } catch {
    return ''
  }
}

// -----------------------------------------------------------------------
// list subcommand
// -----------------------------------------------------------------------

interface ListArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
}

const listSubcommand: CommandModule<Record<string, unknown>, ListArgs> = {
  command: 'list',
  describe: 'Show all knowledge entries — global and local overrides',
  builder: (yargs) => yargs as Argv<ListArgs>,
  handler: async (argv) => {
    const projectRoot = getProjectRoot(argv)
    if (!projectRoot) {
      process.stderr.write('✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const globalDir = getPackageKnowledgeDir(projectRoot)
    const localDir = path.join(projectRoot, '.scaffold', 'knowledge')

    const globalIndex = buildIndex(globalDir)
    const localIndex = buildIndex(localDir)

    // Build merged list
    const allNames = new Set([...globalIndex.keys(), ...localIndex.keys()])
    const entries = [...allNames].sort().map((name) => {
      const isLocal = localIndex.has(name)
      const filePath = isLocal ? localIndex.get(name)! : globalIndex.get(name)!
      return {
        name,
        source: isLocal ? 'local' : 'global',
        description: readFrontmatterDescription(filePath),
      }
    })

    if (outputMode === 'json') {
      output.result(entries)
    } else if (entries.length === 0) {
      output.info('No knowledge entries found.')
    } else {
      const nameWidth = Math.max(4, ...entries.map((e) => e.name.length)) + 2
      const sourceWidth = 16
      const header = 'NAME'.padEnd(nameWidth) + 'SOURCE'.padEnd(sourceWidth) + 'DESCRIPTION'
      output.info(header)
      output.info('-'.repeat(header.length))
      for (const e of entries) {
        const sourceLabel = e.source === 'local' ? 'local override' : 'global'
        output.info(e.name.padEnd(nameWidth) + sourceLabel.padEnd(sourceWidth) + e.description)
      }
    }
    process.exit(0)
  },
}

// -----------------------------------------------------------------------
// show subcommand
// -----------------------------------------------------------------------

interface ShowArgs {
  name: string
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

const showSubcommand: CommandModule<Record<string, unknown>, ShowArgs> = {
  command: 'show <name>',
  describe: 'Print the effective content of a knowledge entry',
  builder: (yargs) =>
    yargs.positional('name', { type: 'string', demandOption: true }) as Argv<ShowArgs>,
  handler: async (argv) => {
    const projectRoot = getProjectRoot(argv)
    if (!projectRoot) {
      process.stderr.write('✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const globalDir = getPackageKnowledgeDir(projectRoot)
    const localDir = path.join(projectRoot, '.scaffold', 'knowledge')
    const globalIndex = buildIndex(globalDir)
    const localIndex = buildIndex(localDir)

    const name = argv.name
    const isLocal = localIndex.has(name)
    const filePath = isLocal ? localIndex.get(name) : globalIndex.get(name)

    if (!filePath) {
      output.error({ code: 'ENTRY_NOT_FOUND', message: `Knowledge entry '${name}' not found.`, exitCode: 1 })
      process.exit(1)
      return
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const sourceLabel = isLocal ? 'local override' : 'global'
      output.info(`# Source: ${sourceLabel} (${filePath})\n`)
      output.info(content)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      output.error({ code: 'READ_ERROR', message: `Failed to read entry: ${detail}`, exitCode: 1 })
      process.exit(1)
      return
    }
    process.exit(0)
  },
}

// -----------------------------------------------------------------------
// reset subcommand
// -----------------------------------------------------------------------

interface ResetArgs {
  name: string
  auto?: boolean
  root?: string
  format?: string
  verbose?: boolean
}

const resetSubcommand: CommandModule<Record<string, unknown>, ResetArgs> = {
  command: 'reset <name>',
  describe: 'Remove a local knowledge override, reverting to the global entry',
  builder: (yargs) =>
    yargs.positional('name', { type: 'string', demandOption: true }) as Argv<ResetArgs>,
  handler: async (argv) => {
    const projectRoot = getProjectRoot(argv)
    if (!projectRoot) {
      process.stderr.write('✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const localDir = path.join(projectRoot, '.scaffold', 'knowledge')
    const localIndex = buildIndex(localDir)
    const name = argv.name
    const localPath = localIndex.get(name)

    if (!localPath) {
      output.info(`Nothing to reset for '${name}' — no local override found.`)
      process.exit(0)
      return
    }

    // Check whether we're in a git repo
    const isGitRepo = (() => {
      try {
        execSync('git rev-parse --git-dir', { stdio: 'pipe', cwd: projectRoot })
        return true
      } catch {
        return false
      }
    })()

    let hasUncommittedChanges = false
    if (isGitRepo) {
      try {
        const result = execFileSync('git', ['status', '--porcelain', localPath], { stdio: 'pipe', cwd: projectRoot })
        hasUncommittedChanges = result.toString().trim().length > 0
      } catch {
        // ignore
      }
    }

    if (hasUncommittedChanges && !argv.auto) {
      process.stderr.write(
        `warn: '${name}' has uncommitted changes.\n` +
        '  Re-run with --auto to delete anyway.\n',
      )
      process.exit(1)
      return
    }

    try {
      fs.unlinkSync(localPath)
      output.success(`Reset '${name}' — local override removed. Global entry will be used.`)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      output.error({ code: 'DELETE_ERROR', message: `Failed to delete override: ${detail}`, exitCode: 1 })
      process.exit(1)
      return
    }
    process.exit(0)
  },
}

// -----------------------------------------------------------------------
// update subcommand
// -----------------------------------------------------------------------

interface UpdateArgs {
  target: string
  step?: boolean
  entry?: string
  instructions?: string[]
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

const updateSubcommand: CommandModule<Record<string, unknown>, UpdateArgs> = {
  command: 'update <target> [instructions..]',
  describe: 'Assemble a knowledge update prompt for an entry or all entries in a pipeline step',
  builder: (yargs) =>
    yargs
      .positional('target', { type: 'string', demandOption: true })
      .positional('instructions', { type: 'string', array: true, default: [] })
      .option('step', { type: 'boolean', default: false, describe: 'Treat target as a pipeline step name' })
      .option('entry', { type: 'string', describe: 'When using --step, update only this entry' }) as Argv<UpdateArgs>,
  handler: async (argv) => {
    const projectRoot = getProjectRoot(argv)
    if (!projectRoot) {
      process.stderr.write('✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const globalDir = getPackageKnowledgeDir(projectRoot)
    const localDir = path.join(projectRoot, '.scaffold', 'knowledge')
    const globalIndex = buildIndex(globalDir)

    const metaPrompts = discoverMetaPrompts(getPackagePipelineDir(projectRoot))

    const target = argv.target
    const isEntryName = globalIndex.has(target)
    const isStepName = metaPrompts.has(target)
    const forceStep = argv.step === true

    let entryNames: string[]

    if (forceStep || (!isEntryName && isStepName)) {
      // Step resolution path
      const step = metaPrompts.get(target)
      if (!step) {
        output.error({ code: 'TARGET_NOT_FOUND', message: `No step named '${target}' found.`, exitCode: 1 })
        process.exit(1)
        return
      }
      const stepEntries: string[] = step.frontmatter.knowledgeBase ?? []

      if (stepEntries.length === 0) {
        output.error({
          code: 'STEP_NO_ENTRIES',
          message: `Step '${target}' has no knowledge-base entries`,
          exitCode: 1,
        })
        process.exit(1)
        return
      }

      if (argv.entry !== undefined) {
        if (!stepEntries.includes(argv.entry)) {
          output.error({
            code: 'ENTRY_NOT_IN_STEP',
            message: `Entry '${argv.entry}' is not in step '${target}'. Available: ${stepEntries.join(', ')}`,
            exitCode: 1,
          })
          process.exit(1)
          return
        }
        entryNames = [argv.entry]
      } else {
        entryNames = stepEntries
      }
    } else if (isEntryName) {
      entryNames = [target]
      if (isStepName) {
        process.stderr.write(
          `note: '${target}' is also a step name — use --step to update all entries for that step\n`,
        )
      }
    } else {
      // Not found — provide fuzzy suggestion
      const allCandidates = [...globalIndex.keys(), ...metaPrompts.keys()]
      const suggestion = findClosestMatch(target, allCandidates, 3)
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : ''
      output.error({ code: 'TARGET_NOT_FOUND', message: `Target '${target}' not found.${hint}`, exitCode: 1 })
      process.exit(1)
      return
    }

    // Config
    const { config } = loadConfig(projectRoot, [])
    const methodology = config?.methodology ?? 'deep'

    // Assemble prompts for each entry
    const template = loadTemplate()
    const assembler = new KnowledgeUpdateAssembler(template)
    const localIndex = buildIndex(localDir)

    for (const entryName of entryNames) {
      const globalFilePath = globalIndex.get(entryName)
      let globalBody = ''
      if (globalFilePath) {
        try {
          const content = fs.readFileSync(globalFilePath, 'utf8')
          // Strip frontmatter
          const lines = content.split('\n')
          if (lines[0]?.trim() === '---') {
            let closeIdx = -1
            for (let i = 1; i < lines.length; i++) {
              if (lines[i].trim() === '---') { closeIdx = i; break }
            }
            globalBody = closeIdx !== -1 ? lines.slice(closeIdx + 1).join('\n').trim() : content
          } else {
            globalBody = content
          }
        } catch {
          globalBody = ''
        }
      }

      // Check for local override
      let localOverrideContent: string | null = null
      const localEntryPath = localIndex.get(entryName)
      if (localEntryPath && fs.existsSync(localEntryPath)) {
        try {
          localOverrideContent = fs.readFileSync(localEntryPath, 'utf8')
        } catch {
          localOverrideContent = null
        }
      }

      // Scan docs/ for artifact files matching this entry name
      const docArtifacts: string[] = []
      const docsDir = path.join(projectRoot, 'docs')
      try {
        const docFiles = fs.readdirSync(docsDir)
        for (const docFile of docFiles) {
          if (docFile.endsWith('.md') && docFile.toLowerCase().includes(entryName.toLowerCase())) {
            try {
              const docContent = fs.readFileSync(path.join(docsDir, docFile), 'utf8')
              docArtifacts.push(docContent)
            } catch {
              // skip
            }
          }
        }
      } catch {
        // docs dir may not exist
      }

      const prompt = assembler.assemble({
        name: entryName,
        globalBody,
        localOverrideContent,
        methodology,
        artifacts: docArtifacts,
        focus: argv.instructions && argv.instructions.length > 0
          ? argv.instructions.join(' ')
          : null,
      })

      process.stdout.write(prompt + '\n')
    }

    process.exit(0)
  },
}

// -----------------------------------------------------------------------
// Top-level knowledge command
// -----------------------------------------------------------------------

const knowledgeCommand: CommandModule<Record<string, unknown>, Record<string, unknown>> = {
  command: 'knowledge <subcommand>',
  describe: 'Manage project-local knowledge base overrides',
  builder: (yargs) => {
    return yargs
      .command(listSubcommand)
      .command(showSubcommand)
      .command(resetSubcommand)
      .command(updateSubcommand)
      .demandCommand(1, 'Specify a subcommand: update, list, show, reset') as Argv<Record<string, unknown>>
  },
  handler: () => {
    // Handled by subcommands
  },
}

export default knowledgeCommand
