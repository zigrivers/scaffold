import fs from 'node:fs'
import path from 'node:path'
import type { Argv, CommandModule } from 'yargs'
import { lintUnsourcedClaims, parseUnifiedDiff } from '../../knowledge-freshness/gates/lint-unsourced.js'
import { resolveTargetFiles, gitDiffForFiles } from '../../knowledge-freshness/gates/changed-files.js'

interface LintUnsourcedArgs {
  files: string[]
  diff?: string
}

const lintUnsourcedCommand: CommandModule<Record<string, unknown>, LintUnsourcedArgs> = {
  command: 'lint-unsourced [files..]',
  describe: 'CI gate (advisory): warn on added normative claims with no nearby source link',
  builder: (y) => y
    .positional('files', {
      type: 'string',
      array: true,
      default: [],
      describe: 'Knowledge entry paths to scan (default: git diff origin/main...HEAD)',
    })
    .option('diff', {
      type: 'string',
      describe: 'Path to a unified diff file (default: compute from origin/main...HEAD)',
    })
    .option('files-from', {
      type: 'string',
      describe: 'Read file list from a JSON array file (avoids shell-injection via filenames)',
    }) as unknown as Argv<LintUnsourcedArgs>,
  handler: async (argv) => {
    const cwd = process.cwd()
    const argvAny = argv as unknown as Record<string, unknown>
    const filesFrom = (argvAny['files-from'] ?? argvAny.filesFrom) as string | undefined
    const files = resolveTargetFiles(argv.files ?? [], cwd, { filesFrom })
    if (files.length === 0) {
      process.stdout.write('lint-unsourced: no changed knowledge entries\n')
      return
    }
    // Diff source: explicit --diff file, or git-derived for the resolved files.
    const diffText = argv.diff
      ? fs.readFileSync(path.resolve(cwd, argv.diff), 'utf8')
      : gitDiffForFiles(cwd, files)
    const perFile = parseUnifiedDiff(diffText)
    // Build the lint inputs: each entry needs the post-change content and the
    // added-line list. Files in `files` but not in `perFile` are noops.
    const byFile = new Map(perFile.map((p) => [p.file, p.addedLines]))
    const inputs = files.map((abs) => {
      const rel = path.relative(cwd, abs)
      return {
        file: rel,
        content: fs.readFileSync(abs, 'utf8'),
        addedLines: byFile.get(rel) ?? [],
      }
    })
    const findings = lintUnsourcedClaims(inputs)
    for (const f of findings) {
      // ::warning:: is advisory — surfaces in the Files-changed tab but
      // doesn't fail the job (spec §A.5 explicit requirement).
      process.stdout.write(
        `::warning file=${f.file},line=${f.line}::unsourced-claim: ${f.reason} — "${f.text}"\n`,
      )
    }
    process.stdout.write(
      `lint-unsourced: ${findings.length} warning(s) across ${inputs.length} file(s) — advisory only\n`,
    )
  },
}

export default lintUnsourcedCommand
