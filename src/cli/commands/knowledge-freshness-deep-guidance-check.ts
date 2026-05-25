import fs from 'node:fs'
import path from 'node:path'
import type { CommandModule } from 'yargs'
import { checkDeepGuidance } from '../../knowledge-freshness/gates/deep-guidance-check.js'
import { resolveTargetFiles } from '../../knowledge-freshness/gates/changed-files.js'

interface DeepGuidanceArgs {
  files: string[]
}

const deepGuidanceCheckCommand: CommandModule<Record<string, unknown>, DeepGuidanceArgs> = {
  command: 'deep-guidance-check [files..]',
  describe: 'CI gate: every changed entry must retain the literal `## Deep Guidance` heading',
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
      process.stdout.write('deep-guidance-check: no changed knowledge entries\n')
      return
    }
    const inputs = files.map((abs) => ({
      file: path.relative(cwd, abs),
      content: fs.readFileSync(abs, 'utf8'),
    }))
    const findings = checkDeepGuidance(inputs)
    let anyFail = false
    for (const f of findings) {
      if (f.ok) {
        process.stdout.write(`OK ${f.file}\n`)
      } else {
        anyFail = true
        process.stdout.write(
          `::error file=${f.file}::deep-guidance-check: ${f.reason}\n`,
        )
      }
    }
    if (anyFail) {
      process.stdout.write('deep-guidance-check: FAILED\n')
      process.exit(1)
    }
    process.stdout.write('deep-guidance-check: OK\n')
  },
}

export default deepGuidanceCheckCommand
