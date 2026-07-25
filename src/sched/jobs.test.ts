import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SCHED_JOBS, buildPostMergePollerJob } from './jobs.js'
import type { PathProbes } from './path-resolver.js'

function probes(): PathProbes {
  return {
    home: '/Users/ken',
    execPath: '/opt/node/bin/node',
    exists: () => false,
    javaWorks: () => true,
  }
}

function projectWithPoller(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-jobs-'))
  fs.mkdirSync(path.join(root, 'scripts', 'ops'), { recursive: true })
  fs.writeFileSync(path.join(root, 'scripts', 'ops', 'post-merge-poller.sh'), '#!/bin/bash\n')
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(root, '.scaffold', 'agent-ops.yaml'), `project_name: ${name}\n`)
  return root
}

describe('buildPostMergePollerJob', () => {
  it('builds the job with absolute paths, com.<project>.merge-poller label, and 600s default', () => {
    const root = projectWithPoller('rumble')
    const job = buildPostMergePollerJob(root, { probes: probes() })
    expect(job.name).toBe('post-merge-poller')
    expect(job.label).toBe('com.rumble.merge-poller')
    expect(job.unitBase).toBe('scaffold-rumble-merge-poller')
    expect(job.programArguments).toEqual([path.join(root, 'scripts', 'ops', 'post-merge-poller.sh')])
    expect(job.intervalSeconds).toBe(600)
    expect(job.workingDirectory).toBe(root)
    expect(job.stdoutPath).toBe(path.join(root, '.mq', 'logs', 'post-merge-poller.out.log'))
    expect(job.stderrPath).toBe(path.join(root, '.mq', 'logs', 'post-merge-poller.err.log'))
    expect(job.environment.PATH).toBe('/opt/node/bin:/usr/bin:/bin:/usr/sbin:/sbin')
  })
  it('honors an interval override', () => {
    const root = projectWithPoller('rumble')
    expect(buildPostMergePollerJob(root, { intervalSeconds: 300, probes: probes() }).intervalSeconds).toBe(300)
  })
  it('throws with the install remediation when the poller script is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-jobs-'))
    expect(() => buildPostMergePollerJob(root, { probes: probes() }))
      .toThrow(/agent-ops install --component merge-queue/)
  })
  it('registry exposes post-merge-poller', () => {
    expect(Object.keys(SCHED_JOBS)).toEqual(['post-merge-poller'])
  })
})
