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
      coerce: (value: number) => {
        // Guard against negative / fractional / zero. `slice(0, -1)` would
        // bypass the ceiling silently by returning all-but-last; clamp to a
        // positive integer (round-2 F-003).
        if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
          throw new Error(`--max must be a positive integer; got ${value}`)
        }
        return value
      },
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
    // Emit `{ name, path }` so downstream `audit-run-entry` (which takes a
    // filesystem path, not a name) can be invoked directly from this output
    // without a separate name→path resolution step.
    const out = candidates.map((c) => ({ name: c.name, path: kbIndex.get(c.name) ?? null }))
    process.stdout.write(JSON.stringify(out, null, 2) + '\n')
  },
}

export default auditPrefilterCommand
