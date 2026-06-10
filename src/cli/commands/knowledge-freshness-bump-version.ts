import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Argv, CommandModule } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { deriveBumpKind, bumpSemver } from '../../knowledge-freshness/bump-version.js'
import type { BumpKind } from '../../knowledge-freshness/bump-version.js'

interface BumpVersionArgs {
  title: string
  body: string
  count: number
  kind?: string
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
      })
      .option('kind', {
        type: 'string',
        choices: ['patch', 'minor', 'major'],
        describe:
          'Override the bump kind (defaults to deriving it from --title/--body). ' +
          'The catch-up path passes this when the un-bumped range contains a ' +
          'feat/BREAKING commit, so the batch is not flattened to patches.',
      }) as unknown as Argv<BumpVersionArgs>,
  handler: (argv) => {
    const cwd = findProjectRoot(process.cwd()) ?? process.cwd()
    const versionPath = join(cwd, 'content', 'knowledge', 'VERSION')
    const current = readFileSync(versionPath, 'utf8').trim()
    const kind: BumpKind = (argv.kind as BumpKind | undefined) ?? deriveBumpKind(argv.title, argv.body)
    const next = bumpSemver(current, kind, argv.count)
    process.stdout.write(`current: ${current}\n`)
    process.stdout.write(`bump:    ${kind}\n`)
    process.stdout.write(`count:   ${argv.count}\n`)
    process.stdout.write(`next:    ${next}\n`)
  },
}

export default bumpVersionCommand
