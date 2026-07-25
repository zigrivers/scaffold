// src/cli/commands/tia.ts — D14: test-impact analysis CLI.
//   tia affected --base <ref>  -> stdout: selected tests (one per line); exit 0
//                                 run them / exit 3 run the FULL suite instead
//   tia record-due             -> exit 0 when the poller should instrument this run
//   tia ingest ...             -> build .mq/tia/map.json from NODE_V8_COVERAGE dumps
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Argv, CommandModule } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadAgentOpsConfig } from '../../core/agent-ops/config.js'
import { createGitOps } from '../../merge-queue/git.js'
import { appendEvent, readJournal } from '../../merge-queue/journal.js'
import {
  TIA_DIR, TIA_LAST_RECORDED_DAY_FILE, buildTiaMap, hashContent, readTiaMap, writeTiaMap,
} from '../../tia/map.js'
import { selectAffected } from '../../tia/affected.js'

export interface TiaArgs {
  action: string
  base?: string
  coverageDir?: string
  head?: string
  seconds?: number
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

export async function tiaHandler(argv: TiaArgs): Promise<void> {
  const output = createOutputContext(resolveOutputMode(argv))
  const cwd = argv.root ?? process.cwd()
  const git = createGitOps(cwd)
  const primary = git.primaryRoot()
  const mqDir = path.join(primary, '.mq')

  switch (argv.action) {
  case 'affected': {
    if (!argv.base) {
      output.error('tia affected: --base <ref> is required')
      process.exitCode = 1
      return
    }
    try {
      const sh = (args: string[]): string =>
        execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 120_000 }).trim()
      const isAncestor = (ancestor: string, descendant: string): boolean => {
        try {
          execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
            cwd, stdio: 'ignore', timeout: 120_000,
          })
          return true
        } catch {
          return false
        }
      }
      const changedFiles = sh(['diff', '--name-only', `${argv.base}...HEAD`])
        .split('\n').map(l => l.trim()).filter(l => l !== '')
      const map = readTiaMap(mqDir)
      let commitDistance: number | null = null
      // Reviewer note (PR #783): `rev-list --count mapHead..HEAD` alone is not
      // enough — it counts commits reachable from HEAD but not mapHead, which
      // stays SMALL even when mapHead sits on a divergent branch that never
      // described HEAD's history. Require mapHead to be an actual ancestor of
      // HEAD before trusting the distance; otherwise treat it as unknown/stale
      // (routes to the full suite via the commitDistance===null branch below).
      if (map !== null && isAncestor(map.head_sha, 'HEAD')) {
        try {
          const distance = Number(sh(['rev-list', '--count', `${map.head_sha}..HEAD`]))
          commitDistance = Number.isFinite(distance) ? distance : null
        } catch {
          commitDistance = null
        }
      }
      const flakeCounts = new Map<string, number>()
      for (const e of readJournal(mqDir)) {
        if (e.type === 'flake') flakeCounts.set(e.testId, (flakeCounts.get(e.testId) ?? 0) + 1)
      }
      const selection = selectAffected({
        map,
        changedFiles,
        commitDistance,
        hashOf: rel => {
          const abs = path.join(cwd, rel)
          return fs.existsSync(abs) ? hashContent(fs.readFileSync(abs)) : null
        },
        flakeCounts,
      })
      if (argv.format === 'json') {
        output.result(selection)
      } else if (selection.verdict === 'selected') {
        // Raw, unprefixed stdout — the bash gate consumer reads this as a plain
        // test-file list (one per line), so it must not go through output.info's
        // formatting/prefixing.
        process.stdout.write(selection.tests.join('\n') + '\n')
      } else {
        process.stderr.write(`tia: full suite recommended — ${selection.reason}\n`)
      }
      if (selection.verdict !== 'selected') process.exitCode = 3
    } catch (err) {
      // CRITICAL: any thrown error (bad ref, unreadable map, unexpected
      // exception) must fail closed to the full suite — NEVER exit 0 with a
      // narrow list. Under-selecting on error would let a regression through.
      const message = err instanceof Error ? err.message : String(err)
      output.error(`tia affected: ${message} — run the full suite`)
      process.exitCode = 3
    }
    return
  }
  case 'record-due': {
    const record = loadAgentOpsConfig(primary).merge_queue.tia.record
    if (record === 'off') {
      process.exitCode = 1
      return
    }
    if (record === 'always') return
    // scheduled: first pass per UTC day.
    const marker = path.join(mqDir, TIA_DIR, TIA_LAST_RECORDED_DAY_FILE)
    const today = new Date().toISOString().slice(0, 10)
    const last = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : ''
    if (last === today) process.exitCode = 1
    return
  }
  case 'ingest': {
    if (!argv.coverageDir || !argv.head) {
      output.error('tia ingest: --coverage-dir <dir> and --head <sha> are required')
      process.exitCode = 1
      return
    }
    // `tia ingest` recursively removes the dump dir. It is a real (hidden) CLI
    // verb, so a typo or hostile --coverage-dir must never let fs.rmSync escape
    // the TIA workspace and delete an arbitrary directory (project root, $HOME,
    // /). Confine it to a STRICT descendant of <primary>/.mq/tia/, canonicalized
    // (realpath) to defeat traversal and symlink escapes.
    fs.mkdirSync(path.join(mqDir, TIA_DIR), { recursive: true })
    const covDir = resolveTiaDumpDir(argv.coverageDir, mqDir, cwd)
    if (covDir === null) {
      output.error(
        `tia ingest: --coverage-dir must be a directory inside ${path.join(mqDir, TIA_DIR)} — ` +
        `refusing to remove ${argv.coverageDir}`,
      )
      process.exitCode = 1
      return
    }
    const at = new Date().toISOString()
    const map = buildTiaMap({
      coverageDir: covDir,
      projectRoot: cwd,
      headSha: argv.head,
      seconds: argv.seconds ?? 0,
      now: at,
    })
    writeTiaMap(mqDir, map)
    fs.writeFileSync(
      path.join(mqDir, TIA_DIR, TIA_LAST_RECORDED_DAY_FILE), at.slice(0, 10) + '\n',
    )
    appendEvent(mqDir, {
      type: 'tia_recorded', headSha: argv.head, seconds: argv.seconds ?? 0,
      tests: Object.keys(map.tests).length, files: Object.keys(map.file_hashes).length, at,
    })
    fs.rmSync(covDir, { recursive: true, force: true })
    output.success(
      `tia: recorded ${Object.keys(map.tests).length} test file(s) covering ` +
      `${Object.keys(map.file_hashes).length} file(s)`,
    )
    return
  }
  default:
    output.error(`unknown tia action "${argv.action}"`)
    process.exitCode = 1
  }
}

/** Resolve `--coverage-dir` to a canonical path that is a STRICT descendant of
 *  <primary>/.mq/tia/, defeating `..` traversal and symlink escapes. Returns
 *  null (caller errors out; nothing is removed) for anything outside — an
 *  absolute path, the project root, $HOME, the TIA dir itself, or a symlink
 *  whose target escapes the workspace. */
function resolveTiaDumpDir(coverageDir: string, mqDir: string, cwd: string): string | null {
  let realTiaRoot: string
  try {
    realTiaRoot = fs.realpathSync(path.join(mqDir, TIA_DIR))
  } catch {
    return null // no .mq/tia workspace -> nothing legitimate to ingest
  }
  let realCov: string
  try {
    // realpath resolves symlinks in the FULL path, so a link that points
    // outside the workspace resolves to its outside target and is rejected.
    realCov = fs.realpathSync(path.resolve(cwd, coverageDir))
  } catch {
    return null // the dump dir must exist to be ingested (and removed)
  }
  const rel = path.relative(realTiaRoot, realCov)
  // Strict descendant: non-empty, not the dir itself, no `..`, not absolute.
  const strictDescendant = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  return strictDescendant ? realCov : null
}

const tiaCommand: CommandModule<Record<string, unknown>, TiaArgs> = {
  command: 'tia <action>',
  describe: 'Test-impact analysis: coverage-map recording and affected-test selection',
  builder: (yargs: Argv) => {
    return yargs
      .positional('action', {
        describe: 'Action to perform',
        choices: ['affected', 'record-due', 'ingest'] as const,
        type: 'string',
        demandOption: true,
      })
      .option('base', { type: 'string', describe: 'Base ref to diff against (affected)' })
      .option('coverage-dir', {
        type: 'string', hidden: true, describe: 'NODE_V8_COVERAGE dump directory (ingest)',
      })
      .option('head', {
        type: 'string', hidden: true, describe: 'Head sha the map was recorded at (ingest)',
      })
      .option('seconds', {
        type: 'number', hidden: true, describe: 'Instrumented run wall-clock seconds (ingest)',
      })
      // Same rationale as mq: the poller invokes `tia ... --root` indirectly via
      // worktrees; declaring it per-command keeps the strict parser happy.
      .option('root', { type: 'string', hidden: true, describe: 'Project root directory' })
  },
  handler: tiaHandler,
}

export default tiaCommand
