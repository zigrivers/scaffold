import type { CommandModule } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { buildIndexWithOverrides, loadFullEntries } from '../../core/assembly/knowledge-loader.js'
import { getPackageKnowledgeDir } from '../../utils/fs.js'
import { selectAuditCandidates } from '../../knowledge-freshness/audit-prefilter.js'
import { fetchAndHash } from '../../knowledge-freshness/source-hash.js'

interface AuditPrefilterArgs {
  max: number
}

const auditPrefilterCommand: CommandModule<Record<string, unknown>, AuditPrefilterArgs> = {
  command: 'audit-prefilter',
  describe: 'List knowledge entries due for an audit (cadence + source-hash check)',
  builder: (y) => y
    .option('max', {
      type: 'number',
      default: 10,
      describe: 'Maximum number of candidates to return (daily ceiling)',
    }),
  handler: async (argv) => {
    const cwd = findProjectRoot(process.cwd()) ?? process.cwd()
    const kbIndex = buildIndexWithOverrides(cwd, getPackageKnowledgeDir(cwd))
    const allNames = [...kbIndex.keys()]
    const { entries } = loadFullEntries(kbIndex, allNames)
    const candidates = await selectAuditCandidates(entries, {
      now: new Date(),
      max: argv.max,
      fetch: fetchAndHash,
    })
    process.stdout.write(JSON.stringify(candidates.map((c) => c.name), null, 2) + '\n')
  },
}

export default auditPrefilterCommand
