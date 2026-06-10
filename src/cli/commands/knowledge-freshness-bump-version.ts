import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Argv, CommandModule } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { deriveBumpKind, bumpSemver } from '../../knowledge-freshness/bump-version.js'

interface BumpVersionArgs {
  title: string
  body: string
  count: number
}

// Local-only explainability subcommand. Reads content/knowledge/VERSION, derives
// the bump kind from a hypothetical PR title/body, and prints the planned diff.
// Does NOT modify VERSION — the workflow does that on actual PR merge.
const bumpVersionCommand: CommandModule<Record<string, unknown>, BumpVersionArgs> = {
  command: 'bump-version',
  describe: 'Dry-run a KB VERSION bump from a PR title/body (does not write VERSION)',
  builder: (y) =>
    y
      .option('title', {
        type: 'string',
        demandOption: true,
        describe: 'Simulated PR title (Conventional Commits flavored)',
      })
      .option('body', {
        type: 'string',
        default: '',
        describe: 'Simulated PR body (defaults to empty)',
      })
      .option('count', {
        type: 'number',
        default: 1,
        describe:
          'Catch-up multiplier for patch bumps (number of un-bumped refresh ' +
          'commits this run owes). Ignored for minor/major.',
      }) as unknown as Argv<BumpVersionArgs>,
  handler: (argv) => {
    const cwd = findProjectRoot(process.cwd()) ?? process.cwd()
    const versionPath = join(cwd, 'content', 'knowledge', 'VERSION')
    const current = readFileSync(versionPath, 'utf8').trim()
    const kind = deriveBumpKind(argv.title, argv.body)
    const next = bumpSemver(current, kind, argv.count)
    process.stdout.write(`current: ${current}\n`)
    process.stdout.write(`bump:    ${kind}\n`)
    process.stdout.write(`count:   ${argv.count}\n`)
    process.stdout.write(`next:    ${next}\n`)
  },
}

export default bumpVersionCommand
