import type { CommandModule } from 'yargs'
import { validateKnowledgeDir } from '../../validation/knowledge-frontmatter-validator.js'
import path from 'node:path'

async function runValidateKnowledge(): Promise<number> {
  const dir = path.resolve('content/knowledge')
  const results = validateKnowledgeDir(dir)
  let errorCount = 0
  let warnCount = 0
  for (const [file, r] of results) {
    for (const e of r.errors) { console.error(`[error] ${file}: ${e.message}`); errorCount++ }
    for (const w of r.warnings) { console.warn(`[warn]  ${file}: ${w.message}`); warnCount++ }
  }
  console.error(`\nknowledge validation: ${errorCount} error(s), ${warnCount} warning(s) across ${results.size} files`)
  return errorCount > 0 ? 1 : 0
}

const validateKnowledgeCommand: CommandModule = {
  command: 'validate-knowledge',
  describe: 'Validate frontmatter on all knowledge entries (volatility, last-reviewed, sources, version-pin)',
  builder: (y) => y,
  handler: async () => {
    const code = await runValidateKnowledge()
    process.exit(code)
  },
}

export default validateKnowledgeCommand
