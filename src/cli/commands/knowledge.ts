import type { Argv, CommandModule } from 'yargs'
import path from 'node:path'
import fs from 'node:fs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { buildIndex } from '../../core/assembly/knowledge-loader.js'

// -----------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------

function getProjectRoot(argv: { root?: string }): string | null {
  return argv.root ?? findProjectRoot(process.cwd())
}

function readFrontmatterDescription(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const match = content.match(/^---\n[\s\S]*?description:\s*(.+?)\n[\s\S]*?---/)
    return match?.[1]?.trim() ?? ''
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

    const globalDir = path.join(projectRoot, 'knowledge')
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
      return
    }

    if (entries.length === 0) {
      output.log('No knowledge entries found.')
      process.exit(0)
      return
    }

    const nameWidth = Math.max(4, ...entries.map((e) => e.name.length)) + 2
    const sourceWidth = 16
    const header = 'NAME'.padEnd(nameWidth) + 'SOURCE'.padEnd(sourceWidth) + 'DESCRIPTION'
    output.log(header)
    output.log('-'.repeat(header.length))
    for (const e of entries) {
      const sourceLabel = e.source === 'local' ? 'local override' : 'global'
      output.log(e.name.padEnd(nameWidth) + sourceLabel.padEnd(sourceWidth) + e.description)
    }
    process.exit(0)
  },
}

// -----------------------------------------------------------------------
// Top-level knowledge command (other subcommands added in Tasks 4-6)
// -----------------------------------------------------------------------

const knowledgeCommand: CommandModule<Record<string, unknown>, Record<string, unknown>> = {
  command: 'knowledge <subcommand>',
  describe: 'Manage project-local knowledge base overrides',
  builder: (yargs) => {
    return yargs
      .command(listSubcommand)
      .demandCommand(1, 'Specify a subcommand: update, list, show, reset')
      .strict() as Argv<Record<string, unknown>>
  },
  handler: () => {
    // Handled by subcommands
  },
}

export default knowledgeCommand
