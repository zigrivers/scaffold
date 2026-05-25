import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Argv, CommandModule } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { deriveBumpKind, bumpSemver } from '../../knowledge-freshness/bump-version.js'

interface BumpVersionArgs {
  title: string
  body: string
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
      }) as unknown as Argv<BumpVersionArgs>,
  handler: (argv) => {
    const cwd = findProjectRoot(process.cwd()) ?? process.cwd()
    const versionPath = join(cwd, 'content', 'knowledge', 'VERSION')
    const current = readFileSync(versionPath, 'utf8').trim()
    const kind = deriveBumpKind(argv.title, argv.body)
    const next = bumpSemver(current, kind)
    process.stdout.write(`current: ${current}\n`)
    process.stdout.write(`bump:    ${kind}\n`)
    process.stdout.write(`next:    ${next}\n`)
  },
}

export default bumpVersionCommand
