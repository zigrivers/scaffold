import fs from 'node:fs'
import path from 'node:path'
import type { Argv, CommandModule } from 'yargs'
import {
  evaluateChurn,
  parseUnifiedDiffForChurn,
  splitChurnByRegion,
} from '../../knowledge-freshness/gates/anti-over-rewrite.js'
import {
  resolveTargetFiles,
  gitDiffForFiles,
} from '../../knowledge-freshness/gates/changed-files.js'

interface AntiOverRewriteArgs {
  files: string[]
  diff?: string
  prLabels?: string
}

const antiOverRewriteCommand: CommandModule<Record<string, unknown>, AntiOverRewriteArgs> = {
  command: 'anti-over-rewrite [files..]',
  describe: 'CI gate: fail if a stable entry has >20% line churn without an explicit PR-body override',
  builder: (y) => y
    .positional('files', {
      type: 'string',
      array: true,
      default: [],
      describe: 'Knowledge entry paths to check (default: git diff origin/main...HEAD)',
    })
    .option('diff', {
      type: 'string',
      describe: 'Path to a unified diff file (default: git diff origin/main...HEAD)',
    })
    .option('pr-labels', {
      type: 'string',
      describe:
        'Comma-separated list of labels currently on the PR. The gate honors the ' +
        'literal label `override:anti-over-rewrite` (F-005). PR-body markers are NOT honored ' +
        'because they can be prompt-injected via LLM-generated verdict text.',
    })
    .option('files-from', {
      type: 'string',
      describe: 'Read file list from a JSON array file (avoids shell-injection via filenames)',
    }) as unknown as Argv<AntiOverRewriteArgs>,
  handler: async (argv) => {
    const cwd = process.cwd()
    const argvAnyOpt = argv as unknown as Record<string, unknown>
    const filesFromOpt = (argvAnyOpt['files-from'] ?? argvAnyOpt.filesFrom) as string | undefined
    const files = resolveTargetFiles(argv.files ?? [], cwd, { filesFrom: filesFromOpt })
    if (files.length === 0) {
      process.stdout.write('anti-over-rewrite: no changed knowledge entries\n')
      return
    }
    const diffText = argv.diff
      ? fs.readFileSync(path.resolve(cwd, argv.diff), 'utf8')
      : gitDiffForFiles(cwd, files)
    // Labels can be passed explicitly via --pr-labels (CI sets it from
    // github.event.pull_request.labels). The override label must be applied
    // by a human with write access — that's the trust anchor (F-005).
    const argvAny = argv as unknown as Record<string, unknown>
    const labelsArg = (argvAny['pr-labels'] ?? argvAny.prLabels) as string | undefined
    const prLabels = labelsArg ? labelsArg.split(',').map((s) => s.trim()).filter((s) => s) : []
    const churn = parseUnifiedDiffForChurn(diffText)
    const byFile = new Map(churn.map((c) => [c.file, c]))
    // Round-7 F-001: derive body-only churn via a line-number-based split
    // using the actual post-change content (not a diff-content state
    // machine). Build the file-content map once.
    const contentMap = new Map<string, string>()
    for (const abs of files) {
      contentMap.set(path.relative(cwd, abs), fs.readFileSync(abs, 'utf8'))
    }
    const bodyByFile = splitChurnByRegion(diffText, contentMap)
    const inputs = files.map((abs) => {
      const rel = path.relative(cwd, abs)
      const c = byFile.get(rel)
      const body = bodyByFile.get(rel)
      return {
        file: rel,
        content: contentMap.get(rel) ?? '',
        addedCount: c?.addedCount ?? 0,
        removedCount: c?.removedCount ?? 0,
        bodyAddedCount: body?.bodyAddedCount ?? 0,
        bodyRemovedCount: body?.bodyRemovedCount ?? 0,
      }
    })
    const results = evaluateChurn(inputs, { prLabels })
    let anyBlock = false
    for (const r of results) {
      const pct = (r.churnPct * 100).toFixed(1)
      const summary =
        `volatility=${r.volatility ?? 'unknown'} ` +
        `churn=${r.addedCount}+/${r.removedCount}- (${pct}% of ${r.totalLines})`
      if (r.blocking) {
        anyBlock = true
        process.stdout.write(
          `::error file=${r.file}::anti-over-rewrite: ${summary} exceeds 20% threshold ` +
          'for stable entry (apply the `override:anti-over-rewrite` label as a maintainer ' +
          'with write access to bypass)\n',
        )
      } else if (r.overridden) {
        process.stdout.write(
          `::notice file=${r.file}::anti-over-rewrite: ${summary} OVERRIDDEN by maintainer label\n`,
        )
      } else if (r.volatility !== 'stable' && r.churnPct > 0.2) {
        process.stdout.write(
          `::notice file=${r.file}::anti-over-rewrite: ${summary} (advisory — non-stable entry)\n`,
        )
      } else {
        process.stdout.write(`OK ${r.file} — ${summary}\n`)
      }
    }
    if (anyBlock) {
      process.stdout.write('anti-over-rewrite: FAILED — stable entry rewritten beyond threshold\n')
      process.exit(1)
    }
    process.stdout.write('anti-over-rewrite: OK\n')
  },
}

export default antiOverRewriteCommand
