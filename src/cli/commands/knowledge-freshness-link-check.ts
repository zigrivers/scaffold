import fs from 'node:fs'
import path from 'node:path'
import type { CommandModule } from 'yargs'
import { parseEntry } from '../../knowledge-freshness/gates/parse-entry.js'
import { checkUrlsForEntries } from '../../knowledge-freshness/gates/link-check.js'
import { resolveTargetFiles, loadLinkCheckSkip } from '../../knowledge-freshness/gates/changed-files.js'

interface LinkCheckArgs {
  files: string[]
}

const linkCheckCommand: CommandModule<Record<string, unknown>, LinkCheckArgs> = {
  command: 'link-check [files..]',
  describe: 'CI gate: verify every sources[*].url in changed knowledge entries returns 2xx',
  builder: (y) => y.positional('files', {
    type: 'string',
    array: true,
    default: [],
    describe: 'Knowledge entry paths to check (default: git diff origin/main...HEAD)',
  }),
  handler: async (argv) => {
    const cwd = process.cwd()
    const files = resolveTargetFiles(argv.files ?? [], cwd)
    if (files.length === 0) {
      process.stdout.write('link-check: no changed knowledge entries — gate passes trivially\n')
      return
    }
    const skip = loadLinkCheckSkip(cwd)
    const entries: Array<{ file: string; sourceUrls: string[] }> = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      const parsed = parseEntry(content)
      entries.push({ file: path.relative(cwd, file), sourceUrls: parsed.sourceUrls })
    }
    const { ok, results } = await checkUrlsForEntries(entries, { skip })
    for (const r of results) {
      if (r.skipped) {
        process.stdout.write(`SKIP ${r.url} (${r.file}) — operator opt-out\n`)
      } else if (r.ok) {
        process.stdout.write(`OK   ${r.url} (${r.file}) [${r.status}]\n`)
      } else {
        // GitHub annotation so the gate failure surfaces inline on the PR.
        process.stdout.write(
          `::error file=${r.file}::link-check: ${r.url} — ${r.reason ?? `HTTP ${r.status}`}\n`,
        )
      }
    }
    if (!ok) {
      process.stdout.write('link-check: FAILED — at least one source URL did not return 2xx\n')
      process.exit(1)
    }
    process.stdout.write(`link-check: OK — ${results.length} URL(s) checked\n`)
  },
}

export default linkCheckCommand
