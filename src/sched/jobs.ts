import fs from 'node:fs'
import path from 'node:path'
import { loadAgentOpsConfig } from '../core/agent-ops/config.js'
import { buildSchedPath, defaultProbes, type PathProbes } from './path-resolver.js'
import type { SchedJob } from './types.js'

export interface JobBuildOpts {
  intervalSeconds?: number
  /** Test seam — production callers omit it. */
  probes?: PathProbes
}

/** D6 first job: run the local-poller gate executor on an interval. All paths
 *  are resolved ABSOLUTE at build (= install) time; the environment is explicit
 *  because launchd/systemd run no shell init. */
export function buildPostMergePollerJob(projectRoot: string, opts: JobBuildOpts = {}): SchedJob {
  const script = path.join(projectRoot, 'scripts', 'ops', 'post-merge-poller.sh')
  if (!fs.existsSync(script)) {
    throw new Error(
      `${script} not found — install it first: scaffold agent-ops install --component merge-queue`,
    )
  }
  const project = loadAgentOpsConfig(projectRoot).project_name
  const probes = opts.probes ?? defaultProbes()
  return {
    name: 'post-merge-poller',
    label: `com.${project}.merge-poller`,
    unitBase: `scaffold-${project}-merge-poller`,
    programArguments: [script],
    intervalSeconds: opts.intervalSeconds ?? 600,
    workingDirectory: projectRoot,
    stdoutPath: path.join(projectRoot, '.mq', 'logs', 'post-merge-poller.out.log'),
    stderrPath: path.join(projectRoot, '.mq', 'logs', 'post-merge-poller.err.log'),
    environment: { PATH: buildSchedPath(probes) },
  }
}

export const SCHED_JOBS: Record<string, (projectRoot: string, opts?: JobBuildOpts) => SchedJob> = {
  'post-merge-poller': (root, opts) => buildPostMergePollerJob(root, opts),
}
