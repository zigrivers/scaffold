import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Argv, CommandModule } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { deriveBumpKind, bumpSemver, bumpSemverReplay } from '../../knowledge-freshness/bump-version.js'

interface BumpVersionArgs {
  title: string
  body: string
  count: number
  replayStdin: boolean
}

/**
 * Split a NUL-separated `git log -z --format=%B` stream into per-commit messages,
 * dropping empties. NUL is used (not newline) because commit bodies are
 * multi-line.
 */
function parseNulMessages(raw: string): string[] {
  return raw.split('\0').map((m) => m.trim()).filter((m) => m.length > 0)
}

// Local-only explainability subcommand. Reads content/knowledge/VERSION and
// prints the planned next version. Does NOT modify VERSION — the workflow does
// that on actual PR merge.
//
// Two modes:
//   default       derive the bump kind from --title/--body and apply --count
//                 (patch catch-up multiplier).
//   --replay-stdin replay the per-commit kind of every un-bumped commit, read as
//                 a NUL-separated `git log -z --format=%B` stream on stdin. This
//                 handles a mixed batch correctly (a feat resets patch, etc.) and
//                 is what the version-bump workflow uses for catch-up.
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
          'commits this run owes). Ignored for minor/major and in --replay-stdin mode.',
      })
      .option('replay-stdin', {
        type: 'boolean',
        default: false,
        describe:
          'Replay the per-commit bump kind of every un-bumped commit, read as a ' +
          'NUL-separated `git log -z --format=%B` stream on stdin (correct for ' +
          'mixed feat/chore batches). Overrides --count.',
      }) as unknown as Argv<BumpVersionArgs>,
  handler: (argv) => {
    const cwd = findProjectRoot(process.cwd()) ?? process.cwd()
    const versionPath = join(cwd, 'content', 'knowledge', 'VERSION')
    const current = readFileSync(versionPath, 'utf8').trim()

    if (argv.replayStdin) {
      // fd 0 = stdin; readFileSync reads it fully and synchronously.
      const raw = readFileSync(0, 'utf8')
      const messages = parseNulMessages(raw)
      const kinds = messages.map((m) => {
        const nl = m.indexOf('\n')
        const title = nl === -1 ? m : m.slice(0, nl)
        const body = nl === -1 ? '' : m.slice(nl + 1)
        return deriveBumpKind(title, body)
      })
      const next = bumpSemverReplay(current, kinds)
      process.stdout.write(`current:  ${current}\n`)
      process.stdout.write(`replayed: ${kinds.length}\n`)
      process.stdout.write(`next:     ${next}\n`)
      return
    }

    const kind = deriveBumpKind(argv.title, argv.body)
    const next = bumpSemver(current, kind, argv.count)
    process.stdout.write(`current: ${current}\n`)
    process.stdout.write(`bump:    ${kind}\n`)
    process.stdout.write(`count:   ${argv.count}\n`)
    process.stdout.write(`next:    ${next}\n`)
  },
}

export default bumpVersionCommand
