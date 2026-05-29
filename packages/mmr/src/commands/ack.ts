import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AckStore, FINDING_KEY_RE, type AckScope, type AckRecord } from '../core/ack-store.js'
import { JobStore } from '../core/job-store.js'
import { normalizeLocationForKey } from '../core/stable-id.js'
import { resolveJobsDir } from './sessions.js'
import type { ReconciledResults, ReconciledFinding } from '../types.js'

const JOB_ID_RE = /^mmr-[a-f0-9]{12}$/

interface AckArgs {
  action: string
  'finding-key'?: string
  job?: string
  reason?: string
  scope?: string
}

/** User home resolved the same way as MMR sessions/jobs (honors HOME override). */
function userHome(): string {
  return process.env.HOME ?? os.homedir()
}

// Generous upper bound on a results.json read. This is trusted MMR-written
// state under the user's MMR root, but cap it well above any realistic file
// so a pathological size can't be slurped whole into memory.
const MAX_RESULTS_BYTES = 16 * 1024 * 1024

function loadResults(store: JobStore, jobId: string): ReconciledResults | undefined {
  const fp = path.join(store.getJobDir(jobId), 'results.json')
  try {
    if (fs.statSync(fp).size > MAX_RESULTS_BYTES) return undefined
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as ReconciledResults
  } catch {
    return undefined // missing, oversized, or malformed → no source finding here
  }
}

/** Search for a reconciled finding matching the given key across recent jobs (newest first). */
function findSourceFinding(
  store: JobStore,
  key: string,
  jobHint?: string,
): { normalized_location: string; description_shingle: string[] } | undefined {
  const sources = jobHint ? [jobHint] : store.listJobs().map((j) => j.job_id)
  for (const jobId of sources) {
    const r = loadResults(store, jobId)
    // Guard against a malformed results.json whose reconciled_findings is
    // missing or not an array (would otherwise throw in the for-of below).
    if (!r || !Array.isArray(r.reconciled_findings)) continue
    for (const f of r.reconciled_findings as ReconciledFinding[]) {
      // Require a string location too: normalizeLocationForKey would throw on a
      // missing/undefined location in a malformed record.
      if (f.finding_key === key && typeof f.location === 'string' && f.description_shingle) {
        return {
          normalized_location: normalizeLocationForKey(f.location),
          description_shingle: f.description_shingle,
        }
      }
    }
  }
  return undefined
}

export const ackCommand: CommandModule<object, AckArgs> = {
  command: 'ack <action> [finding-key]',
  describe: 'Manage finding acknowledgments (T2-D)',
  builder: (yargs) =>
    yargs
      .positional('action', {
        type: 'string',
        choices: ['add', 'list', 'rm', 'prune'] as const,
        demandOption: true,
      })
      .positional('finding-key', { type: 'string' })
      .option('job', { type: 'string', describe: 'Job id to look up the source finding from' })
      .option('reason', { type: 'string', describe: 'Why this finding is being acked' })
      .option('scope', {
        type: 'string',
        choices: ['project', 'user'] as const,
        default: 'project',
        describe: 'Scope of the ack (project=./.mmr/acks, user=~/.mmr/acks)',
      }),
  handler: (args: ArgumentsCamelCase<AckArgs>) => {
    // The ack CLI is operator-driven on a trusted machine, so it manages both
    // project and user scopes directly (unlike the review gate, which gates
    // project acks behind trust). Scope selection is explicit via --scope.
    const ackStore = new AckStore({ projectRoot: process.cwd(), userHome: userHome() })

    if (args.action === 'list') {
      console.log(JSON.stringify(ackStore.listAll(), null, 2))
      return
    }

    if (args.action === 'prune') {
      // Prune is a no-op for v3.30 unless we add a stale-marker; emit a stub.
      console.log(JSON.stringify({ pruned: 0, note: 'prune is a no-op until stale-marker support lands' }, null, 2))
      return
    }

    const key = args['finding-key']
    if (!key) {
      console.error(`mmr ack ${args.action}: <finding-key> required`)
      process.exit(1)
    }
    if (!FINDING_KEY_RE.test(key)) {
      console.error(`Invalid finding_key: ${key} — must match ^[a-f0-9]{40}$`)
      process.exit(1)
    }

    const scope = (args.scope ?? 'project') as AckScope

    if (args.action === 'rm') {
      ackStore.remove(key, scope)
      console.log(JSON.stringify({ removed: key, scope }, null, 2))
      return
    }

    // Validate the optional --job hint before any path construction, mirroring
    // the finding_key check (getJobDir also guards against escape, but reject
    // early here for a clear operator error).
    if (args.job !== undefined && !JOB_ID_RE.test(args.job)) {
      console.error(`Invalid job id: ${args.job} — must match ^mmr-[a-f0-9]{12}$`)
      process.exit(1)
    }

    // add: need a source finding to capture location + shingle. Jobs live under
    // the MMR root (honors MMR_HOME), same as where review writes them.
    const jobStore = new JobStore(resolveJobsDir())
    const src = findSourceFinding(jobStore, key, args.job)
    if (!src) {
      const where = args.job ? ` (job=${args.job})` : ''
      console.error(`No reconciled finding with key ${key} found in recent jobs${where}.`)
      console.error('Tip: pass --job <id> if you know which job surfaced this finding.')
      process.exit(1)
    }

    const record: AckRecord = {
      finding_key: key,
      normalized_location: src.normalized_location,
      description_shingle: src.description_shingle,
      ...(args.reason !== undefined ? { reason: args.reason } : {}),
      created_at: new Date().toISOString(),
    }
    ackStore.add(record, scope)
    console.log(JSON.stringify({ added: key, scope }, null, 2))
  },
}
