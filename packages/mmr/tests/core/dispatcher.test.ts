import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dispatchChannel, isChannelComplete } from '../../src/core/dispatcher.js'
import { JobStore } from '../../src/core/job-store.js'

describe('dispatchChannel', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-dispatch-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('dispatches a channel process and writes PID file', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['test'] })
    store.savePrompt(job.job_id, 'Review this.')

    await dispatchChannel(store, job.job_id, 'test', {
      command: 'echo',
      prompt: '{"approved": true, "findings": [], "summary": "ok"}',
      flags: [],
      env: {},
      timeout: 10,
      stderr: 'capture',
    })

    // Wait for background process to complete
    await new Promise(resolve => setTimeout(resolve, 500))

    const pidFile = path.join(tmpDir, job.job_id, 'channels', 'test.pid')
    expect(fs.existsSync(pidFile)).toBe(true)
  })

  it('handles channel timeout', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['slow'] })
    store.savePrompt(job.job_id, 'Review this.')

    await dispatchChannel(store, job.job_id, 'slow', {
      command: 'sleep',
      prompt: '10',
      flags: [],
      env: {},
      timeout: 1,
      stderr: 'capture',
    })

    await new Promise(resolve => setTimeout(resolve, 1500))
    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.slow.status).toBe('timeout')
  })
})

describe('isChannelComplete', () => {
  it('returns true for completed status', () => {
    expect(isChannelComplete('completed')).toBe(true)
  })
  it('returns true for terminal statuses', () => {
    expect(isChannelComplete('timeout')).toBe(true)
    expect(isChannelComplete('failed')).toBe(true)
    expect(isChannelComplete('auth_failed')).toBe(true)
    expect(isChannelComplete('skipped')).toBe(true)
  })
  it('returns false for in-progress statuses', () => {
    expect(isChannelComplete('dispatched')).toBe(false)
    expect(isChannelComplete('running')).toBe(false)
  })
})
